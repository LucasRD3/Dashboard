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

// Middleware para garantir conexão Serverless (Vercel) antes das requisições
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// Registrar os endpoints usando as rotas separadas
app.use('/api', authRoutes); 
app.use('/api/membros', membrosRoutes); 
app.use('/api/transacoes', transacoesRoutes); // Esta rota engloba /api/transacoes/saldo-anterior
app.use('/api/igreja', igrejaRoutes); 

module.exports = app;