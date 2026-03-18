const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, default: 1 },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    telegramId: {
      type: Number,
      required: true,
      unique: true,
    },
    username: {
      type: String,
      default: '',
    },
    firstName: {
      type: String,
      default: '',
    },
    lastName: {
      type: String,
      default: '',
    },
    cart: [cartItemSchema],
    totalSpent: {
      type: Number,
      default: 0,
    },
    orderCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
