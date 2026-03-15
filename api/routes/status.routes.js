const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const drive = require('../config/googleDrive');
const { verificarToken } = require('../middlewares/auth');

router.get('/check', verificarToken, async (req, res) => {
    const status = {
        mongodb: false,
        googleDrive: false
    };

    try {
        // Executa as verificações em paralelo para que a latência de uma não atrase a outra
        const [mongoRes, driveRes] = await Promise.allSettled([
            // Verificação síncrona do estado do Mongoose encapsulada numa Promise
            Promise.resolve(mongoose.connection.readyState === 1),
            // Chamada de rede ao Google Drive
            drive.about.get({ fields: 'user' })
        ]);

        // Define o estado do MongoDB baseado no resultado da primeira Promise
        status.mongodb = mongoRes.status === 'fulfilled' ? mongoRes.value : false;

        // Define o estado do Google Drive baseado no resultado da segunda Promise
        status.googleDrive = driveRes.status === 'fulfilled' && !!driveRes.value.data.user;

    } catch (err) {
        console.error("Erro ao verificar status global:", err.message);
    }

    // Retorna sempre 200 com o objeto de status para manter a compatibilidade com o front-end
    res.status(200).json(status);
});

module.exports = router;