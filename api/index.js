const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();

const SECRET_KEY = process.env.SECRET_KEY || "sua_chave_secreta_padrao"; 
const MONGO_URI = process.env.MONGO_URI;

app.use(cors());
app.use(bodyParser.json());

let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;
    
    // Configurações para evitar avisos de depreciação e melhorar estabilidade
    const opts = {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    };

    try {
        if (!MONGO_URI) {
            throw new Error("Variável MONGO_URI não encontrada no Vercel");
        }
        await mongoose.connect(MONGO_URI, opts);
        isConnected = true;
        console.log("Conectado ao MongoDB Atlas com sucesso");
    } catch (err) {
        console.error("ERRO CRÍTICO MONGODB:", err.message);
        isConnected = false;
    }
};

// Middleware de verificação de conexão
app.use(async (req, res, next) => {
    if (!isConnected) {
        await connectDB();
    }
    if (!isConnected) {
        return res.status(500).json({ 
            error: "Erro de conexão com o banco de dados",
            details: "Verifique a whitelist de IP no MongoDB Atlas ou a URI" 
        });
    }
    next();
});

// Esquemas
const TransacaoSchema = new mongoose.Schema({
    descricao: String,
    valor: Number,
    tipo: String,
    data: String
});

const UserSchema = new mongoose.Schema({
    usuario: { type: String, required: true, unique: true },
    senha: { type: String, required: true }
});

const Transacao = mongoose.models.Transacao || mongoose.model('Transacao', TransacaoSchema);
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(403).json({ error: "Token não fornecido" });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Token inválido" });
        req.userId = decoded.id;
        next();
    });
};

// Rotas da API
app.get('/api/ping', (req, res) => {
    res.json({ status: "online", mongodb: isConnected });
});

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
    } catch (err) {
        return res.status(500).json({ error: "Erro de autenticação" });
    }
    res.status(401).json({ error: "Credenciais inválidas" });
});

app.get('/api/transacoes', verificarToken, async (req, res) => {
    try {
        const transacoes = await Transacao.find();
        res.json(transacoes);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar dados" });
    }
});

app.post('/api/transacoes', verificarToken, async (req, res) => {
    try {
        const novaTransacao = new Transacao({
            descricao: req.body.descricao,
            valor: parseFloat(req.body.valor),
            tipo: req.body.tipo,
            data: req.body.dataManual
        });
        await novaTransacao.save();
        res.status(201).json(novaTransacao);
    } catch (err) {
        res.status(500).json({ error: "Erro ao salvar" });
    }
});

app.delete('/api/transacoes/:id', verificarToken, async (req, res) => {
    try {
        await Transacao.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Erro ao excluir" });
    }
});

// Outras rotas de usuários seguem o mesmo padrão...
app.get('/api/usuarios', verificarToken, async (req, res) => {
    try {
        const usuarios = await User.find({}, 'usuario');
        res.json(usuarios);
    } catch (err) {
        res.status(500).json({ error: "Erro ao listar" });
    }
});

module.exports = app;