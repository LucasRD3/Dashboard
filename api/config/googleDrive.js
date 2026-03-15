// Dashboard/api/config/googleDrive.js
const { google } = require('googleapis');
const https = require('https');

// Configura um agente HTTPS para manter as conexões ativas e reduzir latência
const agent = new https.Agent({
    keepAlive: true,
    maxSockets: 10,
    keepAliveMsecs: 1000
});

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

// Inicializa a API do Drive utilizando o agente customizado
const drive = google.drive({ 
    version: 'v3', 
    auth: oauth2Client,
    http2: true, // Habilita suporte a HTTP/2 se disponível
    agent: agent
});

module.exports = drive;