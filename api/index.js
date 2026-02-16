const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { google } = require('googleapis');
const multer = require('multer');
const stream = require('stream');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const SECRET_KEY = process.env.SECRET_KEY; 
const MONGO_URI = process.env.MONGO_URI;

// Configuração Google Drive com os dados fornecidos
const auth = new google.auth.JWT(
    "iadev-633@deft-racer-474802-u0.iam.gserviceaccount.com", // client_email fornecido
    null,
    "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCseXhWRWJzQ57n\npXyj1zuBgoxKdTfCZc2ueVCXytqj6s6sWuTeuL0McbKFw6WGtogGPkSkJCIX4eeM\n9XdGh0IHqFGdyz2GgQXJiLSKU5CFdWLCUmqIW8PNHBUctEf1CaZ+9ZXYxHP5wz/X\nmYLDofHBqyrwiuKOLcl6h4qQ2LJ3AhuIQ3nPGhQ4gatnI1QaT2SJBhcIop9dPvBd\nXCY+VH60TeyppunBTS94lbBV3/EYzT9fOORGfyeFWceeV4SoJL3pUoydnDhy/dhx\najRQiMVJrWHB7Uz57nzcIq4y2YjU1iyraQ7c0w9wvUH4sx7aQvZ8NxTWTWzuBuRq\nWdidfpDXAgMBAAECggEAJ0U5GxuNQQVihwftCzkUeXaKDuIFoiOf41wH96fehHgQ\nOrovZm7VzKGOrlpPtA6XhiRjaKQ5hwqOuE+jqtFdPXUbsDv4dEmoUazovp4sR9bk\nd65gR0/tkyQTwodh4u8hk8LDLan9Zh8IyERRu82ByED68+4Li6ftOhLmf/h3GhVn\nADt+paHRpZNrmKOIXPLp2+W9iPJ1zYuLUWDIhCTXNGzhDTo8Sg0sD6CJFwEXtiLY\nuvF6kkRXaX/kF/OIUlvC6mq/c8ouGEpeF8NG4msXdyaJtSPyaaLImXLm/R333vIA\nFQqfynpCO4+o7jxLylfx6sUaHUdpCqZNf8pl9MwNcQKBgQDajqYaaBRJbwsv4NKL\cuQgEPt8RS26a1zAEZqdfRuljOs1BMyRkwYBx+PAwwIkhtnO4MHL08ugLMqdo0W1\nYtpDWDfDV7w5jLVu82wMdCloheDrx4Yw93/f1ZHrFECEEziGRaPNmGwJxOj9CoAI\n4pfmSJ+4WnxzhlJps749RaEfjQKBgQDKBcCqFG0eANul1H4gcxJaEkeWFdbXbQol\npLmBztIPuN2zHOwF9wLT2Sw167JHjoKbhkjiyfC/EinZLeRF9Pc3czDIRMiHR9uI\nyEEWOtVLOjVfGQPI2E+gNnBdSCrK0oiiMZH6mbNahvruH58q2jLu8PC6bDZtuI4D\naOS6wJWW8wKBgEqT4JQkLb/9F0koI1AYTUWv5dC63ma9WfHkT+krlrKACoaV86Q9\nEhCrf8j4AhQqu8n/IcIGrHYksqLl4tSJPcc7JBQRLRZKMGMCxzzcqoCTJnPuKpks\n60Ka4ubfi0BGOsR+oO139G3E9mfaHGRrxb97ypyiq9LT4+1Tuze3OcrFAoGBAJnF\nXy0WdygLRyUmZQqWDDX7C/o1jV5UZRDaHUms/z9wW2/mZ9Dyf3h5KamxSfYlh0yS\nHhBh3ZnSXYAt6j9Fgpb2Wv9VO72c+IFYzBH7njawi8di5vqNi65LQaP/NnNDZTTv\nvkmdjGMvsvhloWWgyHwPcWy0yYkinRYDVXbA+Bv5AoGAbXG15/WMjIU8CwWGe3lS\n/8UiZT9KXaxe4Dx0pxTUtVuOEY6JFMOpQgCyu0TszXI3xEL/i7zXZqRzeHVpOfZq\nSKzJOzPdgzYAao4R7bxI3KjK9CT4uZGSl0OEcfHMNiAJEfehSWjCELHAqNUW9aGI\nu5rAAdD4/lhotjIEW1E1hgg=\n-----END PRIVATE KEY-----\n", // private_key fornecida
    ['https://www.googleapis.com/auth/drive.file']
);
const drive = google.drive({ version: 'v3', auth });

app.use(cors());
app.use(bodyParser.json());

let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try {
        if (!MONGO_URI) throw new Error("MONGO_URI não definida");
        await mongoose.connect(MONGO_URI);
        isConnected = true;
    } catch (err) {
        console.error("Erro MongoDB:", err.message);
    }
};

