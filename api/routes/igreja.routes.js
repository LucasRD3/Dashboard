// Dashboard/api/routes/igreja.routes.js
const express = require('express');
const Igreja = require('../models/Igreja');
const { verificarToken, checkPerm } = require('../middlewares/auth');

const router = express.Router();

router.get('/', verificarToken, async (req, res) => {
    try {
        let dados = await Igreja.findOne().lean();
        if (!dados) dados = {};
        res.json(dados);
    } catch (err) { res.status(500).json({ error: "Erro ao buscar dados" }); }
});

router.post('/', verificarToken, checkPerm('allowEditChurchInfo'), async (req, res) => {
    try {
        let dados = await Igreja.findOne();
        if (dados) {
            await Igreja.findByIdAndUpdate(dados._id, req.body);
        } else {
            await new Igreja(req.body).save();
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Erro ao salvar dados" }); }
});

module.exports = router;