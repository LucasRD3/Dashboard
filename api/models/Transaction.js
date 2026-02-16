const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    descricao: { type: String, required: true },
    valor: { type: Number, required: true },
    tipo: { type: String, enum: ['dizimo', 'oferta', 'gastos'], required: true },
    data: { type: String, required: true }, // Mantendo o formato YYYY-MM-DD do seu front-end
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // Relaciona a transação a um usuário
}, { 
    timestamps: true,
    collection: 'transacoes' 
});

module.exports = mongoose.model('Transaction', TransactionSchema);