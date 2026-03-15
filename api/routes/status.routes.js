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
        // Verifica se o estado é 1 (Connected)
        status.mongodb = mongoose.connection.readyState === 1;
    } catch (err) {
        console.error("Erro status mongo:", err.message);
        status.mongodb = false;
    }

    try {
        // Valida se o cliente do drive e o token de refresh estão ativos
        const response = await drive.about.get({ fields: 'user' });
        status.googleDrive = !!response.data.user;
    } catch (err) {
        console.error("Erro status drive:", err.message);
        status.googleDrive = false;
    }

    // Retorna sempre 200 com o objeto de status para evitar que o fetch do front caia no catch
    res.status(200).json(status);
});

module.exports = router;