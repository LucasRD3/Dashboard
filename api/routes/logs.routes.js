// Dashboard/api/routes/logs.routes.js
const express = require('express');
const Log = require('../models/Log');
const drive = require('../config/googleDrive');
const { verificarToken } = require('../middlewares/auth');
const { archiveOldLogs } = require('../services/logArchiver.service');

const router = express.Router();

router.get('/archive', async (req, res) => {
    const { key } = req.query;
    const CRON_SECRET = process.env.CRON_SECRET;
    if (!CRON_SECRET || key !== CRON_SECRET) {
        return res.status(401).json({ error: "Acesso não autorizado." });
    }
    try {
        const resultado = await archiveOldLogs();
        res.json({ success: true, detalhes: resultado });
    } catch (error) {
        console.error("Erro no arquivamento:", error);
        res.status(500).json({ error: "Erro ao processar arquivamento." });
    }
});

router.get('/archive/list', verificarToken, async (req, res) => {
    if (!req.isMaster && (!req.permissoes || req.permissoes.allowViewLogs !== true)) {
        return res.status(403).json({ error: "Acesso negado." });
    }
    try {
        const folderId = process.env.GOOGLE_DRIVE_LOGS_FOLDER_ID;
        const response = await drive.files.list({
            q: `'${folderId}' in parents and name contains 'archive_logs_' and trashed = false`,
            fields: 'files(id, name, createdTime, size)',
            orderBy: 'createdTime desc'
        });
        res.json(response.data.files || []);
    } catch (error) {
        res.status(500).json({ error: "Erro ao listar arquivos do Drive." });
    }
});

router.get('/archive/:fileId', verificarToken, async (req, res) => {
    if (!req.isMaster && (!req.permissoes || req.permissoes.allowViewLogs !== true)) {
        return res.status(403).json({ error: "Acesso negado." });
    }
    try {
        const { fileId } = req.params;
        const response = await drive.files.get({ fileId, alt: 'media' });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Erro ao recuperar arquivo do Drive." });
    }
});

// RESOLVIDO: Rota agora suporta filtros complexos direto no MongoDB
router.get('/', verificarToken, async (req, res) => {
    if (!req.isMaster && (!req.permissoes || req.permissoes.allowViewLogs !== true)) {
        return res.status(403).json({ error: "Acesso negado." });
    }
    try {
        const { usuario, acao, nivel, inicio, fim } = req.query;
        let query = {};

        if (usuario) query.usuarioId = { $regex: usuario, $options: 'i' };
        if (acao && acao !== 'todos') query.acao = acao;
        if (nivel && nivel !== 'todos') query.nivel = nivel;
        if (inicio || fim) {
            query.timestamp = {};
            if (inicio) query.timestamp.$gte = new Date(inicio + 'T00:00:00');
            if (fim) query.timestamp.$lte = new Date(fim + 'T23:59:59');
        }

        // Limite de 500 para garantir que o administrador veja o histórico recente sem "limbo"
        const logs = await Log.find(query).sort({ timestamp: -1 }).limit(500).lean();
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar logs" });
    }
});

module.exports = router;