const router = require('express').Router();
const Seller = require('../models/Seller');
const Product = require('../models/Product');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const total = await Seller.countDocuments(filter);
    const sellers = await Seller.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    res.json({ sellers, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const seller = await Seller.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!seller) return res.status(404).json({ error: 'Seller not found' });
    res.json(seller);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/:id/products', authMiddleware, async (req, res) => {
  try {
    const products = await Product.find({ seller: req.params.id }).sort({ createdAt: -1 });
    res.json(products);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
