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

/**
 * Inicializa a API do Drive utilizando o agente customizado.
 * Foi removido o parâmetro "http2: true" para evitar o erro ERR_HTTP2_GOAWAY_SESSION,
 * garantindo maior estabilidade em execuções assíncronas e ambientes serverless.
 */
const drive = google.drive({ 
    version: 'v3', 
    auth: oauth2Client,
    agent: agent
});

module.exports = drive;