const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const drive = require('../config/googleDrive');
const { cloudinary } = require('../config/cloudinary');
const { verificarToken } = require('../middlewares/auth');

router.get('/check', verificarToken, async (req, res) => {
    const status = {
        mongodb: { connected: false, latency: 0 },
        googleDrive: { connected: false, latency: 0 },
        cloudinary: { connected: false, latency: 0 }
    };

    // Verificação MongoDB com ping real
    try {
        const start = Date.now();
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.db.admin().ping();
            status.mongodb.connected = true;
        }
        status.mongodb.latency = Date.now() - start;
    } catch (err) {
        console.error("Erro status mongo:", err.message);
        status.mongodb.connected = false;
    }

    // Verificação Google Drive
    try {
        const start = Date.now();
        const response = await drive.about.get({ fields: 'user' });
        status.googleDrive.connected = !!response.data.user;
        status.googleDrive.latency = Date.now() - start;
    } catch (err) {
        console.error("Erro status drive:", err.message);
        status.googleDrive.connected = false;
    }

    // Verificação Cloudinary
    try {
        const start = Date.now();
        const result = await cloudinary.api.ping();
        status.cloudinary.connected = result.status === 'ok';
        status.cloudinary.latency = Date.now() - start;
    } catch (err) {
        console.error("Erro status cloudinary:", err.message);
        status.cloudinary.connected = false;
    }

    // Retorna 200 com os dados individuais
    res.status(200).json(status);
});

module.exports = router;