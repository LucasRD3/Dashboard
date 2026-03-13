const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Membro = require('../models/Membro');
const Log = require('../models/Log');
const { verificarToken } = require('../middlewares/auth');

const router = express.Router();

const MASTER_USER = process.env.MASTER_USER || 'admin';
const MASTER_PASS = process.env.MASTER_PASS || 'admin';
const SECRET_KEY = process.env.SECRET_KEY || 'iadev_secret_default';

router.get('/ping', (req, res) => res.json({ status: "online" }));

router.post('/login', async (req, res) => {
    let { usuario, senha } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    if (!usuario || !senha) return res.status(400).json({ error: "Dados incompletos" });

    usuario = usuario.trim();
    senha = senha.trim();
    
    const attemptLog = { metodo: 'POST', recurso: '/api/login', ip, userAgent: req.headers['user-agent'] };

    if (usuario.toLowerCase() === MASTER_USER.toLowerCase() && senha === MASTER_PASS) {
        const token = jwt.sign({ id: usuario, nome: 'Mestre', permissoes: {} }, SECRET_KEY, { expiresIn: '24h' });
        await new Log({ ...attemptLog, usuarioId: 'Mestre', acao: 'LOGIN_SUCESSO', detalhes: { resumo: 'Login do Administrador Mestre' } }).save();
        return res.json({ auth: true, token, isMaster: true, nome: 'Mestre' });
    }
    
    try {
        // Otimização: Busca case-insensitive com índice e lean
        const admin = await Membro.findOne({ 
            usuario: { $regex: new RegExp(`^${usuario}$`, 'i') }, 
            isAdministrador: true 
        }).lean();

        if (admin && await bcrypt.compare(senha, admin.senha)) {
            const token = jwt.sign({ id: admin._id, nome: admin.nome, permissoes: admin.permissoes || {} }, SECRET_KEY, { expiresIn: '24h' });
            await new Log({ ...attemptLog, usuarioId: admin.nome, acao: 'LOGIN_SUCESSO', detalhes: { resumo: `Login de ${admin.nome}` } }).save();
            return res.json({ 
                auth: true, 
                token, 
                isMaster: false,
                nome: admin.nome,
                permissoes: admin.permissoes || {} 
            });
        }

        await new Log({ ...attemptLog, usuarioId: usuario, acao: 'LOGIN_FALHA', detalhes: { resumo: `Tentativa de login inválida: ${usuario}` } }).save();
    } catch (err) { return res.status(500).json({ error: "Erro interno" }); }
    
    res.status(401).json({ error: "Credenciais inválidas" });
});

router.post('/verify-master', verificarToken, (req, res) => {
    const { senha } = req.body;
    if (senha && senha.trim() === MASTER_PASS) {
        return res.json({ success: true });
    }
    res.status(401).json({ error: "Senha mestre incorreta" });
});

router.get('/config', verificarToken, async (req, res) => {
    res.json({}); 
});

module.exports = router;