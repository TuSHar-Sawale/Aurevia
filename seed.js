require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('./models/User');
const Product = require('./models/Product');
const { Category } = require('./models/index');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/marketplace';

const categories = [
  { name: 'Electronics',    icon: '📱', sortOrder: 1 },
  { name: 'Fashion',        icon: '👗', sortOrder: 2 },
  { name: 'Home & Kitchen', icon: '🏠', sortOrder: 3 },
  { name: 'Books',          icon: '📚', sortOrder: 4 },
  { name: 'Sports',         icon: '⚽', sortOrder: 5 },
  { name: 'Beauty',         icon: '💄', sortOrder: 6 },
  { name: 'Toys',           icon: '🎮', sortOrder: 7 },
  { name: 'Grocery',        icon: '🛒', sortOrder: 8 },
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Clear existing data
  await User.deleteMany({});
  await Category.deleteMany({});
  await Product.deleteMany({});
  console.log('Cleared existing data');

  // Create categories
  const createdCats = await Category.insertMany(categories);
  console.log(`Created ${createdCats.length} categories`);

  // Create admin user
  const adminPass = await bcrypt.hash('Admin@123', 12);
  const admin = await User.create({
    name: 'Admin User',
    email: 'admin@shopnest.com',
    password: adminPass,
    role: 'admin',
    isVerified: true,
  });
  console.log('Admin created:', admin.email);

  // Create sample user
  const userPass = await bcrypt.hash('User@123', 12);
  await User.create({
    name: 'John Doe',
    email: 'user@example.com',
    password: userPass,
    phone: '9876543210',
    role: 'user',
    isVerified: true,
  });
  console.log('Sample user created');

  // Create sample products
  const electronics = createdCats.find(c => c.name === 'Electronics');
  const fashion     = createdCats.find(c => c.name === 'Fashion');
  const home        = createdCats.find(c => c.name === 'Home & Kitchen');

  const products = [
    { name: 'Wireless Bluetooth Headphones', description: 'Premium sound quality with 30-hour battery life and active noise cancellation. Perfect for music lovers and professionals.', shortDesc: 'ANC headphones, 30hr battery', category: electronics._id, brand: 'SoundMax', price: 2999, mrp: 5999, stock: 45, isFeatured: true, isNewArrival: true, tags: ['headphones', 'bluetooth', 'audio'], images: [{ url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400', isPrimary: true }] },
    { name: 'Smart Watch Pro X', description: 'Track fitness, receive notifications, and monitor health with this premium smartwatch. Water resistant up to 50m.', shortDesc: 'Fitness tracking, heart rate monitor', category: electronics._id, brand: 'TechFit', price: 4999, mrp: 8999, stock: 30, isFeatured: true, isNewArrival: true, tags: ['smartwatch', 'fitness', 'wearable'], images: [{ url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400', isPrimary: true }] },
    { name: 'Men\'s Classic White Sneakers', description: 'Timeless design meets modern comfort. Premium leather upper with cushioned sole for all-day wear.', shortDesc: 'Leather upper, cushioned sole', category: fashion._id, brand: 'UrbanStep', price: 1499, mrp: 2999, stock: 100, isFeatured: false, isNewArrival: true, tags: ['shoes', 'sneakers', 'fashion'], images: [{ url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400', isPrimary: true }] },
    { name: 'Minimalist Desk Lamp', description: 'Modern LED desk lamp with 3 color temperatures and touch dimmer. USB charging port built in.', shortDesc: 'LED, touch dimmer, USB port', category: home._id, brand: 'LumniLight', price: 899, mrp: 1599, stock: 60, isFeatured: true, isNewArrival: false, tags: ['lamp', 'desk', 'led', 'home'], images: [{ url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=400', isPrimary: true }] },
    { name: 'Portable Power Bank 20000mAh', description: 'Never run out of charge. Ultra-capacity power bank with fast charging for all your devices.', shortDesc: 'Fast charging, dual USB output', category: electronics._id, brand: 'PowerCore', price: 1299, mrp: 2499, stock: 75, isFeatured: false, isNewArrival: false, tags: ['powerbank', 'charging', 'portable'], images: [{ url: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400', isPrimary: true }] },
    { name: 'Premium Yoga Mat', description: 'Non-slip extra thick yoga mat with alignment lines. Perfect for yoga, pilates, and floor exercises.', shortDesc: '6mm thick, non-slip, with bag', category: createdCats.find(c => c.name === 'Sports')._id, brand: 'FlexFit', price: 699, mrp: 1299, stock: 85, isFeatured: false, isNewArrival: true, tags: ['yoga', 'fitness', 'mat'], images: [{ url: 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=400', isPrimary: true }] },
    { name: 'Stainless Steel Water Bottle', description: 'Double-wall vacuum insulated bottle keeps drinks cold for 24 hours or hot for 12 hours.', shortDesc: 'Insulated, 1L, BPA free', category: home._id, brand: 'HydroMax', price: 549, mrp: 999, stock: 120, isFeatured: true, isNewArrival: false, tags: ['bottle', 'water', 'insulated'], images: [{ url: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400', isPrimary: true }] },
    { name: 'Wireless Phone Charger Pad', description: 'Fast wireless charging pad compatible with all Qi-enabled devices. LED indicator, non-slip base.', shortDesc: '15W fast charge, Qi compatible', category: electronics._id, brand: 'ChargeFast', price: 799, mrp: 1499, stock: 90, isFeatured: false, isNewArrival: true, tags: ['charger', 'wireless', 'phone'], images: [{ url: 'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=400', isPrimary: true }] },
  ];

  for (const p of products) {
    await Product.create(p);
  }
  console.log(`Created ${products.length} sample products`);

  console.log('\n✅ Seeding complete!');
  console.log('─────────────────────────────');
  console.log('Admin login:  admin@shopnest.com / Admin@123');
  console.log('User login:   user@example.com / User@123');
  console.log('─────────────────────────────');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
