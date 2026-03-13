// Dashboard/api/index.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Importar configuração do banco
const connectDB = require('./config/db');

// Importar middlewares
const { registrarAuditoria } = require('./middlewares/auth');

// Importar todas as rotas
const authRoutes = require('./routes/auth.routes');
const membrosRoutes = require('./routes/membros.routes');
const transacoesRoutes = require('./routes/transacoes.routes');
const igrejaRoutes = require('./routes/igreja.routes');
const backupRoutes = require('./routes/backup.routes');
const logsRoutes = require('./routes/logs.routes');
const departamentosRoutes = require('./routes/departamentos.routes');

const app = express();

// Inicia a conexão com o banco de dados no carregamento do módulo
connectDB();

app.use(cors());
app.use(bodyParser.json());

// Middleware de Auditoria para registrar operações de alteração e exclusão
app.use(registrarAuditoria);

// Registrar os endpoints
app.use('/api', authRoutes); 
app.use('/api/membros', membrosRoutes); 
app.use('/api/transacoes', transacoesRoutes); 
app.use('/api/igreja', igrejaRoutes); 
app.use('/api/backup', backupRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/departamentos', departamentosRoutes);

// Rota raiz para evitar 404 nos logs da Vercel
app.get('/', (req, res) => {
    res.json({ status: "API Online", message: "IADEV Financeiro API" });
});

// Tratamento de ícones para silenciar logs de erro 404
app.get(['/favicon.ico', '/favicon.png'], (req, res) => res.status(204).end());

module.exports = app;