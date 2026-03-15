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
        req.userNome = decoded.nome || decoded.id;
        req.isMaster = (decoded.id === MASTER_USER);
        req.permissoes = decoded.permissoes || {};
        next();
    });
};

const checkPerm = (permName) => {
    return async (req, res, next) => {
        if (req.isMaster) return next();
        if (req.permissoes && req.permissoes[permName] === true) return next(); 
        
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await new Log({
            usuarioId: req.userNome || 'anonimo',
            acao: 'ACESSO_NEGADO',
            metodo: req.method,
            recurso: req.originalUrl,
            nivel: 'SECURITY',
            detalhes: { permissaoRequerida: permName, resumo: `Tentativa de acesso sem a permissão: ${permName}` },
            ip: ip,
            userAgent: req.headers['user-agent']
        }).save();

        res.status(403).json({ error: "Você não tem permissão para realizar esta ação." });
    };
};

const registrarAuditoria = async (req, res, next) => {
    const startTime = Date.now();
    const { method, originalUrl, params, headers } = req;
    const ip = headers['x-forwarded-for'] || req.socket.remoteAddress;

    res.on('finish', () => {
        // setImmediate garante que o log seja processado logo após a resposta ser enviada ao cliente
        setImmediate(async () => {
            const duration = Date.now() - startTime;
            const ignoreUrls = ['/api/ping', '/api/logs', '/api/config', '/api/login'];
            if (ignoreUrls.some(url => originalUrl.includes(url))) return;

            if (['POST', 'PUT', 'DELETE'].includes(method) || res.statusCode >= 400) {
                try {
                    const body = req.body || {};
                    let acaoDesc = method === 'POST' ? 'CADASTRO' : (method === 'DELETE' ? 'EXCLUSÃO' : 'ATUALIZAÇÃO');
                    
                    let target = res.locals.auditTarget || body.nome || body.descricao || params.id || 'recurso';
                    let resumo = `${req.userNome || 'Sistema'} realizou ${acaoDesc} em ${target}`;

                    if (originalUrl.includes('/membros')) {
                        if (method === 'POST') resumo = `${req.userNome} cadastrou o membro: ${body.nome || target}`;
                        if (method === 'DELETE') resumo = `${req.userNome} excluiu o membro: ${res.locals.auditTarget || target}`;
                        if (method === 'PUT') resumo = `${req.userNome} alterou dados de: ${body.nome || target}`;
                    }

                    const detalhes = { 
                        ...(method !== 'DELETE' ? { ...body } : { id: params.id }),
                        resumo: resumo 
                    };
                    
                    const sensitive = ['senha', 'fotoPerfil', 'comprovante', 'permissoes'];
                    sensitive.forEach(f => delete detalhes[f]);

                    await new Log({
                        usuarioId: req.userNome || 'sistema/anonimo',
                        acao: acaoDesc,
                        metodo: method,
                        recurso: originalUrl,
                        statusCode: res.statusCode,
                        responseTime: duration,
                        nivel: res.statusCode >= 400 ? 'WARN' : 'INFO',
                        tipoEntidade: res.locals.tipoEntidade,
                        entidadeId: res.locals.entidadeId || params.id,
                        detalhes: detalhes,
                        ip: ip,
                        userAgent: headers['user-agent']
                    }).save();
                } catch (err) {
                    console.error("Erro Auditoria Assíncrona:", err.message);
                }
            }
        });
    });
    next();
};

module.exports = { verificarToken, checkPerm, registrarAuditoria };