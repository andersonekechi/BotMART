const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
    },
    telegramUserId: {
      type: Number,
      required: true,
    },
    telegramUsername: {
      type: String,
      default: '',
    },
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        productName: String,
        quantity: { type: Number, default: 1 },
        price: Number,
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'delivered', 'cancelled', 'refunded'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['stripe', 'crypto'],
      default: 'stripe',
    },
    paymentId: {
      type: String,
      default: null,
    },
    deliveryDetails: [
      {
        productName: String,
        type: { type: String, enum: ['download_link', 'license_key'] },
        content: String,
      },
    ],
    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
