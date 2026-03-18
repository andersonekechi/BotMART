const router = require('express').Router();
const Wallet = require('../models/Wallet');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const total = await Wallet.countDocuments();
    const wallets = await Wallet.find()
      .select('-transactions')
      .sort({ balance: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    res.json({ wallets, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/:telegramId', authMiddleware, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ telegramId: parseInt(req.params.telegramId) });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    res.json(wallet);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/:telegramId/credit', authMiddleware, async (req, res) => {
  try {
    const { amount, description } = req.body;
    const wallet = await Wallet.findOne({ telegramId: parseInt(req.params.telegramId) });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    wallet.deposit(parseFloat(amount), description || 'Admin credit');
    await wallet.save();
    res.json(wallet);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
