// Dashboard/api/models/Log.js
const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
    usuarioId: { type: String, required: true, index: true },
    acao: { type: String, required: true },
    metodo: { type: String, required: true },
    recurso: { type: String, required: true },
    statusCode: { type: Number },
    responseTime: { type: Number }, // Tempo em milissegundos
    nivel: { type: String, enum: ['INFO', 'WARN', 'ERROR', 'SECURITY'], default: 'INFO' },
    tipoEntidade: { type: String }, // Ex: 'Membro', 'Transacao'
    entidadeId: { type: String },
    detalhes: { type: Object },
    ip: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

module.exports = mongoose.models.Log || mongoose.model('Log', LogSchema);