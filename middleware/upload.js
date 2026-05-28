const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ─── Cloudinary setup (only if env vars are present) ───────────────────────
const USE_CLOUDINARY = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

let cloudinaryStorage;

if (USE_CLOUDINARY) {
  const cloudinary = require('cloudinary').v2;
  const { CloudinaryStorage } = require('multer-storage-cloudinary');

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  cloudinaryStorage = (folder) => new CloudinaryStorage({
    cloudinary,
    params: {
      folder:          `auragems/${folder}`,
      allowed_formats: ['jpg','jpeg','png','webp','gif'],
      transformation:  [{ width: 1000, height: 1000, crop: 'limit', quality: 'auto' }],
    },
  });

  console.log('☁️  Cloudinary storage enabled');
} else {
  const dirs = ['products','categories','avatars','bulk'];
  dirs.forEach(d => {
    const full = path.join(__dirname, `../uploads/${d}`);
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  });
  console.log('💾  Local disk storage — set CLOUDINARY_* env vars for production');
}

const getStorage = (folder) => {
  if (USE_CLOUDINARY) return cloudinaryStorage(folder);
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, `../uploads/${folder}`)),
    filename:    (req, file, cb) => {
      cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
    },
  });
};

// Cloudinary sets file.path = full https URL; local sets file.filename
exports.getFileUrl = (file, folder = 'products') => {
  if (USE_CLOUDINARY) return file.path;
  return `/uploads/${folder}/${file.filename}`;
};

const imageFilter = (req, file, cb) => {
  const ok = /jpeg|jpg|png|gif|webp/;
  if (ok.test(path.extname(file.originalname).toLowerCase()) && ok.test(file.mimetype))
    return cb(null, true);
  cb(new Error('Only image files allowed (jpg, png, webp, gif)'));
};

const csvFilter = (req, file, cb) => {
  if (file.mimetype === 'text/csv' || path.extname(file.originalname) === '.csv')
    return cb(null, true);
  cb(new Error('Only CSV files allowed'));
};

exports.uploadProductImages = multer({
  storage: getStorage('products'),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
}).array('images', 8);

exports.uploadSingleImage = (folder) => multer({
  storage: getStorage(folder),
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
}).single('image');

exports.uploadProductWithCelebrity = multer({
  storage: getStorage('products'),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 9 },
}).fields([
  { name: 'images', maxCount: 8 },
  { name: 'celebrityImage', maxCount: 1 }
]);

exports.uploadBulkCSV = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../uploads/bulk');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
  }),
  fileFilter: csvFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('file');
