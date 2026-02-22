// Dashboard/api/routes/membros.routes.js
const express = require('express');
const bcrypt = require('bcryptjs');
const Membro = require('../models/Membro');
const Transacao = require('../models/Transacao');
const { verificarToken, checkPerm } = require('../middlewares/auth');
const { cloudinary, uploadPerfil } = require('../config/cloudinary');

const router = express.Router();

router.get('/', verificarToken, async (req, res) => {
    res.json(await Membro.find({}, 'nome fotoPerfilUrl telefone isAdministrador').sort({ nome: 1 }).lean());
});

router.post('/', verificarToken, uploadPerfil.single('fotoPerfil'), async (req, res) => {
    if (req.body.isAdministrador === 'true') {
        if (!req.isMaster) {
            if (!req.permissoes || !req.permissoes.allowManageAdmins) {
                return res.status(403).json({ error: "Você não tem permissão para criar Administradores." });
            }
        }
    }

    const { nome, cpf, telefone, endereco, dataNascimento, isAdministrador, usuario, senha } = req.body;
    const fotoPerfilUrl = req.file ? req.file.path : null;
    
    let permissoes = {};
    if (req.body.permissoes) {
        try { permissoes = JSON.parse(req.body.permissoes); } catch(e) {}
    }

    try {
        let hashedSenha = null;
        if (isAdministrador === 'true' && senha) {
            hashedSenha = await bcrypt.hash(senha.trim(), 10);
        }

        const novo = await new Membro({ 
            nome, cpf, telefone, endereco, dataNascimento, fotoPerfilUrl,
            isAdministrador: isAdministrador === 'true',
            usuario: isAdministrador === 'true' ? usuario.trim() : null,
            senha: hashedSenha,
            permissoes: isAdministrador === 'true' ? permissoes : {}
        }).save();
        res.status(201).json(novo);
    } catch (err) {
        res.status(400).json({ error: "Erro ao salvar membro. Verifique se o nome já existe." });
    }
});

router.put('/:id', verificarToken, uploadPerfil.single('fotoPerfil'), async (req, res) => {
    const { isAdministrador, usuario, senha, nome, cpf, telefone, endereco, dataNascimento } = req.body;

    if (isAdministrador === 'true' || req.body.isAdministrador === true) {
        if (!req.isMaster) {
            if (!req.permissoes || !req.permissoes.allowManageAdmins) {
                return res.status(403).json({ error: "Permissão negada para gerenciar Administradores." });
            }
        }
    }

    let permissoes = {};
    if (req.body.permissoes) {
        try { permissoes = JSON.parse(req.body.permissoes); } catch(e) {}
    }

    try {
        const membroAtual = await Membro.findById(req.params.id);
        if (!membroAtual) return res.status(404).json({ error: "Membro não encontrado" });

        let fotoPerfilUrl = membroAtual.fotoPerfilUrl;
        if (req.file) {
            if (membroAtual.fotoPerfilUrl && !membroAtual.fotoPerfilUrl.includes("svg+xml")) {
                const publicId = `perfil_membros/${membroAtual.fotoPerfilUrl.split('/').pop().split('.')[0]}`;
                await cloudinary.uploader.destroy(publicId).catch(console.error);
            }
            fotoPerfilUrl = req.file.path;
        }

        let updateData = { 
            nome, cpf, telefone, endereco, dataNascimento, fotoPerfilUrl,
            isAdministrador: isAdministrador === 'true'
        };

        if (updateData.isAdministrador) {
            updateData.usuario = usuario ? usuario.trim() : usuario;
            updateData.permissoes = permissoes; 
            if (senha) { 
                updateData.senha = await bcrypt.hash(senha.trim(), 10);
            }
        } else {
            updateData.usuario = null;
            updateData.senha = null;
            updateData.permissoes = {};
        }

        const atualizado = await Membro.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(atualizado);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao atualizar membro" });
    }
});

router.delete('/:id', verificarToken, checkPerm('allowDeleteMember'), async (req, res) => {
    const membro = await Membro.findByIdAndDelete(req.params.id);
    if (membro?.fotoPerfilUrl && !membro.fotoPerfilUrl.includes("svg+xml")) {
        const publicId = `perfil_membros/${membro.fotoPerfilUrl.split('/').pop().split('.')[0]}`;
        await cloudinary.uploader.destroy(publicId).catch(console.error);
    }
    res.json({ success: true });
});

router.get('/historico/:nome', verificarToken, async (req, res) => {
    try {
        const historico = await Transacao.find({ 
            descricao: { $regex: req.params.nome, $options: 'i' } 
        }).sort({ data: -1 }).limit(20).lean();
        res.json(historico);
    } catch (err) { res.status(500).json({ error: "Erro busca" }); }
});

module.exports = router;