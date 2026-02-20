// Dashboard/api/config/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) return;
    try {
        await mongoose.connect(process.env.MONGO_URI, { maxPoolSize: 10 });
    } catch (err) {
        console.error("Erro MongoDB:", err.message);
    }
};

module.exports = connectDB;