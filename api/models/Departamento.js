// Dashboard/api/models/Departamento.js
const mongoose = require('mongoose');

const DepartamentoSchema = new mongoose.Schema({
    nome: { type: String, required: true, unique: true },
    descricao: { type: String },
    membros: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Membro' }]
});

module.exports = mongoose.models.Departamento || mongoose.model('Departamento', DepartamentoSchema);