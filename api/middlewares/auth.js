// Dashboard/api/middlewares/auth.js
const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(403).json({ error: "Token não fornecido" });

    jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Sessão expirada" });
        req.userId = decoded.id;
        req.isMaster = (decoded.id === process.env.MASTER_USER);
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

module.exports = { verificarToken, checkPerm };