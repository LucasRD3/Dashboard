// Dashboard/api/routes/departamentos.routes.js
const express = require('express');
const Departamento = require('../models/Departamento');
const Membro = require('../models/Membro');
const { verificarToken } = require('../middlewares/auth');

const router = express.Router();

router.get('/', verificarToken, async (req, res) => {
    try {
        const departamentos = await Departamento.find().populate('membros', 'nome fotoPerfilUrl').lean();
        res.json(departamentos);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar departamentos" });
    }
});

router.post('/', verificarToken, async (req, res) => {
    try {
        res.locals.auditTarget = req.body.nome;
        const novo = await new Departamento(req.body).save();
        res.status(201).json(novo);
    } catch (err) {
        res.status(400).json({ error: "Erro ao criar departamento. Verifique se o nome já existe." });
    }
});

router.put('/:id', verificarToken, async (req, res) => {
    try {
        res.locals.auditTarget = req.body.nome;
        const atualizado = await Departamento.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(atualizado);
    } catch (err) {
        res.status(500).json({ error: "Erro ao atualizar departamento" });
    }
});

router.delete('/:id', verificarToken, async (req, res) => {
    try {
        const depto = await Departamento.findById(req.params.id);
        if (depto) {
            res.locals.auditTarget = depto.nome;
            await Departamento.findByIdAndDelete(req.params.id);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Erro ao deletar departamento" });
    }
});

router.post('/:id/membros', verificarToken, async (req, res) => {
    try {
        const { membroId } = req.body;
        const depto = await Departamento.findById(req.params.id);
        if (!depto.membros.includes(membroId)) {
            depto.membros.push(membroId);
            await depto.save();
            res.locals.auditTarget = `${depto.nome} (Adicionou membro)`;
        }
        res.json(depto);
    } catch (err) {
        res.status(500).json({ error: "Erro ao adicionar membro" });
    }
});

router.delete('/:id/membros/:membroId', verificarToken, async (req, res) => {
    try {
        const depto = await Departamento.findById(req.params.id);
        depto.membros = depto.membros.filter(m => m.toString() !== req.params.membroId);
        await depto.save();
        res.locals.auditTarget = `${depto.nome} (Removeu membro)`;
        res.json(depto);
    } catch (err) {
        res.status(500).json({ error: "Erro ao remover membro" });
    }
});

module.exports = router;