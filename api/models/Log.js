const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
    usuarioId: { type: String, required: true, index: true },
    acao: { type: String, required: true },
    metodo: { type: String, required: true },
    recurso: { type: String, required: true },
    detalhes: { type: Object },
    ip: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

module.exports = mongoose.models.Log || mongoose.model('Log', LogSchema);