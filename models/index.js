const mongoose = require('mongoose');

// ─── Category ─────────────────────────────────────────────────────────────────
const categorySchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true },
  slug:        { type: String, unique: true },
  description: String,
  image:       String,
  icon:        String,
  parent:      { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  isActive:    { type: Boolean, default: true },
  sortOrder:   { type: Number, default: 0 },
}, { timestamps: true });

categorySchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name.toLowerCase().replace(/\s+/g, '-');
  }
  next();
});

const Category = mongoose.model('Category', categorySchema);

// ─── Order ────────────────────────────────────────────────────────────────────
const orderItemSchema = new mongoose.Schema({
  product:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:      String,
  image:     String,
  price:     Number,
  quantity:  Number,
  variant:   Object,
});

const orderSchema = new mongoose.Schema({
  orderId:   { type: String, unique: true },
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items:     [orderItemSchema],
  address:   {
    name: String, phone: String, line1: String, line2: String,
    city: String, state: String, pincode: String, country: String,
  },
  subtotal:  Number,
  discount:  { type: Number, default: 0 },
  coupon:    String,
  shipping:  { type: Number, default: 0 },
  tax:       { type: Number, default: 0 },
  total:     Number,
  status:    {
    type: String,
    enum: ['pending','confirmed','processing','shipped','delivered','cancelled','refunded'],
    default: 'pending',
  },
  payment: {
    method:    { type: String, enum: ['razorpay', 'cod', 'wallet'], default: 'razorpay' },
    status:    { type: String, enum: ['pending','paid','failed','refunded'], default: 'pending' },
    razorpayOrderId:   String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    paidAt:    Date,
  },
  timeline: [{
    status:  String,
    message: String,
    date:    { type: Date, default: Date.now },
  }],
  notes:        String,
  deliveredAt:  Date,
  cancelReason: String,
}, { timestamps: true });

orderSchema.pre('save', function(next) {
  if (!this.orderId) {
    this.orderId = 'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  }
  next();
});

const Order = mongoose.model('Order', orderSchema);

// ─── Review ───────────────────────────────────────────────────────────────────
const reviewSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  order:    { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  rating:   { type: Number, required: true, min: 1, max: 5 },
  title:    String,
  comment:  { type: String, required: true },
  images:   [String],
  isVerified:{ type: Boolean, default: false },
  helpful:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

const Review = mongoose.model('Review', reviewSchema);

// ─── Cart ─────────────────────────────────────────────────────────────────────
const cartSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: [{
    product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, default: 1 },
    variant:  Object,
  }],
  coupon:    String,
  discount:  { type: Number, default: 0 },
}, { timestamps: true });

const Cart = mongoose.model('Cart', cartSchema);

// ─── Coupon ───────────────────────────────────────────────────────────────────
const couponSchema = new mongoose.Schema({
  code:        { type: String, required: true, unique: true, uppercase: true },
  type:        { type: String, enum: ['percent', 'flat'], default: 'percent' },
  value:       { type: Number, required: true },
  minOrder:    { type: Number, default: 0 },
  maxDiscount: Number,
  usageLimit:  { type: Number, default: 100 },
  usedCount:   { type: Number, default: 0 },
  validFrom:   Date,
  validUntil:  Date,
  isActive:    { type: Boolean, default: true },
  categories:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
}, { timestamps: true });

const Coupon = mongoose.model('Coupon', couponSchema);

// ─── Collection ───────────────────────────────────────────────────────────────
const collectionSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true },
  slug:        { type: String, unique: true },
  description: String,
  image:       String,
  icon:        String,
  isActive:    { type: Boolean, default: true },
  sortOrder:   { type: Number, default: 0 },
}, { timestamps: true });

collectionSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name.toLowerCase().replace(/\s+/g, '-');
  }
  next();
});

const Collection = mongoose.model('Collection', collectionSchema);

// ─── Celebrity Pick ───────────────────────────────────────────────────────────
const celebrityPickSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true },
  slug:        { type: String, unique: true },
  description: String,
  image:       String,
  icon:        String,
  celebrity:   String,
  isActive:    { type: Boolean, default: true },
  sortOrder:   { type: Number, default: 0 },
}, { timestamps: true });

celebrityPickSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name.toLowerCase().replace(/\s+/g, '-');
  }
  next();
});

const CelebrityPick = mongoose.model('CelebrityPick', celebrityPickSchema);

module.exports = { Category, Order, Review, Cart, Coupon, Collection, CelebrityPick };
