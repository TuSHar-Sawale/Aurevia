require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/shopnest';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Store Admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function createAdmin() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD before running create-admin.');
  }

  await mongoose.connect(MONGO_URI);

  const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() }).select('+password');
  if (existing) {
    existing.name = ADMIN_NAME;
    existing.password = ADMIN_PASSWORD;
    existing.role = 'admin';
    existing.isActive = true;
    existing.isVerified = true;
    await existing.save();
    console.log(`Updated admin user: ${existing.email}`);
  } else {
    const admin = await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL.toLowerCase(),
      password: ADMIN_PASSWORD,
      role: 'admin',
      isActive: true,
      isVerified: true,
    });
    console.log(`Created admin user: ${admin.email}`);
  }

  await mongoose.disconnect();
}

createAdmin()
  .then(() => {
    console.log('Admin bootstrap complete.');
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err.message);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });
