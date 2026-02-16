const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Importação dos Modelos (Organização por "pastas")
const User = require('./models/User');
const Transaction = require('./models/Transaction');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'iadev_secret_key_2025';

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Conexão MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Conectado ao MongoDB - Pastas: usuarios, transacoes'))
  .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

// Middleware de Autenticação
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- ROTAS DA API ---

app.get('/api/ping', (req, res) => {
    res.json({ status: 'online', timestamp: new Date() });
});

// Auth
app.post('/api/login', async (req, res) => {
    const { usuario, senha } = req.body;
    const user = await User.findOne({ usuario });
    if (user && await bcrypt.compare(senha, user.senha)) {
        const token = jwt.sign({ id: user._id, usuario: user.usuario }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token });
    } else {
        res.status(401).json({ message: 'Credenciais inválidas' });
    }
});

// Usuários (Pasta: usuarios)
app.get('/api/usuarios', authenticateToken, async (req, res) => {
    const users = await User.find({}, '-senha');
    res.json(users);
});

app.post('/api/usuarios', authenticateToken, async (req, res) => {
    const { usuario, senha } = req.body;
    const hashedSenha = await bcrypt.hash(senha, 10);
    try {
        const newUser = new User({ usuario, senha: hashedSenha });
        await newUser.save();
        res.status(201).json({ message: 'Usuário criado' });
    } catch (err) {
        res.status(400).json({ message: 'Usuário já existe' });
    }
});

app.put('/api/usuarios/:id', authenticateToken, async (req, res) => {
    const { novaSenha } = req.body;
    const hashedSenha = await bcrypt.hash(novaSenha, 10);
    await User.findByIdAndUpdate(req.params.id, { senha: hashedSenha });
    res.json({ message: 'Senha atualizada' });
});

app.delete('/api/usuarios/:id', authenticateToken, async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Usuário removido' });
});

// Transações (Pasta: transacoes)
app.get('/api/transacoes', authenticateToken, async (req, res) => {
    const transactions = await Transaction.find().sort({ data: -1 });
    res.json(transactions);
});

app.post('/api/transacoes', authenticateToken, async (req, res) => {
    const { descricao, valor, tipo, dataManual } = req.body;
    const transaction = new Transaction({
        descricao,
        valor,
        tipo,
        data: dataManual,
        usuarioId: req.user.id
    });
    await transaction.save();
    res.status(201).json(transaction);
});

app.put('/api/transacoes/:id', authenticateToken, async (req, res) => {
    const { descricao, valor, tipo, dataManual } = req.body;
    const updated = await Transaction.findByIdAndUpdate(req.params.id, {
        descricao,
        valor,
        tipo,
        data: dataManual
    }, { new: true });
    res.json(updated);
});

app.delete('/api/transacoes/:id', authenticateToken, async (req, res) => {
    await Transaction.findByIdAndDelete(req.params.id);
    res.json({ message: 'Transação excluída' });
});

// Export para Vercel
module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
}