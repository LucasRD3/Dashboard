const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { google } = require('googleapis');
const multer = require('multer');
const { Readable } = require('stream');

const app = express();
// Limite de 5MB para evitar timeouts excessivos na Vercel
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); 

const SECRET_KEY = process.env.SECRET_KEY; 
const MONGO_URI = process.env.MONGO_URI;

// Configuração Google Drive com tratamento de erro na chave
let drive;
try {
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    if (privateKey) {
        // Limpeza da chave para evitar erro de decodificação
        privateKey = privateKey.replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n');
        const auth = new google.auth.JWT(
            process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            null,
            privateKey,
            ['https://www.googleapis.com/auth/drive.file']
        );
        drive = google.drive({ version: 'v3', auth });
    }
} catch (e) {
    console.error("Erro na configuração do Drive:", e.message);
}

app.use(cors());
app.use(bodyParser.json());

let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        isConnected = true;
    } catch (err) {
        console.error("Erro ao conectar ao MongoDB:", err.message);
    }
};

app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// Esquemas
const TransacaoSchema = new mongoose.Schema({
    descricao: String, 
    valor: Number, 
    tipo: String, 
    data: Date, 
    comprovanteId: String
});

const MembroSchema = new mongoose.Schema({
    nome: { type: String, required: true, unique: true }
});

const getModelTransacao = (ano, mes) => {
    const nomeColecao = `${ano}-${String(parseInt(mes) + 1).padStart(2, '0')}`;
    return mongoose.models[nomeColecao] || mongoose.model(nomeColecao, TransacaoSchema, nomeColecao);
};

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    usuario: { type: String, required: true, unique: true },
    senha: { type: String, required: true }
}));

const Membro = mongoose.models.Membro || mongoose.model('Membro', MembroSchema);

const verificarToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(" ")[1];
    if (!token) return res.status(403).json({ error: "Token ausente" });
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Sessão expirada" });
        req.userId = decoded.id;
        next();
    });
};

// --- ROTAS DO SISTEMA ---

app.get('/api/ping', (req, res) => res.json({ status: "online", mongodb: isConnected, drive: !!drive }));

app.post('/api/login', async (req, res) => {
    const { usuario, senha } = req.body;
    if (usuario === "IADEV" && senha === "1234") {
        const token = jwt.sign({ id: usuario }, SECRET_KEY, { expiresIn: '24h' });
        return res.json({ auth: true, token });
    }
    try {
        const user = await User.findOne({ usuario });
        if (user && await bcrypt.compare(senha, user.senha)) {
            const token = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: '24h' });
            return res.json({ auth: true, token });
        }
    } catch (err) { return res.status(500).json({ error: "Erro interno" }); }
    res.status(401).json({ error: "Usuário ou senha inválidos" });
});

app.get('/api/membros', verificarToken, async (req, res) => {
    try {
        const membros = await Membro.find().sort({ nome: 1 });
        res.json(membros);
    } catch (err) { res.status(500).json({ error: "Erro ao buscar membros" }); }
});

app.post('/api/membros', verificarToken, async (req, res) => {
    try {
        const novo = new Membro({ nome: req.body.nome });
        await novo.save();
        res.status(201).json(novo);
    } catch (err) { res.status(500).json({ error: "Erro ao salvar membro" }); }
});

app.get('/api/membros/historico/:nome', verificarToken, async (req, res) => {
    try {
        const nomeMembro = req.params.nome;
        const collections = await mongoose.connection.db.listCollections().toArray();
        const colecoesData = collections
            .map(c => c.name)
            .filter(name => /^\d{4}-\d{2}$/.test(name));

        let historicoCompleto = [];
        for (const nomeColecao of colecoesData) {
            const Modelo = mongoose.models[nomeColecao] || mongoose.model(nomeColecao, TransacaoSchema, nomeColecao);
            const transacoes = await Modelo.find({
                descricao: { $regex: nomeMembro, $options: 'i' }
            });
            historicoCompleto = historicoCompleto.concat(transacoes);
        }
        historicoCompleto.sort((a, b) => new Date(b.data) - new Date(a.data));
        res.json(historicoCompleto);
    } catch (err) { res.status(500).json({ error: "Erro ao buscar histórico" }); }
});

app.post('/api/transacoes', verificarToken, upload.single('foto'), async (req, res) => {
    // Aborta o upload se o Drive demorar mais que 7 segundos para evitar timeout da Vercel
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000); 

    try {
        let comprovanteId = "";
        
        if (req.file && drive) {
            try {
                const bufferStream = new Readable();
                bufferStream.push(req.file.buffer);
                bufferStream.push(null);

                const driveRes = await drive.files.create({
                    requestBody: {
                        name: `comprovante-${Date.now()}.jpg`,
                        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
                    },
                    media: { mimeType: req.file.mimetype, body: bufferStream },
                    fields: 'id'
                }, { signal: controller.signal });
                comprovanteId = driveRes.data.id;
            } catch (driveErr) {
                console.warn("Upload do Drive ignorado devido a lentidão ou erro:", driveErr.message);
            }
        }

        const dataObj = new Date(req.body.dataManual);
        const Modelo = getModelTransacao(dataObj.getUTCFullYear(), dataObj.getUTCMonth());
        const nova = new Modelo({
            descricao: req.body.descricao,
            valor: parseFloat(req.body.valor),
            tipo: req.body.tipo,
            data: dataObj,
            comprovanteId
        });
        
        await nova.save();
        clearTimeout(timeoutId);
        res.status(201).json(nova);
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Falha na transação:", err.message);
        res.status(500).json({ error: "Falha ao salvar", details: err.message });
    }
});

app.get('/api/transacoes', verificarToken, async (req, res) => {
    try {
        const { ano, mes } = req.query;
        if (!ano || !mes) return res.json([]);
        const ModeloPasta = getModelTransacao(ano, mes);
        const transacoes = await ModeloPasta.find().sort({ data: -1 });
        res.json(transacoes);
    } catch (err) { res.status(500).json({ error: "Erro ao buscar transações" }); }
});

module.exports = app;