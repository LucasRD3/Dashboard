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
        console.log("Conectado ao MongoDB (Coleção Única)");
    } catch (err) {
        console.error("Erro MongoDB:", err.message);
    }
};

app.use(async (req, res, next) => {
    await connectDB();
    next();
});

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

const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(403).json({ error: "Token não fornecido" });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Sessão expirada" });
        req.userId = decoded.id;
        next();
    });
};

app.get('/api/ping', (req, res) => res.json({ status: "online" }));

app.post('/api/login', async (req, res) => {
    const { usuario, senha } = req.body;
    
    if (usuario === "IADEV" && senha === "1234") {
        const token = jwt.sign({ id: usuario }, SECRET_KEY, { expiresIn: '24h' });
        return res.json({ auth: true, token });
    }
    
    try {
        const admin = await Membro.findOne({ usuario, isAdministrador: true }).lean();
        if (admin && await bcrypt.compare(senha, admin.senha)) {
            const token = jwt.sign({ id: admin._id }, SECRET_KEY, { expiresIn: '24h' });
            return res.json({ auth: true, token });
        }
    } catch (err) { return res.status(500).json({ error: "Erro interno" }); }
    
    res.status(401).json({ error: "Credenciais inválidas" });
});

app.post('/api/verify-master', verificarToken, (req, res) => {
    const { senha } = req.body;
    if (senha === "1234") {
        return res.json({ success: true });
    }
    res.status(401).json({ error: "Senha mestre incorreta" });
});

app.get('/api/membros', verificarToken, async (req, res) => {
    res.json(await Membro.find({}, '-senha').sort({ nome: 1 }).lean());
});

app.post('/api/membros', verificarToken, uploadPerfil.single('fotoPerfil'), async (req, res) => {
    const { nome, cpf, telefone, endereco, dataNascimento, isAdministrador, usuario, senha } = req.body;
    const fotoPerfilUrl = req.file ? req.file.path : null;
    
    try {
        let hashedSenha = null;
        if (isAdministrador === 'true' && senha) {
            hashedSenha = await bcrypt.hash(senha, 10);
        }

        const novo = await new Membro({ 
            nome, cpf, telefone, endereco, dataNascimento, fotoPerfilUrl,
            isAdministrador: isAdministrador === 'true',
            usuario: isAdministrador === 'true' ? usuario : null,
            senha: hashedSenha
        }).save();
        res.status(201).json(novo);
    } catch (err) {
        res.status(400).json({ error: "Erro ao salvar membro. Verifique se o nome não está duplicado." });
    }
});

app.put('/api/membros/:id', verificarToken, uploadPerfil.single('fotoPerfil'), async (req, res) => {
    const { nome, cpf, telefone, endereco, dataNascimento, isAdministrador, usuario, senha } = req.body;
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
            updateData.usuario = usuario;
            if (senha) { 
                updateData.senha = await bcrypt.hash(senha, 10);
            }
        } else {
            updateData.usuario = null;
            updateData.senha = null;
        }

        const atualizado = await Membro.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );
        res.json(atualizado);
    } catch (err) {
        res.status(500).json({ error: "Erro ao atualizar membro" });
    }
});

app.delete('/api/membros/:id', verificarToken, async (req, res) => {
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

app.put('/api/transacoes/:id', verificarToken, async (req, res) => {
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

app.delete('/api/transacoes/:id', verificarToken, async (req, res) => {
    const transacao = await Transacao.findByIdAndDelete(req.params.id);
    if (transacao?.comprovanteUrl) {
        const publicId = `comprovantes/${transacao.comprovanteUrl.split('/').pop().split('.')[0]}`;
        await cloudinary.uploader.destroy(publicId).catch(console.error);
    }
    res.json({ success: true });
});

// Rotas para Informações da Igreja
app.get('/api/igreja', verificarToken, async (req, res) => {
    try {
        let dados = await Igreja.findOne();
        if (!dados) dados = {};
        res.json(dados);
    } catch (err) { res.status(500).json({ error: "Erro ao buscar dados da igreja" }); }
});

app.post('/api/igreja', verificarToken, async (req, res) => {
    try {
        let dados = await Igreja.findOne();
        if (dados) {
            await Igreja.findByIdAndUpdate(dados._id, req.body);
        } else {
            await new Igreja(req.body).save();
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Erro ao salvar dados da igreja" }); }
});

module.exports = app;