// Dashboard/api/routes/membros.routes.js
const express = require('express');
const bcrypt = require('bcryptjs');
const Membro = require('../models/Membro');
const Transacao = require('../models/Transacao');
const { verificarToken, checkPerm } = require('../middlewares/auth');
const { cloudinary, uploadPerfil } = require('../config/cloudinary');

const router = express.Router();
const MASTER_USER = process.env.MASTER_USER || 'admin';

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/', verificarToken, async (req, res) => {
    res.json(await Membro.find({})
        .select('nome cpf telefone endereco dataNascimento fotoPerfilUrl isAdministrador usuario permissoes')
        .sort({ nome: 1 })
        .lean());
});

router.post('/', verificarToken, uploadPerfil.single('fotoPerfil'), async (req, res) => {
    const isAdm = req.body.isAdministrador === 'true';

    if (isAdm) {
        if (!req.isMaster && (!req.permissoes || !req.permissoes.allowManageAdmins)) {
            return res.status(403).json({ error: "Você não tem permissão para criar Administradores." });
        }
    }

    const { nome, cpf, telefone, endereco, dataNascimento, usuario, senha } = req.body;
    res.locals.auditTarget = nome; 
    res.locals.tipoEntidade = 'Membro';

    const fotoPerfilUrl = req.file ? req.file.path : null;
    
    let permissoes = {};
    if (req.body.permissoes) {
        try { permissoes = JSON.parse(req.body.permissoes); } catch(e) {}
    }

    try {
        let hashedSenha = null;
        if (isAdm && senha) {
            hashedSenha = await bcrypt.hash(senha.trim(), 10);
        }

        const novo = await new Membro({ 
            nome, cpf, telefone, endereco, dataNascimento, fotoPerfilUrl,
            isAdministrador: isAdm,
            usuario: isAdm ? (usuario ? usuario.trim() : null) : null,
            senha: hashedSenha,
            permissoes: isAdm ? permissoes : {}
        }).save();
        
        res.locals.entidadeId = novo._id;
        res.status(201).json(novo);
    } catch (err) {
        res.status(400).json({ error: "Erro ao salvar: Nome ou Usuário já existe." });
    }
});

router.put('/:id', verificarToken, uploadPerfil.single('fotoPerfil'), async (req, res) => {
    try {
        const membroAtual = await Membro.findById(req.params.id);
        if (!membroAtual) return res.status(404).json({ error: "Membro não encontrado" });

        if (membroAtual.usuario === MASTER_USER && !req.isMaster) {
            return res.status(403).json({ error: "Apenas o Administrador Mestre pode editar este perfil." });
        }

        const isAdmRequested = req.body.isAdministrador === 'true';
        const { usuario, senha, nome, cpf, telefone, endereco, dataNascimento } = req.body;

        res.locals.auditTarget = nome || membroAtual.nome;
        res.locals.tipoEntidade = 'Membro';
        res.locals.entidadeId = req.params.id;

        if (isAdmRequested || membroAtual.isAdministrador) {
            if (!req.isMaster && (!req.permissoes || !req.permissoes.allowManageAdmins)) {
                return res.status(403).json({ error: "Permissão negada para gerenciar Administradores." });
            }
        }

        if (membroAtual._id.toString() === req.userId && req.body.permissoes && !req.isMaster) {
             const novasPerms = JSON.parse(req.body.permissoes);
             const antigasPerms = membroAtual.permissoes || {};
             if (JSON.stringify(novasPerms) !== JSON.stringify(antigasPerms)) {
                 return res.status(403).json({ error: "Você não pode alterar suas próprias permissões." });
             }
        }

        let fotoPerfilUrl = membroAtual.fotoPerfilUrl;
        if (req.file) {
            if (fotoPerfilUrl && fotoPerfilUrl.includes("http") && !fotoPerfilUrl.includes("svg+xml")) {
                const publicId = `perfil_membros/${fotoPerfilUrl.split('/').pop().split('.')[0]}`;
                cloudinary.uploader.destroy(publicId).catch(console.error);
            }
            fotoPerfilUrl = req.file.path;
        }

        let updateData = { 
            nome, cpf, telefone, endereco, dataNascimento, fotoPerfilUrl,
            isAdministrador: isAdmRequested
        };

        if (isAdmRequested) {
            updateData.usuario = usuario ? usuario.trim() : membroAtual.usuario;
            if (req.body.permissoes) {
                try { updateData.permissoes = JSON.parse(req.body.permissoes); } catch(e) {}
            }
            if (senha && senha.trim() !== "") { 
                updateData.senha = await bcrypt.hash(senha.trim(), 10);
            }
        } else {
            updateData.usuario = null;
            updateData.senha = null;
            updateData.permissoes = {};
        }

        const atualizado = await Membro.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true });
        res.json(atualizado);
    } catch (err) {
        res.status(500).json({ error: "Erro ao atualizar membro" });
    }
});

router.delete('/:id', verificarToken, checkPerm('allowDeleteMember'), async (req, res) => {
    res.locals.tipoEntidade = 'Membro';
    res.locals.entidadeId = req.params.id;
    try {
        const membro = await Membro.findById(req.params.id);
        if (!membro) return res.status(404).json({ error: "Membro não encontrado" });

        if (membro.usuario === MASTER_USER) {
            return res.status(403).json({ error: "O Administrador Mestre não pode ser excluído." });
        }

        res.locals.auditTarget = membro.nome;
        if (membro.fotoPerfilUrl && membro.fotoPerfilUrl.includes("http") && !membro.fotoPerfilUrl.includes("svg+xml")) {
            const publicId = `perfil_membros/${membro.fotoPerfilUrl.split('/').pop().split('.')[0]}`;
            cloudinary.uploader.destroy(publicId).catch(console.error);
        }
        await Membro.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Erro ao deletar membro" });
    }
});

router.get('/historico/:nome', verificarToken, async (req, res) => {
    try {
        const nomeSeguro = escapeRegExp(req.params.nome);
        const historico = await Transacao.find({ 
            descricao: { $regex: nomeSeguro, $options: 'i' } 
        }).sort({ data: -1 }).limit(20).lean();
        res.json(historico);
    } catch (err) { res.status(500).json({ error: "Erro na busca de histórico" }); }
});

module.exports = router;