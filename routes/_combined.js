// ─── Cart ─────────────────────────────────────────────────────────────────────
const cartRouter = require('express').Router();
const { protect } = require('../middleware/auth');
const { Cart, Coupon } = require('../models/index');
const Product = require('../models/Product');

cartRouter.get('/', protect, async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });
    res.json({ success: true, cart });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

cartRouter.post('/add', protect, async (req, res) => {
  try {
    const { productId, quantity = 1, variant } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = new Cart({ user: req.user._id, items: [] });
    const existing = cart.items.find(i => i.product.toString() === productId);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, product.stock);
    } else {
      cart.items.push({ product: productId, quantity: Math.min(quantity, product.stock), variant });
    }
    await cart.save();
    await cart.populate('items.product');
    res.json({ success: true, cart });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

cartRouter.put('/item/:productId', protect, async (req, res) => {
  try {
    const { quantity } = req.body;
    const cart = await Cart.findOne({ user: req.user._id });
    const item = cart.items.find(i => i.product.toString() === req.params.productId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    if (quantity <= 0) {
      cart.items = cart.items.filter(i => i.product.toString() !== req.params.productId);
    } else {
      item.quantity = quantity;
    }
    await cart.save();
    await cart.populate('items.product');
    res.json({ success: true, cart });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

cartRouter.delete('/item/:productId', protect, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    cart.items = cart.items.filter(i => i.product.toString() !== req.params.productId);
    await cart.save();
    res.json({ success: true, cart });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

cartRouter.post('/coupon', protect, async (req, res) => {
  try {
    const { code, total } = req.body;
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon) return res.status(400).json({ success: false, message: 'Invalid coupon' });
    if (coupon.validUntil && new Date() > coupon.validUntil) return res.status(400).json({ success: false, message: 'Coupon expired' });
    if (coupon.usedCount >= coupon.usageLimit) return res.status(400).json({ success: false, message: 'Coupon limit reached' });
    if (total < coupon.minOrder) return res.status(400).json({ success: false, message: `Min order ₹${coupon.minOrder}` });
    let discount = coupon.type === 'percent' ? (total * coupon.value / 100) : coupon.value;
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
    res.json({ success: true, discount: Math.floor(discount), coupon: coupon.code });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Orders ───────────────────────────────────────────────────────────────────
const ordersRouter = require('express').Router();
const { Order } = require('../models/index');

ordersRouter.get('/', protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort('-createdAt');
    res.json({ success: true, orders });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

ordersRouter.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id })
      .populate('items.product', 'name images slug');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

ordersRouter.put('/:id/cancel', protect, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Cannot cancel at this stage' });
    }
    order.status = 'cancelled';
    order.cancelReason = req.body.reason || 'Cancelled by user';
    order.timeline.push({ status: 'cancelled', message: order.cancelReason });
    await order.save();
    res.json({ success: true, order });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Mark COD payment as received (user confirms on delivery)
ordersRouter.put('/:id/payment-received', protect, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (order.payment?.method !== 'cod') return res.status(400).json({ success: false, message: 'Only for COD orders' });
    if (order.status !== 'delivered') return res.status(400).json({ success: false, message: 'Order must be delivered first' });
    order.payment.status = 'paid';
    order.payment.paidAt = new Date();
    order.timeline.push({ status: 'delivered', message: 'Payment received on delivery (COD)' });
    await order.save();
    res.json({ success: true, order });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Reviews ──────────────────────────────────────────────────────────────────
const reviewsRouter = require('express').Router();
const { Review } = require('../models/index');

reviewsRouter.get('/can-review/:productId', protect, async (req, res) => {
  try {
    // Check if user has a delivered order containing this product
    const orders = await Order.find({ user: req.user._id, status: 'delivered' });
    const hasBought = orders.some(o => o.items.some(i => i.product.toString() === req.params.productId));
    const alreadyReviewed = await Review.findOne({ product: req.params.productId, user: req.user._id });
    res.json({ success: true, canReview: hasBought && !alreadyReviewed, hasBought, alreadyReviewed: !!alreadyReviewed });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

reviewsRouter.get('/product/:productId', async (req, res) => {
  try {
    const reviews = await Review.find({ product: req.params.productId })
      .populate('user', 'name avatar').sort('-createdAt');
    res.json({ success: true, reviews });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

reviewsRouter.post('/', protect, async (req, res) => {
  try {
    const { productId, rating, title, comment, orderId } = req.body;
    const existing = await Review.findOne({ product: productId, user: req.user._id });
    if (existing) return res.status(400).json({ success: false, message: 'Already reviewed' });
    const review = await Review.create({ product: productId, user: req.user._id, rating, title, comment, order: orderId });
    // Update product rating
    const reviews = await Review.find({ product: productId });
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    await Product.findByIdAndUpdate(productId, { 'ratings.average': avg.toFixed(1), 'ratings.count': reviews.length });
    res.status(201).json({ success: true, review });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Wishlist ─────────────────────────────────────────────────────────────────
const wishlistRouter = require('express').Router();
const User = require('../models/User');

wishlistRouter.get('/', protect, async (req, res) => {
  const user = await User.findById(req.user._id).populate('wishlist');
  res.json({ success: true, wishlist: user.wishlist });
});

wishlistRouter.post('/toggle/:productId', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const idx = user.wishlist.indexOf(req.params.productId);
    if (idx > -1) user.wishlist.splice(idx, 1);
    else user.wishlist.push(req.params.productId);
    await user.save();
    res.json({ success: true, inWishlist: idx === -1, wishlist: user.wishlist });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = { cartRouter, ordersRouter, reviewsRouter, wishlistRouter };
