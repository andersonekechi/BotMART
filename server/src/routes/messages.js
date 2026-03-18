const router = require('express').Router();
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const total = await Message.countDocuments();
    const messages = await Message.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    res.json({ messages, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const conversations = await Message.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$conversationId', lastMsg: { $first: '$$ROOT' }, count: { $sum: 1 } } },
      { $sort: { 'lastMsg.createdAt': -1 } },
      { $limit: 50 },
    ]);
    res.json(conversations);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
