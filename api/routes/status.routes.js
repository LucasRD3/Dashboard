const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const os = require('os');
const drive = require('../config/googleDrive');
const { cloudinary } = require('../config/cloudinary');
const { verificarToken } = require('../middlewares/auth');
const pkg = require('../../package.json');

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
        api: {
            version: pkg.version,
            uptime: process.uptime(),
            env: process.env.NODE_ENV || 'production',
            memory: process.memoryUsage().rss,
            platform: os.platform(),
            cpuLoad: os.loadavg()[0]
        },
        mongodb: { connected: false, latency: 0, dbName: '' },
        googleDrive: { connected: false, latency: 0, storage: null },
        cloudinary: { connected: false, latency: 0 }
    };

    // Verificação MongoDB
    try {
        const start = Date.now();
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.db.admin().ping();
            status.mongodb.connected = true;
            status.mongodb.dbName = mongoose.connection.name;
        }
        status.mongodb.latency = Date.now() - start;
    } catch (err) {
        console.error("Erro status mongo:", err.message);
    }

    // Verificação Google Drive (Com detalhes de armazenamento)
    try {
        const start = Date.now();
        const response = await drive.about.get({ 
            fields: 'user, storageQuota',
            timeout: 5000 
        });
        status.googleDrive.connected = !!response.data.user;
        status.googleDrive.latency = Date.now() - start;
        status.googleDrive.storage = {
            limit: response.data.storageQuota.limit,
            usage: response.data.storageQuota.usage,
            usageInDrive: response.data.storageQuota.usageInDrive
        };
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

    lastStatus = status;
    lastCheck = now;

    res.status(200).json(status);
});

module.exports = router;