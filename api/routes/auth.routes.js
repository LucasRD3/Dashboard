// Dashboard/api/routes/auth.routes.js
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
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'iadev_refresh_secret_default';

router.get('/ping', (req, res) => res.json({ status: "online" }));

router.post('/login', async (req, res) => {
    let { usuario, senha } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    if (!usuario || !senha) return res.status(400).json({ error: "Dados incompletos" });

    usuario = usuario.trim();
    senha = senha.trim();
    
    const attemptLog = { metodo: 'POST', recurso: '/api/login', ip, userAgent: req.headers['user-agent'] };

    if (usuario.toLowerCase() === MASTER_USER.toLowerCase() && senha === MASTER_PASS) {
        const payload = { id: usuario, nome: 'Mestre', permissoes: {} };
        const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '2h' });
        const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });

        await new Log({ ...attemptLog, usuarioId: 'Mestre', acao: 'LOGIN_SUCESSO', detalhes: { resumo: 'Login do Administrador Mestre' } }).save();
        return res.json({ auth: true, token, refreshToken, isMaster: true, nome: 'Mestre' });
    }
    
    try {
        const admin = await Membro.findOne({ 
            usuario: { $regex: new RegExp(`^${usuario}$`, 'i') }, 
            isAdministrador: true 
        }).lean();

        if (admin && await bcrypt.compare(senha, admin.senha)) {
            const payload = { id: admin._id, nome: admin.nome, permissoes: admin.permissoes || {} };
            const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '2h' });
            const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });

            await new Log({ ...attemptLog, usuarioId: admin.nome, acao: 'LOGIN_SUCESSO', detalhes: { resumo: `Login de ${admin.nome}` } }).save();
            return res.json({ 
                auth: true, 
                token,
                refreshToken,
                isMaster: false,
                nome: admin.nome,
                permissoes: admin.permissoes || {} 
            });
        }

        await new Log({ ...attemptLog, usuarioId: usuario, acao: 'LOGIN_FALHA', detalhes: { resumo: `Tentativa de login inválida: ${usuario}` } }).save();
    } catch (err) { return res.status(500).json({ error: "Erro interno" }); }
    
    res.status(401).json({ error: "Credenciais inválidas" });
});

router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: "Refresh token não fornecido" });

    jwt.verify(refreshToken, REFRESH_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: "Refresh token inválido ou expirado" });

        const newToken = jwt.sign(
            { id: decoded.id, nome: decoded.nome, permissoes: decoded.permissoes },
            SECRET_KEY,
            { expiresIn: '2h' }
        );

        res.json({ 
            token: newToken, 
            nome: decoded.nome, 
            isMaster: decoded.id === MASTER_USER,
            permissoes: decoded.permissoes 
        });
    });
});

router.post('/verify-master', verificarToken, (req, res) => {
    const { senha } = req.body;
    if (senha && senha.trim() === MASTER_PASS) {
        return res.json({ success: true });
    }
    res.status(401).json({ error: "Senha mestre incorreta" });
});

module.exports = router;