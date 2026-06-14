const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  let token;
  
  // Check Authorization header
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
    console.log('🔐 Bearer token found in Authorization header');
  } else if (req.cookies?.token) {
    token = req.cookies.token;
    console.log('🔐 Token found in cookies');
  } else {
    console.warn('❌ No authentication token provided');
    console.warn('📋 Headers:', Object.keys(req.headers));
  }
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized - no token provided' });
  }
  
  try {
    const secret = process.env.JWT_SECRET || 'shopnest_fallback_secret_key_2025';
    const decoded = jwt.verify(token, secret);
    console.log('✅ Token verified for user:', decoded.id);
    
    req.user = await User.findById(decoded.id);
    if (!req.user) {
      console.warn('❌ User not found for ID:', decoded.id);
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    
    next();
  } catch (err) {
    console.error('❌ Token verification failed:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

exports.adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

exports.sellerOrAdmin = (req, res, next) => {
  if (!['admin', 'seller'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, message: 'Seller access required' });
  }
  next();
};
