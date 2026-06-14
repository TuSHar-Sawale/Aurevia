require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const path       = require('path');
const rateLimit  = require('express-rate-limit');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const requiredEnv = ['MONGO_URI', 'JWT_SECRET'];
const optionalButRecommendedEnv = [
  'ALLOWED_ORIGINS',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

if (isProduction) {
  const missingRequired = requiredEnv.filter((key) => !process.env[key]);
  if (missingRequired.length) {
    throw new Error(`Missing required production environment variables: ${missingRequired.join(', ')}`);
  }

  const missingRecommended = optionalButRecommendedEnv.filter((key) => !process.env[key]);
  if (missingRecommended.length) {
    console.warn(`Production warning: missing optional environment variables: ${missingRecommended.join(', ')}`);
  }
}

// Trust Railway/Render style reverse proxies so rate limiting and request IPs work correctly.
app.set('trust proxy', 1);

// ─── CORS ──────────────────────────────────────────────────────────────────
// Since the frontend is served BY this Express server (same origin),
// CORS is only needed for external API clients (Postman, mobile apps, etc.)
//
// Allowed origins:
//   - Same origin requests (no origin header) — always allowed
//   - localhost variants for local dev
//   - Any Railway/Render/Vercel deployment URL set via ALLOWED_ORIGINS env var
//     (comma-separated list, e.g. "https://auragems.up.railway.app,https://auragems.com")

const getAllowedOrigins = () => {
  const base = [
    'http://localhost:5000',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:5500',
  ];
  // Add any extra origins from env (comma separated)
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).forEach(o => base.push(o));
  }
  // Legacy support
  if (process.env.CLIENT_URL) base.push(process.env.CLIENT_URL);
  return base;
};

const corsOptions = {
  origin: (origin, cb) => {
    // Allow requests with no origin — same-origin browser requests, curl, Postman, mobile
    if (!origin) return cb(null, true);
    const allowed = getAllowedOrigins();
    if (allowed.includes(origin)) return cb(null, true);
    // In development allow all origins
    if (!isProduction) return cb(null, true);
    console.warn(`CORS blocked: ${origin}`);
    cb(new Error(`CORS policy: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Total-Count'],
  optionsSuccessStatus: 200, // Some browsers (IE11) choke on 204
};

// Handle preflight OPTIONS requests for ALL routes
app.options('*', cors(corsOptions));
// Apply CORS to all routes
app.use(cors(corsOptions));

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false }));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Static: uploaded images ─────────────────────────────────────────────────
// Set CORP header so images load from any frontend origin (Live Server, file://, etc)
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'uploads')));

// ─── Rate limiting ─────────────────────────────────────────────────────────
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api/', limiter);

// ─── Database ──────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/shopnest')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// ─── API Routes ────────────────────────────────────────────────────────────

// Dedicated categories endpoint — guaranteed to work regardless of route order in products.js
app.get('/api/categories', async (req, res) => {
  try {
    const { Category } = require('./models/index');
    const categories = await Category.find({ isActive: true }).sort('sortOrder');
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/cart',     require('./routes/cart'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/payment',  require('./routes/payment'));
app.use('/api/reviews',  require('./routes/reviews'));
app.use('/api/wishlist', require('./routes/wishlist'));
app.get('/api/health',   (req, res) => res.json({ status: 'OK', time: new Date() }));
app.get('/api/deployment-check', (req, res) => {
  res.json({
    success: true,
    environment: process.env.NODE_ENV || 'development',
    checks: {
      mongoConfigured: !!process.env.MONGO_URI,
      jwtConfigured: !!process.env.JWT_SECRET,
      razorpayConfigured: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      cloudinaryConfigured: !!(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
      ),
      allowedOriginsConfigured: !!process.env.ALLOWED_ORIGINS,
    },
  });
});

// ─── One-time fix: update all absolute image URLs in DB to relative paths ──────────
app.get('/api/admin/fix-image-urls', async (req, res) => {
  try {
    const Product = require('./models/Product');
    const products = await Product.find({});
    let fixed = 0;
    for (const p of products) {
      let changed = false;
      if (p.images && p.images.length) {
        p.images = p.images.map(img => {
          if (img.url && (img.url.startsWith('http://') || img.url.startsWith('https://'))) {
            try {
              img.url = new URL(img.url).pathname; // keep only /uploads/...
              changed = true;
            } catch(e) {}
          }
          return img;
        });
      }
      if (changed) { await p.save(); fixed++; }
    }
    res.json({ success: true, message: `Fixed ${fixed} products out of ${products.length}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Serve Frontend (public folder) ────────────────────────────────────────
// This makes everything same-origin: no CORS, no Live Server needed.
// Open http://localhost:5000 in the browser — done.
app.use(express.static(path.join(__dirname, 'public')));

// Admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Catch-all → serve index.html (for any unknown GET)
app.get('*', (req, res) => {
  // Only serve HTML for browser navigation requests, not API calls
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error handler ─────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 Aurevia is running!');
  console.log(`   🛍️  Store  →  http://localhost:${PORT}`);
  console.log(`   🔧  Admin  →  http://localhost:${PORT}/admin`);
  console.log(`   🔌  API    →  http://localhost:${PORT}/api`);
  console.log('');
  console.log('   ✅ Just open http://localhost:5000 — no Live Server needed!');
  console.log('');
  
  // Startup checks
  console.log('📋 Configuration Check:');
  console.log(`   ${process.env.JWT_SECRET ? '✅' : '❌'} JWT_SECRET configured`);
  console.log(`   ${process.env.MONGO_URI ? '✅' : '❌'} MongoDB URI configured`);
  console.log(`   ${process.env.RAZORPAY_KEY_ID ? '✅' : '❌'} RAZORPAY_KEY_ID: ${process.env.RAZORPAY_KEY_ID ? '***' + process.env.RAZORPAY_KEY_ID.slice(-8) : 'missing'}`);
  console.log(`   ${process.env.RAZORPAY_KEY_SECRET ? '✅' : '❌'} RAZORPAY_KEY_SECRET: ${process.env.RAZORPAY_KEY_SECRET ? '***' + process.env.RAZORPAY_KEY_SECRET.slice(-8) : 'missing'}`);
  console.log('');
});

module.exports = app;
