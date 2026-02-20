// Dashboard/api/index.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Importar configuração do banco
const connectDB = require('./config/db');

// Importar todas as rotas
const authRoutes = require('./routes/auth.routes');
const membrosRoutes = require('./routes/membros.routes');
const transacoesRoutes = require('./routes/transacoes.routes');
const igrejaRoutes = require('./routes/igreja.routes');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// Garante conexão ao banco antes de processar rotas (Await em ambiente Serverless)
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        res.status(500).json({ error: "Erro de conexão com o banco de dados" });
    }
});

// Registrar os endpoints
app.use('/api', authRoutes); 
app.use('/api/membros', membrosRoutes); 
app.use('/api/transacoes', transacoesRoutes); 
app.use('/api/igreja', igrejaRoutes); 

module.exports = app;