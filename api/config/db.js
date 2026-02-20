// Dashboard/api/config/db.js
const mongoose = require('mongoose');

// Cache da conexão para reuso na Vercel (Serverless)
let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;

    try {
        const db = await mongoose.connect(process.env.MONGO_URI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        
        isConnected = db.connections[0].readyState;
        console.log("MongoDB conectado com sucesso.");
    } catch (err) {
        console.error("Erro crítico MongoDB:", err.message);
    }
};

module.exports = connectDB;