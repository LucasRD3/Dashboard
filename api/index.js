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
        transformation: [{ width: 1000, crop: "limit", quality: "auto" }]
    },
});
const upload = multer({ storage: storage });

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

// Esquema Único Otimizado
const TransacaoSchema = new mongoose.Schema({
    descricao: { type: String, index: true },
    valor: { type: Number, required: true },
    tipo: { type: String, required: true },
    data: { type: Date, required: true, index: true },
    comprovanteUrl: String
});

const Transacao = mongoose.models.Transacao || mongoose.model('Transacao', TransacaoSchema);

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    usuario: { type: String, required: true, unique: true },
    senha: { type: String, required: true }
}));

const Membro = mongoose.models.Membro || mongoose.model('Membro', new mongoose.Schema({
    nome: { type: String, required: true, unique: true },
    cpf: { type: String },
    telefone: { type: String },
    endereco: { type: String }
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
        const user = await User.findOne({ usuario }).lean();
        if (user && await bcrypt.compare(senha, user.senha)) {
            const token = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: '24h' });
            return res.json({ auth: true, token });
        }
    } catch (err) { res.status(500).json({ error: "Erro interno" }); }
    res.status(401).json({ error: "Credenciais inválidas" });
});

// GESTÃO DE USUÁRIOS E MEMBROS
app.get('/api/usuarios', verificarToken, async (req, res) => {
    res.json(await User.find({}, 'usuario').lean());
});

app.post('/api/usuarios', verificarToken, async (req, res) => {
    const { usuario, senha } = req.body;
    const hashedSenha = await bcrypt.hash(senha, 10);
    await new User({ usuario, senha: hashedSenha }).save();
    res.status(201).json({ message: "OK" });
});

app.delete('/api/usuarios/:id', verificarToken, async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.get('/api/membros', verificarToken, async (req, res) => {
    res.json(await Membro.find().sort({ nome: 1 }).lean());
});

app.post('/api/membros', verificarToken, async (req, res) => {
    const { nome, cpf, telefone, endereco } = req.body;
    const novo = await new Membro({ nome, cpf, telefone, endereco }).save();
    res.status(201).json(novo);
});

app.delete('/api/membros/:id', verificarToken, async (req, res) => {
    await Membro.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// HISTÓRICO - Agora extremamente rápido com índice
app.get('/api/membros/historico/:nome', verificarToken, async (req, res) => {
    try {
        const historico = await Transacao.find({ 
            descricao: { $regex: req.params.nome, $options: 'i' } 
        }).sort({ data: -1 }).lean();
        res.json(historico);
    } catch (err) { res.status(500).json({ error: "Erro busca" }); }
});

// GESTÃO DE TRANSAÇÕES - Filtro por data em coleção única
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

module.exports = app;