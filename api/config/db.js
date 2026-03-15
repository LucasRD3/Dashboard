const mongoose = require('mongoose');

const connectDB = async () => {
  // Verifica o estado real da ligação (1 = ligado, 2 = a ligar)
  if (mongoose.connection.readyState >= 1) {
    return;
  }

  try {
    // Configurações para manter a ligação viva e evitar timeouts silenciosos
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000 
    });
    
    console.log('MongoDB conectado com sucesso.');
  } catch (err) {
    console.error('Erro crítico na conexão MongoDB:', err.message);
    // Em ambientes serverless, é importante permitir que o erro suba para reiniciar a instância
    throw err;
  }
};

// Monitorização de eventos para diagnóstico de rede
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB desconectado. O driver tentará reconectar automaticamente.');
});

mongoose.connection.on('error', (err) => {
  console.error('Erro de socket no MongoDB:', err);
});

module.exports = connectDB;