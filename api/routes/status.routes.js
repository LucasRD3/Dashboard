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
        googleDrive: { connected: false, latency: 0, quota: null },
        cloudinary: { connected: false, latency: 0, usage: null }
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

    // Verificação Google Drive (Otimizado com Quota)
    try {
        const start = Date.now();
        const response = await drive.about.get({ 
            fields: 'user, storageQuota',
            timeout: 5000 
        });
        status.googleDrive.connected = !!response.data.user;
        status.googleDrive.quota = response.data.storageQuota;
        status.googleDrive.latency = Date.now() - start;
    } catch (err) {
        console.error("Erro status drive:", err.message);
    }

    // Verificação Cloudinary (Otimizado com Uso)
    try {
        const start = Date.now();
        const result = await cloudinary.api.ping();
        status.cloudinary.connected = result.status === 'ok';
        
        if (status.cloudinary.connected) {
            const usage = await cloudinary.api.usage();
            status.cloudinary.usage = {
                transformations: usage.transformations,
                bandwidth: usage.bandwidth,
                storage: usage.storage,
                plan: usage.plan
            };
        }
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