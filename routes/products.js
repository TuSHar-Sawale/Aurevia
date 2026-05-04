const router = require('express').Router();
const Product = require('../models/Product');
const { Category } = require('../models/index');
const { protect, adminOnly, sellerOrAdmin } = require('../middleware/auth');
const { uploadProductImages } = require('../middleware/upload');

// GET all products with filtering, sorting, pagination
router.get('/', async (req, res) => {
  try {
    const { search, category, brand, minPrice, maxPrice, sort, page = 1, limit = 12, featured, isNewArrival } = req.query;
    const query = { isActive: true };

    if (search) query.$text = { $search: search };
    if (category) {
      const cat = await Category.findOne({ slug: category });
      if (cat) query.category = cat._id;
    }
    if (brand) query.brand = { $regex: brand, $options: 'i' };
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (featured === 'true') query.isFeatured = true;
    if (isNewArrival === 'true') query.isNewArrival = true;

    const sortMap = {
      price_asc: { price: 1 }, price_desc: { price: -1 },
      newest: { createdAt: -1 }, popular: { soldCount: -1 },
      rating: { 'ratings.average': -1 },
    };
    const sortOption = sortMap[sort] || { createdAt: -1 };

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate('category', 'name slug')
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    res.json({ success: true, products, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET categories — defined BEFORE /:slug so Express doesn't swallow 'meta' as a slug
router.get('/meta/categories', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort('sortOrder');
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single product
router.get('/:slug', async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, isActive: true })
      .populate('category', 'name slug')
      .populate('seller', 'name');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    // Increment view count
    await Product.findByIdAndUpdate(product._id, { $inc: { viewCount: 1 } });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CREATE product (admin/seller)
router.post('/', protect, sellerOrAdmin, (req, res, next) => {
  uploadProductImages(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const data = JSON.parse(req.body.data || '{}');
    const { getFileUrl } = require('../middleware/upload');
    const images = (req.files || []).map((f, i) => ({
      url: getFileUrl(f, 'products'),
      alt: data.name,
      isPrimary: i === 0,
    }));
    const product = await Product.create({ ...data, images, seller: req.user._id });
    res.status(201).json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// UPDATE product
router.put('/:id', protect, sellerOrAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE product
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Product deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
