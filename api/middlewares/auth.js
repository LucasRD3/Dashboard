// Dashboard/api/middlewares/auth.js

const jwt = require('jsonwebtoken');
const Log = require('../models/Log');

const SECRET_KEY = process.env.SECRET_KEY || 'iadev_secret_default';
const MASTER_USER = process.env.MASTER_USER || 'admin';

const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(403).json({ error: "Token não fornecido" });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Sessão expirada" });
        req.userId = decoded.id;
        req.isMaster = (decoded.id === MASTER_USER);
        req.permissoes = decoded.permissoes || {};
        next();
    });
};

const checkPerm = (permName) => {
    return (req, res, next) => {
        if (req.isMaster) return next();
        if (req.permissoes && req.permissoes[permName] === true) {
            return next(); 
        }
        res.status(403).json({ error: "Você não tem permissão para realizar esta ação." });
    };
};

const registrarAuditoria = async (req, res, next) => {
    const { method, originalUrl, body, params } = req;

    res.on('finish', async () => {
        if (['POST', 'PUT', 'DELETE'].includes(method) && res.statusCode >= 200 && res.statusCode < 300) {
            try {
                let acaoDesc = 'ATUALIZAÇÃO';
                if (method === 'POST') acaoDesc = 'CADASTRO';
                if (method === 'DELETE') acaoDesc = 'EXCLUSÃO';

                const detalhes = ['POST', 'PUT'].includes(method) ? { ...body } : { targetId: params.id || originalUrl.split('/').pop() };
                
                if (detalhes.senha) delete detalhes.senha;
                if (detalhes.fotoPerfil) delete detalhes.fotoPerfil;
                if (detalhes.comprovante) delete detalhes.comprovante;
                if (detalhes.permissoes) delete detalhes.permissoes;

                await new Log({
                    usuarioId: req.userId || 'sistema/desconhecido',
                    acao: acaoDesc,
                    metodo: method,
                    recurso: originalUrl,
                    detalhes: detalhes
                }).save();
            } catch (err) {
                console.error("Erro ao registrar trilha de auditoria:", err.message);
            }
        }
    });
    next();
};

module.exports = { verificarToken, checkPerm, registrarAuditoria };