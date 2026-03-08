// Dashboard/api/services/logArchiver.service.js
const stream = require('stream');
const Log = require('../models/Log');
const drive = require('../config/googleDrive');

const archiveOldLogs = async () => {
    // ALTERAÇÃO TEMPORÁRIA PARA TESTE: Pega todos os logs criados até amanhã
    const limiteData = new Date();
    limiteData.setDate(limiteData.getDate() + 1);

    const logsParaArquivar = await Log.find({ timestamp: { $lt: limiteData } }).lean();

    if (logsParaArquivar.length === 0) {
        return { logsArquivados: 0, fileId: null };
    }

    const jsonString = JSON.stringify(logsParaArquivar, null, 2);
    const bufferStream = new stream.PassThrough();
    bufferStream.end(Buffer.from(jsonString));

    const dataFormatada = new Date().toISOString().split('T')[0];
    const timestampAtual = Date.now();
    const fileName = `archive_logs_${dataFormatada}_${timestampAtual}.json`;
    const folderId = process.env.GOOGLE_DRIVE_LOGS_FOLDER_ID;

    const uploadedFile = await drive.files.create({
        resource: {
            name: fileName,
            parents: folderId ? [folderId] : []
        },
        media: {
            mimeType: 'application/json',
            body: bufferStream
        },
        fields: 'id'
    });

    if (!uploadedFile.data.id) {
        throw new Error("Falha na geração do arquivo no Google Drive.");
    }

    const logsIds = logsParaArquivar.map(log => log._id);
    await Log.deleteMany({ _id: { $in: logsIds } });

    await new Log({
        usuarioId: 'sistema/cron',
        acao: 'BACKUP',
        metodo: 'GET',
        recurso: '/api/logs/archive',
        detalhes: { 
            resumo: `SISTEMA realizou BACKUP/LIMPEZA de ${logsParaArquivar.length} logs de teste`,
            fileId: uploadedFile.data.id
        }
    }).save();

    return { logsArquivados: logsParaArquivar.length, fileId: uploadedFile.data.id };
};

module.exports = { archiveOldLogs };