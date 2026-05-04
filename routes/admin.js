const router = require('express').Router();
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { protect, adminOnly } = require('../middleware/auth');
const { uploadBulkCSV, uploadSingleImage } = require('../middleware/upload');
const Product = require('../models/Product');
const User = require('../models/User');
const { Category, Order, Coupon } = require('../models/index');

// All routes require admin
router.use(protect, adminOnly);

// ── Dashboard Stats ──────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const [totalProducts, totalOrders, totalUsers, orders] = await Promise.all([
      Product.countDocuments({ isActive: true }),
      Order.countDocuments(),
      User.countDocuments({ role: 'user' }),
      Order.find({ 'payment.status': 'paid' }).select('total createdAt status'),
    ]);

    const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const today = new Date(); today.setHours(0,0,0,0);
    const todayOrders = orders.filter(o => new Date(o.createdAt) >= today).length;
    const pendingOrders = await Order.countDocuments({ status: { $in: ['pending', 'confirmed', 'processing'] } });

    // Revenue last 7 days
    const revenueChart = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const dayRev = orders.filter(o => {
        const od = new Date(o.createdAt);
        return od >= d && od < next && o.status !== 'cancelled';
      }).reduce((s, o) => s + o.total, 0);
      revenueChart.push({ date: d.toISOString().split('T')[0], revenue: dayRev });
    }

    res.json({ success: true, stats: { totalProducts, totalOrders, totalUsers, revenue, todayOrders, pendingOrders }, revenueChart });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Bulk Upload Products via CSV ──────────────────────────────────────────────
