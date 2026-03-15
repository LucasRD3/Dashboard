// Dashboard/api/routes/backup.routes.js
const express = require('express');
const stream = require('stream');
const drive = require('../config/googleDrive');
const { verificarToken } = require('../middlewares/auth');

const Membro = require('../models/Membro');
const Transacao = require('../models/Transacao');
const Igreja = require('../models/Igreja');
const Config = require('../models/Config');
const Log = require('../models/Log');

const router = express.Router();

router.get('/auto', async (req, res) => {
    const { key } = req.query;
    const CRON_SECRET = process.env.CRON_SECRET;

    if (!CRON_SECRET || key !== CRON_SECRET) {
        return res.status(401).json({ error: "Acesso não autorizado ao backup automático." });
    }

    try {
        // Busca paralela para acelerar o processo
        const [membros, transacoes, igreja, config] = await Promise.all([
            Membro.find({}).lean(),
            Transacao.find({}).lean(),
            Igreja.findOne({}).lean(),
            Config.findOne({}).lean()
        ]);

        const backupData = {
            dataBackup: new Date().toISOString(),
            membros,
            transacoes,
            igreja: igreja || {},
            config: config || {}
        };

        const jsonString = JSON.stringify(backupData, null, 2);
        const bufferStream = new stream.PassThrough();
        bufferStream.end(Buffer.from(jsonString));

        const fileName = `auto_backup_iadev_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

        const fileMetadata = {
            name: fileName,
            parents: folderId ? [folderId] : []
        };

        const media = {
            mimeType: 'application/json',
            body: bufferStream
        };

        const uploadedFile = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        });

        await new Log({
            usuarioId: 'sistema/cron',
            acao: 'BACKUP',
            metodo: 'GET',
            recurso: '/api/backup/auto',
            detalhes: { tipo: 'Automático', fileId: uploadedFile.data.id }
        }).save();

        res.json({ 
            success: true, 
            message: "Backup automático realizado com sucesso",
            fileId: uploadedFile.data.id 
        });

    } catch (error) {
        console.error("Erro no backup automático:", error);
        res.status(500).json({ error: "Erro interno no processo de backup." });
    }
});

router.post('/', verificarToken, async (req, res) => {
    if (!req.isMaster) {
        return res.status(403).json({ error: "Apenas o administrador mestre pode realizar backups." });
    }

    // Resposta imediata para evitar timeout e lentidão para o usuário
    res.json({ 
        success: true, 
        message: "Backup manual iniciado em segundo plano. O arquivo será enviado ao Google Drive em instantes."
    });

    // Processamento em Background
    (async () => {
        try {
            const [membros, transacoes, igreja, config] = await Promise.all([
                Membro.find({}).lean(),
                Transacao.find({}).lean(),
                Igreja.findOne({}).lean(),
                Config.findOne({}).lean()
            ]);

            const backupData = {
                dataBackup: new Date().toISOString(),
                membros,
                transacoes,
                igreja: igreja || {},
                config: config || {}
            };

            const jsonString = JSON.stringify(backupData, null, 2);
            const bufferStream = new stream.PassThrough();
            bufferStream.end(Buffer.from(jsonString));

            const fileName = `backup_iadev_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

            const fileMetadata = { name: fileName, parents: folderId ? [folderId] : [] };
            const media = { mimeType: 'application/json', body: bufferStream };

            const uploadedFile = await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, webViewLink'
            });

            await new Log({
                usuarioId: req.userId,
                acao: 'BACKUP',
                metodo: 'POST',
                recurso: '/api/backup',
                detalhes: { tipo: 'Manual', fileId: uploadedFile.data.id, link: uploadedFile.data.webViewLink, status: 'Concluído' }
            }).save();

        } catch (error) {
            console.error("Erro no backup assíncrono:", error);
        }
    })();
});

router.get('/list', verificarToken, async (req, res) => {
    if (!req.isMaster) return res.status(403).json({ error: "Acesso negado." });
    try {
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        const [response, about] = await Promise.all([
            drive.files.list({
                q: `'${folderId}' in parents and mimeType='application/json' and trashed=false`,
                fields: 'files(id, name, createdTime, size)',
                orderBy: 'createdTime desc'
            }),
            drive.about.get({ fields: 'storageQuota' })
        ]);
        
        res.json({ 
            files: response.data.files,
            quota: about.data.storageQuota
        });
    } catch (error) {
        res.status(500).json({ error: "Erro ao listar arquivos do Drive." });
    }
});

router.post('/restore/:fileId', verificarToken, async (req, res) => {
    if (!req.isMaster) return res.status(403).json({ error: "Apenas o mestre pode restaurar o sistema." });
    try {
        const { fileId } = req.params;
        const response = await drive.files.get({ fileId, alt: 'media' });
        const backupData = response.data;

        await Promise.all([
            Membro.deleteMany({}),
            Transacao.deleteMany({}),
            Igreja.deleteMany({}),
            Config.deleteMany({})
        ]);

        if (backupData.membros?.length) await Membro.insertMany(backupData.membros);
        if (backupData.transacoes?.length) await Transacao.insertMany(backupData.transacoes);
        if (backupData.igreja) await new Igreja(backupData.igreja).save();
        if (backupData.config) await new Config(backupData.config).save();

        await new Log({
            usuarioId: req.userId,
            acao: 'RESTAURAÇÃO',
            metodo: 'POST',
            recurso: `/api/backup/restore/${fileId}`,
            detalhes: { fileId, status: 'Sucesso' }
        }).save();

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Falha na restauração dos dados." });
    }
});

module.exports = router;