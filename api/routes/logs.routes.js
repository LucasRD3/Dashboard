// Dashboard/api/routes/logs.routes.js
const express = require('express');
const Log = require('../models/Log');
const { verificarToken } = require('../middlewares/auth');

const router = express.Router();

router.get('/', verificarToken, async (req, res) => {
    if (!req.isMaster) {
        return res.status(403).json({ error: "Apenas o administrador mestre pode visualizar logs." });
    }
    try {
        const logs = await Log.find({}).sort({ timestamp: -1 }).limit(100).lean();
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar logs" });
    }
});

module.exports = router;