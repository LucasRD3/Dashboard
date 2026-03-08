// Dashboard/api/routes/logs.routes.js
const express = require('express');
const Log = require('../models/Log');
const { verificarToken } = require('../middlewares/auth');
const { archiveOldLogs } = require('../services/logArchiver.service');

const router = express.Router();

/*
 * INTEGRAÇÃO FUTURA DE LOGS ANTIGOS NA INTERFACE:
 * 1. Endpoint de Listagem: Criar rota que chame drive.files.list buscando arquivos com "name contains 'archive_logs_' and trashed = false" no folder GOOGLE_DRIVE_FOLDER_ID.
 * 2. Endpoint de Leitura: Criar rota que recupere o conteúdo do arquivo via drive.files.get({ fileId: id_do_arquivo, alt: 'media' }) e devolva o JSON para o front-end renderizar a tabela.
 */

router.get('/archive', async (req, res) => {
    const { key } = req.query;
    const CRON_SECRET = process.env.CRON_SECRET;

    if (!CRON_SECRET || key !== CRON_SECRET) {
        return res.status(401).json({ error: "Acesso não autorizado ao arquivamento automático." });
    }

    try {
        const resultado = await archiveOldLogs();
        res.json(resultado);
    } catch (error) {
        console.error("Erro no serviço de arquivamento:", error);
        res.status(500).json({ error: "Erro interno no processo de arquivamento." });
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