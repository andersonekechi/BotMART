const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    senderTelegramId: {
      type: Number,
      required: true,
    },
    senderRole: {
      type: String,
      enum: ['buyer', 'seller', 'admin'],
      required: true,
    },
    receiverTelegramId: {
      type: Number,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

messageSchema.index({ senderTelegramId: 1, createdAt: -1 });
messageSchema.index({ receiverTelegramId: 1, read: 1 });

module.exports = mongoose.model('Message', messageSchema);
