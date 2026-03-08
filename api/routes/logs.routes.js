// Dashboard/api/routes/logs.routes.js
const express = require('express');
const Log = require('../models/Log');
const { verificarToken } = require('../middlewares/auth');

const router = express.Router();

router.get('/', verificarToken, async (req, res) => {
    // Permite acesso se for Mestre ou se tiver a permissão individual 'allowViewLogs'
    if (!req.isMaster && (!req.permissoes || req.permissoes.allowViewLogs !== true)) {
        return res.status(403).json({ error: "Acesso negado. Você não tem permissão para visualizar logs." });
    }
    try {
        const logs = await Log.find({}).sort({ timestamp: -1 }).limit(100).lean();
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar logs" });
    }
});

module.exports = router;