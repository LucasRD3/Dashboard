// Dashboard/api/config/cloudinary.js
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'comprovantes',
        allowed_formats: ['jpg', 'png', 'pdf', 'jpeg'],
        transformation: [{ width: 1000, crop: "limit", quality: "auto" }],
        public_id: (req, file) => {
            let name = file.originalname.substring(0, file.originalname.lastIndexOf('.')) || file.originalname;
            name = name.replace(/\s+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, "");
            return `${name}_${Date.now()}`;
        }
    },
});
const upload = multer({ storage: storage });

const storagePerfil = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'perfil_membros',
        allowed_formats: ['jpg', 'png', 'jpeg'],
        transformation: [{ width: 300, height: 300, crop: "fill", gravity: "face", quality: "auto" }]
    },
});
const uploadPerfil = multer({ storage: storagePerfil });

module.exports = { cloudinary, upload, uploadPerfil };