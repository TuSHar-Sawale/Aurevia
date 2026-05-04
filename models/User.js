const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const addressSchema = new mongoose.Schema({
  label:    { type: String, default: 'Home' },
  name:     String,
  phone:    String,
  line1:    String,
  line2:    String,
  city:     String,
  state:    String,
  pincode:  String,
  country:  { type: String, default: 'India' },
  isDefault:{ type: Boolean, default: false },
});

const userSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true },
  password:   { type: String, required: true, minlength: 6, select: false },
  phone:      { type: String },
  avatar:     { type: String, default: '' },
  role:       { type: String, enum: ['user', 'admin', 'seller'], default: 'user' },
  addresses:  [addressSchema],
  isVerified: { type: Boolean, default: false },
  isActive:   { type: Boolean, default: true },
  wishlist:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  resetPasswordToken:   String,
  resetPasswordExpire:  Date,
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.matchPassword = async function(entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('User', userSchema);
