const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { google } = require('googleapis');
const multer = require('multer');
const { Readable } = require('stream');

const app = express();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); 

const SECRET_KEY = process.env.SECRET_KEY; 
const MONGO_URI = process.env.MONGO_URI;

let drive;
try {
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    if (privateKey) {
        privateKey = privateKey.replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n');
        const auth = new google.auth.JWT(
            process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            null,
            privateKey,
            ['https://www.googleapis.com/auth/drive.file']
        );
        drive = google.drive({ version: 'v3', auth });
    }
} catch (e) {
    console.error("Erro Config Drive:", e.message);
}

app.use(cors());
app.use(bodyParser.json());

let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        isConnected = true;
    } catch (err) {
        console.error("Erro MongoDB:", err.message);
    }
};

app.use(async (req, res, next) => {
    await connectDB();
    next();
});

const TransacaoSchema = new mongoose.Schema({
    descricao: String, valor: Number, tipo: String, data: Date, comprovanteId: String
});

const getModelTransacao = (ano, mes) => {
    const nomeColecao = `${ano}-${String(parseInt(mes) + 1).padStart(2, '0')}`;
    return mongoose.models[nomeColecao] || mongoose.model(nomeColecao, TransacaoSchema, nomeColecao);
};

const verificarToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(" ")[1];
    if (!token) return res.status(403).json({ error: "Token ausente" });
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Sessão expirada" });
        req.userId = decoded.id;
        next();
    });
};

app.get('/api/ping', (req, res) => res.json({ status: "online", mongodb: isConnected, drive: !!drive }));

app.post('/api/transacoes', verificarToken, upload.single('foto'), async (req, res) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000); 

    try {
        let comprovanteId = "";
        
        if (req.file && drive) {
            const bufferStream = new Readable();
            bufferStream.push(req.file.buffer);
            bufferStream.push(null);

            const driveRes = await drive.files.create({
                requestBody: {
                    name: `comprovante-${Date.now()}.jpg`,
                    parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
                },
                media: { mimeType: req.file.mimetype, body: bufferStream },
                fields: 'id',
                supportsAllDrives: true // CORREÇÃO: Permite usar o espaço da pasta pai
            }, { signal: controller.signal });
            comprovanteId = driveRes.data.id;
        }

        const dataObj = new Date(req.body.dataManual);
        const Modelo = getModelTransacao(dataObj.getUTCFullYear(), dataObj.getUTCMonth());
        const nova = new Modelo({
            descricao: req.body.descricao,
            valor: parseFloat(req.body.valor),
            tipo: req.body.tipo,
            data: dataObj,
            comprovanteId
        });
        
        await nova.save();
        clearTimeout(timeoutId);
        res.status(201).json(nova);
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Erro na operação:", err.message);
        res.status(500).json({ error: "Erro na operação", details: err.message });
    }
});

module.exports = app;