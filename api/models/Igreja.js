// Dashboard/api/models/Igreja.js
const mongoose = require('mongoose');

const IgrejaSchema = new mongoose.Schema({
    razaoSocial: String,
    nomeFantasia: String,
    cnpj: String,
    email: String,
    telefone: String,
    endereco: String,
    cidade: String,
    estado: String,
    cep: String,
    dataFundacao: String
});

module.exports = mongoose.models.Igreja || mongoose.model('Igreja', IgrejaSchema);