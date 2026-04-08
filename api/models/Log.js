// Dashboard/api/models/Log.js
const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
    usuarioId: { type: String, required: true, index: true },
    sessionId: { type: String, index: true },
    acao: { type: String, required: true },
    metodo: { type: String, required: true },
    recurso: { type: String, required: true },
    statusCode: { type: Number },
    responseTime: { type: Number }, // Tempo em milissegundos
    nivel: { type: String, enum: ['INFO', 'WARN', 'ERROR', 'SECURITY', 'CRITICAL'], default: 'INFO' },
    tipoEntidade: { type: String }, // Ex: 'Membro', 'Transacao'
    entidadeId: { type: String },
    detalhes: { type: Object },
    estadoAnterior: { type: Object },
    estadoNovo: { type: Object },
    dispositivo: {
        browserName: { type: String },
        browserVersion: { type: String },
        osName: { type: String },
        deviceType: { type: String }
    },
    geo: {
        country: { type: String },
        region: { type: String },
        city: { type: String }
    },
    ip: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

module.exports = mongoose.models.Log || mongoose.model('Log', LogSchema);