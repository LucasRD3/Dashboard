const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const drive = require('../config/googleDrive');
const { verificarToken } = require('../middlewares/auth');

router.get('/check', verificarToken, async (req, res) => {
    const status = {
        mongodb: false,
        googleDrive: false
    };

    try {
        // Verifica o estado da conexão do Mongoose (1 = conectado)
        status.mongodb = mongoose.connection.readyState === 1;
    } catch (err) {
        status.mongodb = false;
    }

    try {
        // Tenta uma chamada simples à API do Drive para validar credenciais e rede
        await drive.about.get({ fields: 'user' });
        status.googleDrive = true;
    } catch (err) {
        status.googleDrive = false;
    }

    res.json(status);
});

module.exports = router;