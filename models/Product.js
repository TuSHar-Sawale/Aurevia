const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  name:  String,
  value: String,
  price: Number,
  stock: Number,
  sku:   String,
});

const productSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  slug:         { type: String, unique: true },
  description:  { type: String, required: true },
  shortDesc:    { type: String },
  category:     { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  subcategory:  { type: String },
  brand:        { type: String },
  sku:          { type: String, unique: true, sparse: true },
  price:        { type: Number, required: true, min: 0 },
  mrp:          { type: Number },
  discount:     { type: Number, default: 0 },
  stock:        { type: Number, required: true, default: 0 },
  images:       [{ url: String, alt: String, isPrimary: Boolean }],
  variants:     [variantSchema],
  tags:         [String],
  weight:       Number,
  dimensions:   { length: Number, width: Number, height: Number },
  isFeatured:   { type: Boolean, default: false },
  isActive:     { type: Boolean, default: true },
  isNewArrival: { type: Boolean, default: true },
  codAvailable: { type: Boolean, default: true },
  soldCount:    { type: Number, default: 0 },
  viewCount:    { type: Number, default: 0 },
  ratings: {
    average: { type: Number, default: 0 },
    count:   { type: Number, default: 0 },
  },
  seller:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  meta: {
    title:       String,
    description: String,
    keywords:    String,
  },
}, { timestamps: true });

// Auto-generate slug
productSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name.toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, '-') + '-' + Date.now();
  }
  // Calculate discount if mrp given
  if (this.mrp && this.price) {
    this.discount = Math.round(((this.mrp - this.price) / this.mrp) * 100);
  }
  next();
});

productSchema.index({ name: 'text', description: 'text', tags: 'text', brand: 'text' });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ price: 1 });

module.exports = mongoose.model('Product', productSchema);