router.post('/products/bulk', (req, res, next) => {
  uploadBulkCSV(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'CSV file required' });

    const fileContent = fs.readFileSync(req.file.path, 'utf8');
    const records = parse(fileContent, { columns: true, skip_empty_lines: true, trim: true });

    const results = { created: 0, updated: 0, errors: [] };

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      try {
        // Find or create category
        let category = await Category.findOne({ name: { $regex: new RegExp(row.category, 'i') } });
        if (!category) {
          category = await Category.create({ name: row.category });
        }

        const productData = {
          name:        row.name,
          description: row.description || row.name,
          shortDesc:   row.short_description || '',
          price:       parseFloat(row.price) || 0,
          mrp:         parseFloat(row.mrp) || parseFloat(row.price),
          stock:       parseInt(row.stock) || 0,
          brand:       row.brand || '',
          sku:         row.sku || '',
          category:    category._id,
          tags:        row.tags ? row.tags.split('|').map(t => t.trim()) : [],
          isActive:    row.is_active !== 'false',
          isFeatured:  row.is_featured === 'true',
          images:      [
            row.image_url   ? { url: row.image_url,   alt: row.name, isPrimary: true  } : null,
            row.image_url_2 ? { url: row.image_url_2, alt: row.name, isPrimary: false } : null,
            row.image_url_3 ? { url: row.image_url_3, alt: row.name, isPrimary: false } : null,
            row.image_url_4 ? { url: row.image_url_4, alt: row.name, isPrimary: false } : null,
          ].filter(Boolean),
        };

        // If SKU exists, update; otherwise create
        if (row.sku) {
          const existing = await Product.findOne({ sku: row.sku });
          if (existing) {
            await Product.findByIdAndUpdate(existing._id, productData);
            results.updated++;
          } else {
            await Product.create(productData);
            results.created++;
          }
        } else {
          await Product.create(productData);
          results.created++;
        }
      } catch (e) {
        results.errors.push({ row: i + 2, message: e.message });
      }
    }

    // Cleanup temp file
    fs.unlinkSync(req.file.path);

    res.json({ success: true, message: `Bulk upload complete`, results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── CSV Template Download ─────────────────────────────────────────────────────
router.get('/products/bulk/template', (req, res) => {
  const headers = 'name,description,short_description,category,brand,sku,price,mrp,stock,tags,image_url,image_url_2,image_url_3,image_url_4,is_active,is_featured\n';
  const sample  = 'Sample Product,Full product description,Short desc,Electronics,BrandName,SKU001,999,1299,50,tag1|tag2,https://example.com/img.jpg,true,false\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=products_template.csv');
  res.send(headers + sample);
});

// ── Products CRUD ─────────────────────────────────────────────────────────────
router.get('/products', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category } = req.query;
    const query = {};
    if (search) query.$text = { $search: search };
    if (category) query.category = category;
    const total = await Product.countDocuments(query);
    const products = await Product.find(query).populate('category', 'name').sort('-createdAt').skip((page-1)*limit).limit(+limit);
    res.json({ success: true, products, total, pages: Math.ceil(total/limit) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category', 'name');
    if (!product) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/products/:id', (req, res, next) => {
  const { uploadProductImages } = require('../middleware/upload');
  uploadProductImages(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    let data;
    // Multipart form (with possible new images)
    if (req.body.data) {
      data = JSON.parse(req.body.data);
    } else {
      data = req.body;
    }
    // Merge newly uploaded images with kept existing ones
    if (req.files && req.files.length > 0) {
      const { getFileUrl } = require('../middleware/upload');
      const newImgs = req.files.map((f, i) => ({
        url: getFileUrl(f, 'products'),
        alt: data.name || '',
        isPrimary: false,
      }));
      const existing = data.keepImages || [];
      // Re-mark primary: first image in final array is primary
      const allImgs = [...existing, ...newImgs].map((img, i) => ({ ...img, isPrimary: i === 0 }));
      data.images = allImgs;
    } else if (data.keepImages) {
      data.images = data.keepImages.map((img, i) => ({ ...img, isPrimary: i === 0 }));
    }
    delete data.keepImages;
    const product = await Product.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    res.json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Categories ────────────────────────────────────────────────────────────────
router.get('/categories', async (req, res) => {
  const cats = await Category.find().sort('sortOrder');
  res.json({ success: true, categories: cats });
});

router.post('/categories', async (req, res) => {
  try {
    const cat = await Category.create(req.body);
    res.status(201).json({ success: true, category: cat });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const cat = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, category: cat });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    await Category.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Orders ────────────────────────────────────────────────────────────────────
router.get('/orders', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = status ? { status } : {};
    const total = await Order.countDocuments(query);
    const orders = await Order.find(query).populate('user', 'name email').sort('-createdAt').skip((page-1)*limit).limit(+limit);
    res.json({ success: true, orders, total, pages: Math.ceil(total/limit) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/orders/:id/status', async (req, res) => {
  try {
    const { status, message } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    order.status = status;
    order.timeline.push({ status, message: message || `Status updated to ${status}` });
    if (status === 'delivered') {
      order.deliveredAt = new Date();
      // Auto-mark COD payment as received on delivery
      if (order.payment?.method === 'cod') {
        order.payment.status = 'paid';
        order.payment.paidAt = new Date();
        order.timeline.push({ status: 'delivered', message: 'COD payment received on delivery' });
      }
    }
    await order.save();
    res.json({ success: true, order });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Users ─────────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total = await User.countDocuments();
    const users = await User.find().select('-password').sort('-createdAt').skip((page-1)*limit).limit(+limit);
    res.json({ success: true, users, total });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/users/:id/toggle', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    user.isActive = !user.isActive;
    await user.save();
    res.json({ success: true, user });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Coupons ───────────────────────────────────────────────────────────────────
router.get('/coupons', async (req, res) => {
  const coupons = await Coupon.find().sort('-createdAt');
  res.json({ success: true, coupons });
});

router.post('/coupons', async (req, res) => {
  try {
    const coupon = await Coupon.create(req.body);
    res.status(201).json({ success: true, coupon });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.put('/coupons/:id', async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, coupon });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.delete('/coupons/:id', async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
