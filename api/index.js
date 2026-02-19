// Dashboard/api/index.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();

const SECRET_KEY = process.env.SECRET_KEY; 
const MONGO_URI = process.env.MONGO_URI;

// As credenciais agora vêm EXCLUSIVAMENTE das variáveis de ambiente do Vercel
const MASTER_USER = process.env.MASTER_USER; 
const MASTER_PASS = process.env.MASTER_PASS;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'comprovantes',
        allowed_formats: ['jpg', 'png', 'pdf', 'jpeg'],
        transformation: [{ width: 1000, crop: "limit", quality: "auto" }],
        public_id: (req, file) => {
            let name = file.originalname.substring(0, file.originalname.lastIndexOf('.')) || file.originalname;
            name = name.replace(/\s+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, "");
            return `${name}_${Date.now()}`;
        }
    },
});
const upload = multer({ storage: storage });

const storagePerfil = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'perfil_membros',
        allowed_formats: ['jpg', 'png', 'jpeg'],
        transformation: [{ width: 300, height: 300, crop: "fill", gravity: "face", quality: "auto" }]
    },
});
const uploadPerfil = multer({ storage: storagePerfil });

app.use(cors());
app.use(bodyParser.json());

let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try {
        await mongoose.connect(MONGO_URI, { maxPoolSize: 10 });
        isConnected = true;
    } catch (err) {
        console.error("Erro MongoDB:", err.message);
    }
};

app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// --- SCHEMAS ---

const ConfigSchema = new mongoose.Schema({
    // Se true, admins comuns podem fazer. Se false, só o Master.
    allowDeleteTransaction: { type: Boolean, default: true },
    allowEditTransaction: { type: Boolean, default: true },
    allowDeleteMember: { type: Boolean, default: true },
    allowEditChurchInfo: { type: Boolean, default: true },
    allowExportPDF: { type: Boolean, default: true },
    allowManageAdmins: { type: Boolean, default: false } // Default false por segurança
});
const Config = mongoose.models.Config || mongoose.model('Config', ConfigSchema);

const TransacaoSchema = new mongoose.Schema({
    descricao: { type: String, index: true },
    valor: { type: Number, required: true },
    tipo: { type: String, required: true },
    data: { type: Date, required: true, index: true },
    comprovanteUrl: String
});
const Transacao = mongoose.models.Transacao || mongoose.model('Transacao', TransacaoSchema);

const Membro = mongoose.models.Membro || mongoose.model('Membro', new mongoose.Schema({
    nome: { type: String, required: true, unique: true },
    cpf: { type: String },
    telefone: { type: String },
    endereco: { type: String },
    dataNascimento: { type: String },
    fotoPerfilUrl: { type: String },
    isAdministrador: { type: Boolean, default: false },
    usuario: { type: String },
    senha: { type: String }
}));

const Igreja = mongoose.models.Igreja || mongoose.model('Igreja', new mongoose.Schema({
    razaoSocial: String,
    nomeFantasia: String,
    cnpj: String,
    email: String,
    telefone: String,
    endereco: String,
    cidade: String,
    estado: String,
    cep: String,
    dataFundacao: String
}));

// --- MIDDLEWARES E HELPERS ---

const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(403).json({ error: "Token não fornecido" });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Sessão expirada" });
        req.userId = decoded.id;
        // Verifica se é o Master User baseado no ID do token (que é o nome do usuário mestre)
        req.isMaster = (decoded.id === MASTER_USER);
        next();
    });
};

// Middleware para checar permissão dinâmica
const checkPerm = (permName) => {
    return async (req, res, next) => {
        // Se for Master, passa direto
        if (req.isMaster) return next();

        // Se for Admin comum, checa no banco
        try {
            let config = await Config.findOne();
            if (!config) config = await new Config().save(); // Cria default se não existir

            if (config[permName]) {
                next(); // Permissão ativada para admins
            } else {
                res.status(403).json({ error: "Função restrita ao Usuário Mestre." });
            }
        } catch (err) {
            res.status(500).json({ error: "Erro ao verificar permissões." });
        }
    };
};

// --- ROTAS ---

app.get('/api/ping', (req, res) => res.json({ status: "online" }));

