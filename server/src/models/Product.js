const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    image: {
      type: String,
      default: null,
    },
    category: {
      type: String,
      default: 'general',
      trim: true,
    },
    stock: {
      type: Number,
      default: -1,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending_review'],
      default: 'active',
    },
    deliveryType: {
      type: String,
      enum: ['download_link', 'license_key', 'manual'],
      default: 'download_link',
    },
    deliveryContent: {
      type: String,
      default: '',
    },
    licenseKeys: [
      {
        key: String,
        used: { type: Boolean, default: false },
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
      },
    ],
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      default: null,
    },
    sellerTelegramId: {
      type: Number,
      default: null,
    },
    totalSold: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

productSchema.index({ status: 1, category: 1 });
productSchema.index({ seller: 1 });

module.exports = mongoose.model('Product', productSchema);
