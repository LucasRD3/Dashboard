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

        const start = new Date(Date.UTC(ano, mes, 1));
        const end = new Date(Date.UTC(ano, parseInt(mes) + 1, 0, 23, 59, 59));

        const transacoes = await Transacao.find({
            data: { $gte: start, $lte: end }
        }).sort({ data: -1 }).lean();
        
        res.json(transacoes);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar transações" });
    }
});

router.get('/saldo-anterior', verificarToken, async (req, res) => {
    try {
        const { ano, mes } = req.query;
        if (!ano || !mes) return res.json({ saldoAnterior: 0 });

        const start = new Date(Date.UTC(ano, mes, 1));
        
        const transacoesAnteriores = await Transacao.find({
            data: { $lt: start }
        }).lean();

        let saldoAnterior = 0;
        transacoesAnteriores.forEach(t => {
            let valor = Number(t.valor) || 0;
            let tipo = (t.tipo || "").toString().toLowerCase().trim();
            
            if (tipo === 'dizimo' || tipo === 'oferta') {
                saldoAnterior += valor;
            } else {
                saldoAnterior -= valor;
            }
        });

        res.json({ saldoAnterior });
    } catch (err) {
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