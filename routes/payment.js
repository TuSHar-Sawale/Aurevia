const express = require('express');
const router = require('express').Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { protect } = require('../middleware/auth');
const { Order, Cart } = require('../models/index');
const Product = require('../models/Product');

const getRazorpay = () => new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });

// ── Create Razorpay Order ───────────────────────────────────────────────────
router.post('/create-order', protect, async (req, res) => {
  try {
    const { items, address, coupon, notes } = req.body;

    // Validate items and calculate total
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive) {
        return res.status(400).json({ success: false, message: `Product ${item.productId} not available` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ success: false, message: `${product.name} is out of stock` });
      }
      subtotal += product.price * item.quantity;
      orderItems.push({
        product: product._id,
        name:    product.name,
        image:   product.images[0]?.url || '',
        price:   product.price,
        quantity:item.quantity,
        variant: item.variant,
      });
    }

    const shipping = subtotal > 500 ? 0 : 49;
    const tax      = Math.round(subtotal * 0.18);
    const total    = subtotal + shipping + tax;

    // Create Razorpay order
    const rzpOrder = await getRazorpay().orders.create({
      amount:   total * 100, // paise
      currency: 'INR',
      receipt:  'rcpt_' + Date.now(),
      notes:    { userId: req.user._id.toString() },
    });

    // Create pending DB order
    const order = await Order.create({
      user:    req.user._id,
      items:   orderItems,
      address, notes,
      subtotal, shipping, tax, total,
      payment: { method: 'razorpay', razorpayOrderId: rzpOrder.id },
      timeline:[{ status: 'pending', message: 'Order placed, awaiting payment' }],
    });

    res.json({
      success: true,
      order: { dbOrderId: order._id, orderId: order.orderId, total },
      razorpay: {
        key:      process.env.RAZORPAY_KEY_ID,
        orderId:  rzpOrder.id,
        amount:   rzpOrder.amount,
        currency: rzpOrder.currency,
        name:     'Aurevia',
        description: `Order ${order.orderId}`,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Verify Payment ──────────────────────────────────────────────────────────
router.post('/verify', protect, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, dbOrderId } = req.body;

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      await Order.findByIdAndUpdate(dbOrderId, {
        'payment.status': 'failed',
        $push: { timeline: { status: 'failed', message: 'Payment verification failed' } },
      });
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    // Update order
    const order = await Order.findByIdAndUpdate(dbOrderId, {
      status: 'confirmed',
      'payment.status': 'paid',
      'payment.razorpayPaymentId': razorpay_payment_id,
      'payment.razorpaySignature': razorpay_signature,
      'payment.paidAt': new Date(),
      $push: { timeline: { status: 'confirmed', message: 'Payment successful, order confirmed' } },
    }, { new: true });

    // Reduce stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity, soldCount: item.quantity },
      });
    }

    // Clear cart
    await Cart.findOneAndUpdate({ user: req.user._id }, { items: [] });

    res.json({ success: true, message: 'Payment verified', orderId: order.orderId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── COD Order ───────────────────────────────────────────────────────────────
router.post('/cod', protect, async (req, res) => {
  try {
    const { items, address, notes } = req.body;
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) continue;
      subtotal += product.price * item.quantity;
      orderItems.push({ product: product._id, name: product.name, image: product.images[0]?.url, price: product.price, quantity: item.quantity });
    }

    const shipping = subtotal > 500 ? 0 : 49;
    const tax = Math.round(subtotal * 0.18);
    const total = subtotal + shipping + tax;

    const order = await Order.create({
      user: req.user._id, items: orderItems, address, notes,
      subtotal, shipping, tax, total, status: 'confirmed',
      payment: { method: 'cod', status: 'pending' },
      timeline: [{ status: 'confirmed', message: 'COD order placed' }],
    });

    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity, soldCount: item.quantity } });
    }
    await Cart.findOneAndUpdate({ user: req.user._id }, { items: [] });

    res.status(201).json({ success: true, orderId: order.orderId, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// Webhook endpoint
router.post('/webhook', async (req, res) => {
  res.json({ status: 'ok' });
});


module.exports = router;
