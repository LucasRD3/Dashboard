// Dashboard/api/models/Log.js
const mongoose = require('mongoose');
const crypto = require('crypto');

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
    hash: { type: String, index: true }, // Assinatura real gerada no servidor
    timestamp: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

// Middleware para gerar o hash de integridade antes de salvar
LogSchema.pre('save', function (next) {
    if (this.isNew) {
        const dataToHash = JSON.stringify({
            u: this.usuarioId,
            a: this.acao,
            r: this.recurso,
            t: this.timestamp,
            ip: this.ip,
            d: this.detalhes?.resumo || ""
        });
        this.hash = crypto.createHash('sha256').update(dataToHash).digest('hex');
    }
    next();
});

module.exports = mongoose.models.Log || mongoose.model('Log', LogSchema);