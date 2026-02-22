// Dashboard/api/routes/transacoes.routes.js
const express = require('express');
const Transacao = require('../models/Transacao');
const { verificarToken, checkPerm } = require('../middlewares/auth');
const { cloudinary, upload } = require('../config/cloudinary');

const router = express.Router();

router.get('/', verificarToken, async (req, res) => {
    try {
        const { ano, mes } = req.query;
        if (!ano || !mes) return res.json([]);

        const start = new Date(Date.UTC(parseInt(ano), parseInt(mes), 1, 0, 0, 0));
        const end = new Date(Date.UTC(parseInt(ano), parseInt(mes) + 1, 0, 23, 59, 59));

        const transacoes = await Transacao.find({
            data: { $gte: start, $lte: end }
        }).sort({ data: -1 }).lean();
        
        res.json(transacoes);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar transações" });
    }
});

router.get('/periodo', verificarToken, async (req, res) => {
    try {
        const { inicio, fim } = req.query;
        if (!inicio || !fim) return res.json([]);

        // Configura as datas para cobrir desde as 00:00:00 do dia de início até as 23:59:59 do dia de fim (UTC)
        const start = new Date(`${inicio}T00:00:00.000Z`);
        const end = new Date(`${fim}T23:59:59.999Z`);

        const transacoes = await Transacao.find({
            data: { $gte: start, $lte: end }
        }).sort({ data: -1 }).lean();
        
        res.json(transacoes);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao buscar transações por período" });
    }
});

router.get('/saldo-anterior', verificarToken, async (req, res) => {
    try {
        const { ano, mes } = req.query;
        if (!ano || !mes) return res.json({ saldoAnterior: 0 });

        const start = new Date(Date.UTC(parseInt(ano), parseInt(mes), 1, 0, 0, 0));
        
        const resultado = await Transacao.aggregate([
            { $match: { data: { $lt: start } } },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: {
                            $cond: [
                                { $in: [{ $toLower: { $trim: { input: "$tipo" } } }, ["dizimo", "oferta"]] },
                                "$valor",
                                { $multiply: ["$valor", -1] }
                            ]
                        }
                    }
                }
            }
        ]);

        const saldoAnterior = resultado.length > 0 ? resultado[0].total : 0;
        res.json({ saldoAnterior });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao calcular saldo anterior" });
    }
});

router.post('/', verificarToken, upload.single('comprovante'), async (req, res) => {
    try {
        const nova = await new Transacao({
            descricao: req.body.descricao,
            valor: parseFloat(req.body.valor) || 0,
            tipo: (req.body.tipo || "").toLowerCase().trim(),
            data: new Date(req.body.dataManual),
            comprovanteUrl: req.file ? req.file.path : null
        }).save();
        res.status(201).json(nova);
    } catch (err) {
        res.status(500).json({ error: "Erro ao salvar transação" });
    }
});

router.put('/:id', verificarToken, checkPerm('allowEditTransaction'), async (req, res) => {
    try {
        const atualizada = await Transacao.findByIdAndUpdate(
            req.params.id,
            {
                descricao: req.body.descricao,
                valor: parseFloat(req.body.valor) || 0,
                tipo: (req.body.tipo || "").toLowerCase().trim(),
                data: new Date(req.body.dataManual)
            },
            { new: true }
        );
        res.json(atualizada);
    } catch (err) {
        res.status(500).json({ error: "Erro ao atualizar transação" });
    }
});

router.delete('/:id', verificarToken, checkPerm('allowDeleteTransaction'), async (req, res) => {
    try {
        const transacao = await Transacao.findByIdAndDelete(req.params.id);
        if (transacao?.comprovanteUrl) {
            const publicId = `comprovantes/${transacao.comprovanteUrl.split('/').pop().split('.')[0]}`;
            await cloudinary.uploader.destroy(publicId).catch(console.error);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Erro ao deletar transação" });
    }
});

module.exports = router;