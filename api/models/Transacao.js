// Dashboard/api/models/Transacao.js
const mongoose = require('mongoose');

const TransacaoSchema = new mongoose.Schema({
    descricao: { type: String, index: true },
    valor: { type: Number, required: true },
    tipo: { type: String, required: true },
    data: { type: Date, required: true, index: true },
    comprovanteUrl: String
});

module.exports = mongoose.models.Transacao || mongoose.model('Transacao', TransacaoSchema);