// Dashboard/api/services/logArchiver.service.js
const stream = require('stream');
const Log = require('../models/Log');
const drive = require('../config/googleDrive');

const archiveOldLogs = async () => {
    // RESOLVIDO: Filtro alterado para logs com mais de 30 dias (evita esvaziar o banco por engano)
    const limiteData = new Date();
    limiteData.setDate(limiteData.getDate() - 0);

    // Busca os logs mais antigos (limite de 2000 para segurança de memória na Vercel)
    const logsParaArquivar = await Log.find({ 
        timestamp: { $lt: limiteData },
        acao: { $ne: 'BACKUP' } // Mantém o histórico de backups no banco por mais tempo
    })
        .sort({ timestamp: 1 })
        .limit(2000)
        .lean();

    if (logsParaArquivar.length === 0) {
        return { logsArquivados: 0, logsEliminados: 0, fileId: null };
    }

    const jsonString = JSON.stringify(logsParaArquivar, null, 2);
    const bufferStream = new stream.PassThrough();
    bufferStream.end(Buffer.from(jsonString));

    const dataFormatada = new Date().toISOString().split('T')[0];
    const timestampAtual = Date.now();
    const fileName = `archive_logs_${dataFormatada}_${timestampAtual}.json`;
    const folderId = process.env.GOOGLE_DRIVE_LOGS_FOLDER_ID;

    // 1. Upload para o Google Drive
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

    // 2. Eliminação imediata dos logs exportados
    const logsIds = logsParaArquivar.map(log => log._id);
    const resultadoExclusao = await Log.deleteMany({ _id: { $in: logsIds } });

    // 3. Registo da operação de arquivamento no sistema
    await new Log({
        usuarioId: 'sistema/cron',
        acao: 'BACKUP',
        metodo: 'GET',
        recurso: '/api/logs/archive',
        nivel: 'CRITICAL',
        detalhes: { 
            resumo: `SISTEMA realizou arquivamento e limpeza de ${logsParaArquivar.length} logs antigos.`,
            fileId: uploadedFile.data.id,
            totalEliminado: resultadoExclusao.deletedCount
        }
    }).save();

    return { 
        logsArquivados: logsParaArquivar.length, 
        logsEliminados: resultadoExclusao.deletedCount, 
        fileId: uploadedFile.data.id 
    };
};

module.exports = { archiveOldLogs };