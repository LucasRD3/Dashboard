// Dashboard/api/models/Membro.js
const mongoose = require('mongoose');

const MembroSchema = new mongoose.Schema({
    nome: { type: String, required: true, unique: true },
    cpf: { type: String },
    telefone: { type: String },
    endereco: { type: String },
    dataNascimento: { type: String },
    fotoPerfilUrl: { type: String },
    isAdministrador: { type: Boolean, default: false },
    usuario: { type: String },
    senha: { type: String },
    permissoes: { type: Object, default: {} } 
});

module.exports = mongoose.models.Membro || mongoose.model('Membro', MembroSchema);