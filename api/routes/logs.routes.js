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
        return res.status(401).json({ error: "Acesso não autorizado ao arquivamento automático." });
    }

    // Responde imediatamente para evitar o timeout do Cronjob
    res.json({ 
        success: true, 
        message: "Arquivamento de logs iniciado em segundo plano." 
    });

    // Executa o arquivamento em background
    (async () => {
        try {
            await archiveOldLogs();
        } catch (error) {
            console.error("Erro assíncrono no arquivamento:", error);
        }
    })();
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
        console.error("Erro ao listar logs arquivados:", error);
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
        console.error("Erro ao recuperar log arquivado:", error);
        res.status(500).json({ error: "Erro ao recuperar arquivo do Drive." });
    }
});

router.get('/', verificarToken, async (req, res) => {
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