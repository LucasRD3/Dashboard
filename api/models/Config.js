// Dashboard/api/models/Config.js
const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
    allowManageAdmins: { type: Boolean, default: false } 
}, { strict: false });

module.exports = mongoose.models.Config || mongoose.model('Config', ConfigSchema);