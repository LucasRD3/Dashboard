const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const drive = require('../config/googleDrive');
const { cloudinary } = require('../config/cloudinary');
const { verificarToken } = require('../middlewares/auth');

// Cache simples em memória
let lastStatus = null;
let lastCheck = 0;
const CACHE_DURATION = 10000; // 10 segundos

router.get('/check', verificarToken, async (req, res) => {
    const now = Date.now();

    // Retorna cache se a última verificação foi há menos de 10 segundos
    if (lastStatus && (now - lastCheck < CACHE_DURATION)) {
        return res.status(200).json(lastStatus);
    }

    const status = {
        mongodb: { connected: false, latency: 0 },
        googleDrive: { connected: false, latency: 0 },
        cloudinary: { connected: false, latency: 0 }
    };

    // Verificação MongoDB
    try {
        const start = Date.now();
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.db.admin().ping();
            status.mongodb.connected = true;
        }
        status.mongodb.latency = Date.now() - start;
    } catch (err) {
        console.error("Erro status mongo:", err.message);
    }

    // Verificação Google Drive (Otimizado com Keep-Alive)
    try {
        const start = Date.now();
        const response = await drive.about.get({ 
            fields: 'user',
            // Timeout curto para evitar que a API segure a requisição por muito tempo
            timeout: 3000 
        });
        status.googleDrive.connected = !!response.data.user;
        status.googleDrive.latency = Date.now() - start;
    } catch (err) {
        console.error("Erro status drive:", err.message);
    }

    // Verificação Cloudinary
    try {
        const start = Date.now();
        const result = await cloudinary.api.ping();
        status.cloudinary.connected = result.status === 'ok';
        status.cloudinary.latency = Date.now() - start;
    } catch (err) {
        console.error("Erro status cloudinary:", err.message);
    }

    // Atualiza cache
    lastStatus = status;
    lastCheck = now;

    res.status(200).json(status);
});

module.exports = router;