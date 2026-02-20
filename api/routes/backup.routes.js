// Dashboard/api/routes/backup.routes.js
const express = require('express');
const stream = require('stream');
const drive = require('../config/googleDrive');
const { verificarToken } = require('../middlewares/auth');

const Membro = require('../models/Membro');
const Transacao = require('../models/Transacao');
const Igreja = require('../models/Igreja');
const Config = require('../models/Config');

const router = express.Router();

router.post('/', verificarToken, async (req, res) => {
    // Restringe o backup apenas para o Administrador Master
    if (!req.isMaster) {
        return res.status(403).json({ error: "Apenas o administrador mestre pode realizar backups." });
    }

    try {
        const membros = await Membro.find({}).lean();
        const transacoes = await Transacao.find({}).lean();
        const igreja = await Igreja.findOne({}).lean();
        const config = await Config.findOne({}).lean();

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

        res.json({ 
            success: true, 
            message: "Backup realizado com sucesso no Google Drive",
            fileId: uploadedFile.data.id,
            link: uploadedFile.data.webViewLink
        });

    } catch (error) {
        console.error("Erro no backup:", error);
        res.status(500).json({ error: "Erro interno ao enviar backup para o Google Drive." });
    }
});

module.exports = router;