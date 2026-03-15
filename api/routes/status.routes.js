// Dashboard/api/routes/status.routes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const os = require('os');
const drive = require('../config/googleDrive');
const { cloudinary } = require('../config/cloudinary');
const { verificarToken } = require('../middlewares/auth');
const pkg = require('../../package.json');

// Cache simples em memória para o check padrão
let lastStatus = null;
let lastCheck = 0;
const CACHE_DURATION = 10000; // 10 segundos

router.get('/check', verificarToken, async (req, res) => {
    const now = Date.now();

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

// NOVA ROTA: Diagnóstico Avançado (Auto-Check)
router.get('/diagnose', verificarToken, async (req, res) => {
    const results = {
        database: { status: 'pending', message: '' },
        environment: { status: 'pending', vars: [] },
        storage: { status: 'pending', message: '' }
    };

    try {
        // 1. Teste de Escrita/Delete no MongoDB
        const startMongo = Date.now();
        const diagCollection = mongoose.connection.db.collection('_diagnostics_test');
        const testDoc = { test: true, timestamp: new Date() };
        
        await diagCollection.insertOne(testDoc);
        await diagCollection.deleteOne({ _id: testDoc._id });
        
        results.database.status = 'success';
        results.database.message = `Escrita e leitura OK (${Date.now() - startMongo}ms)`;
    } catch (err) {
        results.database.status = 'error';
        results.database.message = `Falha na escrita: ${err.message}`;
    }

    // 2. Verificação de Variáveis de Ambiente Críticas
    const criticalVars = [
        'MONGO_URI', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 
        'GOOGLE_REFRESH_TOKEN', 'CLOUDINARY_CLOUD_NAME', 'JWT_SECRET'
    ];
    
    results.environment.vars = criticalVars.map(v => ({
        name: v,
        defined: !!process.env[v]
    }));
    const missing = results.environment.vars.filter(v => !v.defined);
    results.environment.status = missing.length === 0 ? 'success' : 'warning';

    // 3. Teste de Uso do Cloudinary (API de Administração)
    try {
        const usage = await cloudinary.api.usage();
        results.storage.status = 'success';
        results.storage.message = `Transformações: ${usage.transformations.used}/${usage.transformations.limit}`;
    } catch (err) {
        results.storage.status = 'error';
        results.storage.message = "Falha ao consultar limites da API";
    }

    res.status(200).json(results);
});

module.exports = router;