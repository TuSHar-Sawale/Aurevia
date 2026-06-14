#!/usr/bin/env node
require('dotenv').config();
const Razorpay = require('razorpay');

console.log('🧪 Testing Razorpay Configuration...\n');

// Check environment
console.log('📋 Environment Variables:');
console.log(`   RAZORPAY_KEY_ID: ${process.env.RAZORPAY_KEY_ID ? '✅ Set' : '❌ Missing'}`);
console.log(`   RAZORPAY_KEY_SECRET: ${process.env.RAZORPAY_KEY_SECRET ? '✅ Set' : '❌ Missing'}`);
console.log('');

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error('❌ Missing Razorpay credentials!');
  process.exit(1);
}

// Initialize Razorpay
console.log('🔌 Initializing Razorpay...');
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Test order creation
(async () => {
  try {
    console.log('📝 Creating test order...');
    const order = await razorpay.orders.create({
      amount: 10000, // ₹100
      currency: 'INR',
      receipt: 'test_' + Date.now(),
    });
    console.log('✅ Order created successfully!');
    console.log('   Order ID:', order.id);
    console.log('   Amount:', order.amount / 100, 'INR');
    console.log('\n✅ Razorpay connection is working!');
  } catch (err) {
    console.error('❌ Failed to create order:');
    console.error('   Error:', err.message);
    console.error('   Code:', err.code);
    console.error('   Description:', err.description);
    console.error('   Status Code:', err.statusCode);
    process.exit(1);
  }
})();
