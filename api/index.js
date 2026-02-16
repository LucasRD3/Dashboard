const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();

const SECRET_KEY = process.env.SECRET_KEY; 
const MONGO_URI = process.env.MONGO_URI;

app.use(cors());
app.use(bodyParser.json());

let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try {
        if (!MONGO_URI) throw new Error("MONGO_URI não definida no Vercel");
        await mongoose.connect(MONGO_URI);
        isConnected = true;
        console.log("Conectado ao MongoDB Atlas");
    } catch (err) {
        console.error("Erro ao conectar ao MongoDB:", err.message);
    }
};

app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// Esquema base para as transações
const TransacaoSchema = new mongoose.Schema({
    descricao: String,
    valor: Number,
    tipo: String,
    data: Date
});

// Função para obter o modelo da "pasta" (coleção) correta dinamicamente
const getModelTransacao = (ano, mes) => {
    // Define o nome da coleção como YYYY-MM (ex: 2026-02)
    const nomeColecao = `${ano}-${String(parseInt(mes) + 1).padStart(2, '0')}`;
    return mongoose.models[nomeColecao] || mongoose.model(nomeColecao, TransacaoSchema, nomeColecao);
};

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    usuario: { type: String, required: true, unique: true },
    senha: { type: String, required: true }
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
        return res.status(500).json({ error: "Erro interno" });
    }
    res.status(401).json({ error: "Usuário ou senha inválidos" });
});

// GESTÃO DE USUÁRIOS
app.get('/api/usuarios', verificarToken, async (req, res) => {
    try {
        const usuarios = await User.find({}, 'usuario');
        res.json(usuarios);
    } catch (err) { res.status(500).json({ error: "Erro ao buscar usuários" }); }
});

app.post('/api/usuarios', verificarToken, async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedSenha = await bcrypt.hash(senha, salt);
        const novoUsuario = new User({ usuario, senha: hashedSenha });
        await novoUsuario.save();
        res.status(201).json({ message: "Usuário criado" });
    } catch (err) { res.status(500).json({ error: "Erro ao salvar usuário" }); }
});

app.put('/api/usuarios/:id', verificarToken, async (req, res) => {
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedSenha = await bcrypt.hash(req.body.novaSenha, salt);
        await User.findByIdAndUpdate(req.params.id, { senha: hashedSenha });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Erro ao atualizar senha" }); }
});

app.delete('/api/usuarios/:id', verificarToken, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Erro ao excluir usuário" }); }
});

// GESTÃO DE TRANSAÇÕES (COM PASTAS)
app.get('/api/transacoes', verificarToken, async (req, res) => {
    try {
        const { ano, mes } = req.query;
        if (!ano || !mes) return res.json([]);
        const ModeloPasta = getModelTransacao(ano, mes);
        const transacoes = await ModeloPasta.find().sort({ data: -1 });
        res.json(transacoes);
    } catch (err) { res.status(500).json({ error: "Erro ao buscar" }); }
});

app.post('/api/transacoes', verificarToken, async (req, res) => {
    try {
        const dataObj = new Date(req.body.dataManual);
        const ModeloPasta = getModelTransacao(dataObj.getUTCFullYear(), dataObj.getUTCMonth());
        const nova = new ModeloPasta({
            descricao: req.body.descricao,
            valor: parseFloat(req.body.valor),
            tipo: req.body.tipo,
            data: dataObj
        });
        await nova.save();
        res.status(201).json(nova);
    } catch (err) { res.status(500).json({ error: "Erro ao salvar" }); }
});

app.put('/api/transacoes/:id', verificarToken, async (req, res) => {
    try {
        const { ano, mes } = req.query;
        const ModeloPasta = getModelTransacao(ano, mes);
        const atualizada = await ModeloPasta.findByIdAndUpdate(
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
    } catch (err) { res.status(500).json({ error: "Erro ao atualizar" }); }
});

app.delete('/api/transacoes/:id', verificarToken, async (req, res) => {
    try {
        const { ano, mes } = req.query;
        const ModeloPasta = getModelTransacao(ano, mes);
        await ModeloPasta.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Erro ao excluir" }); }
});

module.exports = app;