app.use(async (req, res, next) => {
    await connectDB();
    next();
});

const TransacaoSchema = new mongoose.Schema({
    descricao: String,
    valor: Number,
    tipo: String,
    data: Date,
    comprovanteUrl: String
});

const getModelTransacao = (ano, mes) => {
    const nomeColecao = `${ano}-${String(parseInt(mes) + 1).padStart(2, '0')}`;
    return mongoose.models[nomeColecao] || mongoose.model(nomeColecao, TransacaoSchema, nomeColecao);
};

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    usuario: { type: String, required: true, unique: true },
    senha: { type: String, required: true }
}));

const Membro = mongoose.models.Membro || mongoose.model('Membro', new mongoose.Schema({
    nome: { type: String, required: true, unique: true }
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
    try {
        const user = await User.findOne({ usuario });
        if (user && await bcrypt.compare(senha, user.senha)) {
            const token = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: '24h' });
            return res.json({ auth: true, token });
        }
    } catch (err) { return res.status(500).json({ error: "Erro interno" }); }
    res.status(401).json({ error: "Credenciais inválidas" });
});

// Rota de Upload para o Drive
app.post('/api/upload', verificarToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "Nenhum arquivo" });
        
        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        const response = await drive.files.create({
            requestBody: {
                name: `comprovante_${Date.now()}_${req.file.originalname}`,
                parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
            },
            media: {
                mimeType: req.file.mimetype,
                body: bufferStream
            },
            fields: 'id, webViewLink'
        });

        res.json({ link: response.data.webViewLink });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CRUD de Transações
app.get('/api/transacoes', verificarToken, async (req, res) => {
    try {
        const { ano, mes } = req.query;
        if (!ano || !mes) return res.json([]);
        const Modelo = getModelTransacao(ano, mes);
        res.json(await Modelo.find().sort({ data: -1 }));
    } catch (err) { res.status(500).json({ error: "Erro ao buscar" }); }
});

app.post('/api/transacoes', verificarToken, async (req, res) => {
    try {
        const dataObj = new Date(req.body.dataManual);
        const Modelo = getModelTransacao(dataObj.getUTCFullYear(), dataObj.getUTCMonth());
        const nova = new Modelo({ ...req.body, data: dataObj });
        await nova.save();
        res.status(201).json(nova);
    } catch (err) { res.status(500).json({ error: "Erro ao salvar" }); }
});

app.put('/api/transacoes/:id', verificarToken, async (req, res) => {
    try {
        const { ano, mes } = req.query;
        const Modelo = getModelTransacao(ano, mes);
        const atualizada = await Modelo.findByIdAndUpdate(
            req.params.id,
            { ...req.body, data: new Date(req.body.dataManual) },
            { new: true }
        );
        res.json(atualizada);
    } catch (err) { res.status(500).json({ error: "Erro ao atualizar" }); }
});

app.delete('/api/transacoes/:id', verificarToken, async (req, res) => {
    try {
        const { ano, mes } = req.query;
        const Modelo = getModelTransacao(ano, mes);
        await Modelo.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Erro ao excluir" }); }
});

// Gestão de Membros e Usuários (Mantido conforme original)
app.get('/api/usuarios', verificarToken, async (req, res) => {
    const usuarios = await User.find({}, 'usuario');
    res.json(usuarios);
});

app.post('/api/usuarios', verificarToken, async (req, res) => {
    const salt = await bcrypt.genSalt(10);
    const hashedSenha = await bcrypt.hash(req.body.senha, salt);
    const novo = new User({ usuario: req.body.usuario, senha: hashedSenha });
    await novo.save();
    res.status(201).json({ message: "Criado" });
});

app.delete('/api/usuarios/:id', verificarToken, async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.get('/api/membros', verificarToken, async (req, res) => {
    res.json(await Membro.find().sort({ nome: 1 }));
});

app.post('/api/membros', verificarToken, async (req, res) => {
    const novo = new Membro({ nome: req.body.nome });
    await novo.save();
    res.status(201).json(novo);
});

app.delete('/api/membros/:id', verificarToken, async (req, res) => {
    await Membro.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.get('/api/membros/historico/:nome', verificarToken, async (req, res) => {
    try {
        const nomeMembro = req.params.nome;
        const collections = await mongoose.connection.db.listCollections().toArray();
        const colecoesData = collections.map(c => c.name).filter(n => /^\d{4}-\d{2}$/.test(n));
        let historico = [];
        for (const nome of colecoesData) {
            const Modelo = mongoose.models[nome] || mongoose.model(nome, TransacaoSchema, nome);
            const t = await Modelo.find({ descricao: { $regex: nomeMembro, $options: 'i' } });
            historico = historico.concat(t);
        }
        res.json(historico.sort((a, b) => new Date(b.data) - new Date(a.data)));
    } catch (err) { res.status(500).json({ error: "Erro" }); }
});

module.exports = app;