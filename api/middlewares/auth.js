// Dashboard/api/middlewares/auth.js
const jwt = require('jsonwebtoken');
const Log = require('../models/Log');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');

const SECRET_KEY = process.env.SECRET_KEY || 'iadev_secret_default';
const MASTER_USER = process.env.MASTER_USER || 'admin';

// Função recursiva de sanitização mais robusta
const sanitizarDados = (obj) => {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizarDados(item));
    }

    const copia = { ...obj };
    const camposSensiveis = ['senha', 'fotoPerfil', 'comprovante', 'permissoes', 'token', 'password', 'creditcard'];

    for (const key in copia) {
        if (Object.prototype.hasOwnProperty.call(copia, key)) {
            if (camposSensiveis.some(sensivel => key.toLowerCase().includes(sensivel.toLowerCase()))) {
                copia[key] = '[REDIGIDO]';
            } else if (typeof copia[key] === 'object') {
                copia[key] = sanitizarDados(copia[key]);
            }
        }
    }
    return copia;
};

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
        req.sessionId = decoded.sessionId || decoded.jti || 'sessao_nao_identificada';
        next();
    });
};

const checkPerm = (permName) => {
    return async (req, res, next) => {
        if (req.isMaster) return next();
        if (req.permissoes && req.permissoes[permName] === true) return next(); 
        
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const parser = new UAParser(req.headers['user-agent']);
        const geo = geoip.lookup(ip) || {};

        await new Log({
            usuarioId: req.userNome || 'anonimo',
            sessionId: req.sessionId,
            acao: 'ACESSO_NEGADO',
            metodo: req.method,
            recurso: req.originalUrl,
            nivel: 'SECURITY',
            detalhes: { permissaoRequerida: permName, resumo: `Tentativa de acesso sem a permissão: ${permName}` },
            dispositivo: {
                browserName: parser.getBrowser().name || 'Desconhecido',
                browserVersion: parser.getBrowser().version || '',
                osName: parser.getOS().name || 'Desconhecido',
                deviceType: parser.getDevice().type || 'Desktop'
            },
            geo: {
                country: geo.country || 'Desconhecido',
                region: geo.region || 'Desconhecido',
                city: geo.city || 'Desconhecido'
            },
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

                    // Preparação de dados para o log
                    let dadosPrincipais = { ...body };
                    let estadoAnterior = res.locals.estadoAnterior;
                    let estadoNovo = res.locals.estadoNovo || body;

                    // Lógica específica para Transações
                    if (originalUrl.includes('/transacoes')) {
                        const filtrarTransacao = (obj) => {
                            if (!obj) return undefined;
                            return {
                                descricao: obj.descricao,
                                valor: obj.valor,
                                tipo: obj.tipo,
                                data: obj.data || obj.dataManual
                            };
                        };

                        // Filtra o corpo enviado no Cadastro ou Edição
                        if (method === 'POST' || method === 'PUT') {
                            dadosPrincipais = {
                                descricao: body.descricao,
                                valor: body.valor,
                                tipo: body.tipo,
                                dataManual: body.dataManual
                            };
                        }

                        // Filtra os estados apenas na Alteração (PUT)
                        if (method === 'PUT') {
                            estadoAnterior = filtrarTransacao(estadoAnterior);
                            estadoNovo = filtrarTransacao(estadoNovo);
                        }
                    }

                    const detalhesSanitizados = sanitizarDados({ 
                        ...(method !== 'DELETE' ? dadosPrincipais : { id: params.id }),
                        resumo: resumo,
                        erro: res.locals.errorMessage || undefined
                    });
                    
                    const parser = new UAParser(headers['user-agent']);
                    const geo = geoip.lookup(ip) || {};

                    await new Log({
                        usuarioId: req.userNome || 'sistema/anonimo',
                        sessionId: req.sessionId,
                        acao: acaoDesc,
                        metodo: method,
                        recurso: originalUrl,
                        statusCode: res.statusCode,
                        responseTime: duration,
                        nivel: res.statusCode >= 400 ? (res.statusCode >= 500 ? 'ERROR' : 'WARN') : 'INFO',
                        tipoEntidade: res.locals.tipoEntidade,
                        entidadeId: res.locals.entidadeId || params.id,
                        detalhes: detalhesSanitizados,
                        estadoAnterior: sanitizarDados(estadoAnterior),
                        estadoNovo: method === 'PUT' ? sanitizarDados(estadoNovo) : undefined,
                        dispositivo: {
                            browserName: parser.getBrowser().name || 'Desconhecido',
                            browserVersion: parser.getBrowser().version || '',
                            osName: parser.getOS().name || 'Desconhecido',
                            deviceType: parser.getDevice().type || 'Desktop'
                        },
                        geo: {
                            country: geo.country || 'Desconhecido',
                            region: geo.region || 'Desconhecido',
                            city: geo.city || 'Desconhecido'
                        },
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