// Dashboard/api/config/googleDrive.js
const { google } = require('googleapis');

// Configura o cliente OAuth2 com as credenciais da sua conta real
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground' // Redirect URI obrigatório para validar o token
);

// Define o token de atualização perpétuo
oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

// Inicializa a API do Drive com a sua conta
const drive = google.drive({ version: 'v3', auth: oauth2Client });

module.exports = drive;