app.post('/api/login', async (req, res) => {
    let { usuario, senha } = req.body;
    
    if (!usuario || !senha) return res.status(400).json({ error: "Dados incompletos" });

    usuario = usuario.trim();
    senha = senha.trim();
    
    // Verificação Master
    if (usuario.toLowerCase() === MASTER_USER.toLowerCase() && senha === MASTER_PASS) {
        const token = jwt.sign({ id: usuario }, SECRET_KEY, { expiresIn: '24h' });
        return res.json({ auth: true, token, isMaster: true });
    }
    
    // Verificação Admin Comum
    try {
        const admin = await Membro.findOne({ 
            usuario: { $regex: new RegExp(`^${usuario}$`, 'i') }, 
            isAdministrador: true 
        }).lean();

        if (admin && await bcrypt.compare(senha, admin.senha)) {
            const token = jwt.sign({ id: admin._id }, SECRET_KEY, { expiresIn: '24h' });
            return res.json({ auth: true, token, isMaster: false });
        }
    } catch (err) { return res.status(500).json({ error: "Erro interno" }); }
    
    res.status(401).json({ error: "Credenciais inválidas" });
});

app.post('/api/verify-master', verificarToken, (req, res) => {
    const { senha } = req.body;
    if (senha && senha.trim() === MASTER_PASS) {
        return res.json({ success: true });
    }
    res.status(401).json({ error: "Senha mestre incorreta" });
});

// --- Rotas de Configuração (NOVO) ---
app.get('/api/config', verificarToken, async (req, res) => {
    try {
        let config = await Config.findOne();
        if (!config) config = await new Config().save();
        res.json(config);
    } catch (e) { res.status(500).json({ error: "Erro configs" }); }
});

