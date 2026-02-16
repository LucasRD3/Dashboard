const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    usuario: { type: String, required: true, unique: true },
    senha: { type: String, required: true }
}, { 
    timestamps: true,
    collection: 'usuarios' // Define explicitamente o nome da "pasta" no MongoDB
});

module.exports = mongoose.model('User', UserSchema);