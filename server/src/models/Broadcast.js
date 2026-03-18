const mongoose = require('mongoose');

const broadcastSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      default: '',
    },
    photo: {
      type: String,
      default: null,
    },
    scheduledAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['scheduled', 'sent', 'cancelled'],
      default: 'scheduled',
    },
    sentCount: {
      type: Number,
      default: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: Number,
      default: null,
    },
    repeat: {
      type: String,
      enum: ['none', 'daily', 'weekly'],
      default: 'none',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Broadcast', broadcastSchema);