app.put('/api/config', verificarToken, async (req, res) => {
    if (!req.isMaster) return res.status(403).json({ error: "Apenas Master pode alterar configurações." });
    try {
        // Garante que existe apenas um documento de config
        let config = await Config.findOne();
        if (!config) {
            await new Config(req.body).save();
        } else {
            await Config.findOneAndUpdate({}, req.body);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erro ao salvar configs" }); }
});

// --- Membros ---

app.get('/api/membros', verificarToken, async (req, res) => {
    res.json(await Membro.find({}, '-senha').sort({ nome: 1 }).lean());
});

app.post('/api/membros', verificarToken, uploadPerfil.single('fotoPerfil'), async (req, res) => {
    // Se tentar criar admin, verifica permissão 'allowManageAdmins'
    if (req.body.isAdministrador === 'true' && !req.isMaster) {
        let config = await Config.findOne();
        if (!config || !config.allowManageAdmins) {
            return res.status(403).json({ error: "Você não tem permissão para criar Administradores." });
        }
    }

    const { nome, cpf, telefone, endereco, dataNascimento, isAdministrador, usuario, senha } = req.body;
    const fotoPerfilUrl = req.file ? req.file.path : null;
    
    try {
        let hashedSenha = null;
        if (isAdministrador === 'true' && senha) {
            hashedSenha = await bcrypt.hash(senha.trim(), 10);
        }

        const novo = await new Membro({ 
            nome, cpf, telefone, endereco, dataNascimento, fotoPerfilUrl,
            isAdministrador: isAdministrador === 'true',
            usuario: isAdministrador === 'true' ? usuario.trim() : null,
            senha: hashedSenha
        }).save();
        res.status(201).json(novo);
    } catch (err) {
        res.status(400).json({ error: "Erro ao salvar membro." });
    }
});

// Edit Membro - Protegido se tentar alterar status de admin
app.put('/api/membros/:id', verificarToken, uploadPerfil.single('fotoPerfil'), async (req, res) => {
    const { isAdministrador, usuario, senha, nome, cpf, telefone, endereco, dataNascimento } = req.body;

    // Logica de permissão para gerenciar admins
    if (isAdministrador === 'true' || req.body.isAdministrador === true) {
        if (!req.isMaster) {
            let config = await Config.findOne();
            if (!config || !config.allowManageAdmins) {
                return res.status(403).json({ error: "Permissão negada para gerenciar Administradores." });
            }
        }
    }

    try {
        const membroAtual = await Membro.findById(req.params.id);
        if (!membroAtual) return res.status(404).json({ error: "Membro não encontrado" });

        let fotoPerfilUrl = membroAtual.fotoPerfilUrl;
        if (req.file) {
            if (membroAtual.fotoPerfilUrl) {
                const publicId = `perfil_membros/${membroAtual.fotoPerfilUrl.split('/').pop().split('.')[0]}`;
                await cloudinary.uploader.destroy(publicId).catch(console.error);
            }
            fotoPerfilUrl = req.file.path;
        }

        let updateData = { 
            nome, cpf, telefone, endereco, dataNascimento, fotoPerfilUrl,
            isAdministrador: isAdministrador === 'true'
        };

        if (updateData.isAdministrador) {
            updateData.usuario = usuario ? usuario.trim() : usuario;
            if (senha) { 
                updateData.senha = await bcrypt.hash(senha.trim(), 10);
            }
        } else {
            updateData.usuario = null;
            updateData.senha = null;
        }

        const atualizado = await Membro.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(atualizado);
    } catch (err) {
        res.status(500).json({ error: "Erro ao atualizar membro" });
    }
});

// Delete Membro - Protegido pela flag allowDeleteMember
app.delete('/api/membros/:id', verificarToken, checkPerm('allowDeleteMember'), async (req, res) => {
    const membro = await Membro.findByIdAndDelete(req.params.id);
    if (membro?.fotoPerfilUrl) {
        const publicId = `perfil_membros/${membro.fotoPerfilUrl.split('/').pop().split('.')[0]}`;
        await cloudinary.uploader.destroy(publicId).catch(console.error);
    }
    res.json({ success: true });
});

app.get('/api/membros/historico/:nome', verificarToken, async (req, res) => {
    try {
        const historico = await Transacao.find({ 
            descricao: { $regex: req.params.nome, $options: 'i' } 
        }).sort({ data: -1 }).lean();
        res.json(historico);
    } catch (err) { res.status(500).json({ error: "Erro busca" }); }
});

// --- Transações ---

app.get('/api/transacoes', verificarToken, async (req, res) => {
    const { ano, mes } = req.query;
    const start = new Date(Date.UTC(ano, mes, 1));
    const end = new Date(Date.UTC(ano, parseInt(mes) + 1, 0, 23, 59, 59));

    const transacoes = await Transacao.find({
        data: { $gte: start, $lte: end }
    }).sort({ data: -1 }).lean();
    res.json(transacoes);
});

app.post('/api/transacoes', verificarToken, upload.single('comprovante'), async (req, res) => {
    const nova = await new Transacao({
        descricao: req.body.descricao,
        valor: parseFloat(req.body.valor),
        tipo: req.body.tipo,
        data: new Date(req.body.dataManual),
        comprovanteUrl: req.file ? req.file.path : null
    }).save();
    res.status(201).json(nova);
});

// Edit Transação - Protegido
app.put('/api/transacoes/:id', verificarToken, checkPerm('allowEditTransaction'), async (req, res) => {
    const atualizada = await Transacao.findByIdAndUpdate(
        req.params.id,
        {
            descricao: req.body.descricao,
            valor: parseFloat(req.body.valor),
            tipo: req.body.tipo,
            data: new Date(req.body.dataManual)
        },
        { new: true }
    );
    res.json(atualizada);
});

// Delete Transação - Protegido
app.delete('/api/transacoes/:id', verificarToken, checkPerm('allowDeleteTransaction'), async (req, res) => {
    const transacao = await Transacao.findByIdAndDelete(req.params.id);
    if (transacao?.comprovanteUrl) {
        const publicId = `comprovantes/${transacao.comprovanteUrl.split('/').pop().split('.')[0]}`;
        await cloudinary.uploader.destroy(publicId).catch(console.error);
    }
    res.json({ success: true });
});

// --- Igreja ---

app.get('/api/igreja', verificarToken, async (req, res) => {
    try {
        let dados = await Igreja.findOne();
        if (!dados) dados = {};
        res.json(dados);
    } catch (err) { res.status(500).json({ error: "Erro ao buscar dados" }); }
});

// Edit Igreja - Protegido
app.post('/api/igreja', verificarToken, checkPerm('allowEditChurchInfo'), async (req, res) => {
    try {
        let dados = await Igreja.findOne();
        if (dados) {
            await Igreja.findByIdAndUpdate(dados._id, req.body);
        } else {
            await new Igreja(req.body).save();
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Erro ao salvar dados" }); }
});

module.exports = app;