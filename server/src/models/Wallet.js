const mongoose = require('mongoose');
const crypto = require('crypto');

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['deposit', 'purchase', 'sale_credit', 'commission', 'refund', 'withdrawal'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'completed',
    },
  },
  { timestamps: true }
);

const walletSchema = new mongoose.Schema(
  {
    telegramId: {
      type: Number,
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    btcAddress: {
      type: String,
      default: null,
    },
    ltcAddress: {
      type: String,
      default: null,
    },
    depositAddress: {
      type: String,
      required: true,
      unique: true,
    },
    totalDeposited: {
      type: Number,
      default: 0,
    },
    totalSpent: {
      type: Number,
      default: 0,
    },
    totalEarned: {
      type: Number,
      default: 0,
    },
    transactions: [transactionSchema],
    frozen: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

walletSchema.statics.generateDepositAddress = function () {
  return 'GSCF-' + crypto.randomBytes(12).toString('hex').toUpperCase();
};

walletSchema.methods.addTransaction = function (type, amount, description, orderId = null) {
  const balanceAfter = this.balance;
  this.transactions.push({ type, amount, description, orderId, balanceAfter });
  if (this.transactions.length > 100) {
    this.transactions = this.transactions.slice(-100);
  }
};

walletSchema.methods.deposit = function (amount, description = 'Wallet top-up') {
  this.balance += amount;
  this.totalDeposited += amount;
  this.addTransaction('deposit', amount, description);
  return this;
};

walletSchema.methods.deduct = function (amount, description = 'Purchase', orderId = null) {
  if (this.balance < amount) throw new Error('Insufficient balance');
  this.balance -= amount;
  this.totalSpent += amount;
  this.addTransaction('purchase', -amount, description, orderId);
  return this;
};

walletSchema.methods.credit = function (amount, description = 'Sale credit', orderId = null) {
  this.balance += amount;
  this.totalEarned += amount;
  this.addTransaction('sale_credit', amount, description, orderId);
  return this;
};

module.exports = mongoose.model('Wallet', walletSchema);
