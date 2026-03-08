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
        req.userNome = decoded.nome || decoded.id;
        req.isMaster = (decoded.id === MASTER_USER);
        req.permissoes = decoded.permissoes || {};
        next();
    });
};

const checkPerm = (permName) => {
    return (req, res, next) => {
        if (req.isMaster) return next();
        if (req.permissoes && req.permissoes[permName] === true) return next(); 
        res.status(403).json({ error: "Você não tem permissão para realizar esta ação." });
    };
};

const registrarAuditoria = async (req, res, next) => {
    const { method, originalUrl, body, params, headers } = req;
    const ip = headers['x-forwarded-for'] || req.socket.remoteAddress;

    res.on('finish', async () => {
        const ignoreUrls = ['/api/ping', '/api/logs', '/api/config'];
        if (ignoreUrls.some(url => originalUrl.includes(url))) return;

        if (['POST', 'PUT', 'DELETE'].includes(method) && res.statusCode >= 200 && res.statusCode < 400) {
            try {
                let acaoDesc = method === 'POST' ? 'CADASTRO' : (method === 'DELETE' ? 'EXCLUSÃO' : 'ATUALIZAÇÃO');
                let target = res.locals.auditTarget || body.nome || body.descricao || params.id || 'recurso';
                let resumo = `${req.userNome || 'Sistema'} realizou ${acaoDesc} em ${target}`;

                if (originalUrl.includes('/membros')) {
                    if (method === 'POST') resumo = `${req.userNome} cadastrou o membro: ${body.nome}`;
                    if (method === 'DELETE') resumo = `${req.userNome} excluiu o membro: ${res.locals.auditTarget || target}`;
                    if (method === 'PUT') resumo = `${req.userNome} atualizou dados de: ${body.nome || target}`;
                } else if (originalUrl.includes('/transacoes')) {
                    if (method === 'POST') resumo = `${req.userNome} registrou ${body.tipo}: ${body.descricao}`;
                    if (method === 'DELETE') resumo = `${req.userNome} removeu transação: ${target}`;
                    if (method === 'PUT') resumo = `${req.userNome} editou transação: ${body.descricao || target}`;
                } else if (originalUrl.includes('/login')) {
                    acaoDesc = 'AUTENTICAÇÃO';
                    resumo = `Login realizado por: ${req.userNome}`;
                }

                const detalhes = { 
                    ...(method !== 'DELETE' ? { ...body } : { id: params.id }),
                    resumo: resumo 
                };
                
                const sensitiveFields = ['senha', 'fotoPerfil', 'comprovante', 'permissoes'];
                sensitiveFields.forEach(f => delete detalhes[f]);

                await new Log({
                    usuarioId: req.userNome || 'sistema/anonimo',
                    acao: acaoDesc,
                    metodo: method,
                    recurso: originalUrl,
                    detalhes: detalhes,
                    ip: ip,
                    userAgent: headers['user-agent']
                }).save();
            } catch (err) {
                console.error("Erro Auditoria:", err.message);
            }
        }
    });
    next();
};

module.exports = { verificarToken, checkPerm, registrarAuditoria };