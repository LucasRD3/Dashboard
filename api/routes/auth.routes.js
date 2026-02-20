// Dashboard/api/routes/auth.routes.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Membro = require('../models/Membro');
const { verificarToken } = require('../middlewares/auth');

const router = express.Router();

// Fallbacks de segurança para evitar Crash (FUNCTION_INVOCATION_FAILED)
// caso as variáveis não estejam preenchidas na Vercel.
const MASTER_USER = process.env.MASTER_USER || 'admin';
const MASTER_PASS = process.env.MASTER_PASS || 'admin';
const SECRET_KEY = process.env.SECRET_KEY || 'iadev_secret_default';

router.get('/ping', (req, res) => res.json({ status: "online" }));

router.post('/login', async (req, res) => {
    let { usuario, senha } = req.body;
    
    if (!usuario || !senha) return res.status(400).json({ error: "Dados incompletos" });

    usuario = usuario.trim();
    senha = senha.trim();
    
    if (usuario.toLowerCase() === MASTER_USER.toLowerCase() && senha === MASTER_PASS) {
        const token = jwt.sign({ id: usuario, permissoes: {} }, SECRET_KEY, { expiresIn: '24h' });
        return res.json({ auth: true, token, isMaster: true });
    }
    
    try {
        const admin = await Membro.findOne({ 
            usuario: { $regex: new RegExp(`^${usuario}$`, 'i') }, 
            isAdministrador: true 
        }).lean();

        if (admin && await bcrypt.compare(senha, admin.senha)) {
            const token = jwt.sign({ id: admin._id, permissoes: admin.permissoes || {} }, SECRET_KEY, { expiresIn: '24h' });
            return res.json({ 
                auth: true, 
                token, 
                isMaster: false,
                permissoes: admin.permissoes || {} 
            });
        }
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