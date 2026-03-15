const Order = require('../models/Order');
const { deliverOrder } = require('../services/bot');

exports.getAll = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { telegramUsername: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .populate('items.product', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ orders, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('items.product');
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id).populate('items.product');
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const previousStatus = order.status;
    order.status = status;

    if (status === 'paid' && previousStatus === 'pending') {
      await order.save();
      const delivered = await deliverOrder(order);
      return res.json(delivered);
    }

    await order.save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const paidOrders = await Order.countDocuments({ status: { $in: ['paid', 'delivered'] } });
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const cancelledOrders = await Order.countDocuments({ status: 'cancelled' });

    const revenueAgg = await Order.aggregate([
      { $match: { status: { $in: ['paid', 'delivered'] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    const dailyRevenue = await Order.aggregate([
      { $match: { status: { $in: ['paid', 'delivered'] } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 30 },
    ]);

    const topProducts = await Order.aggregate([
      { $match: { status: { $in: ['paid', 'delivered'] } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productName',
          sold: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]);

    const paymentMethods = await Order.aggregate([
      { $match: { status: { $in: ['paid', 'delivered'] } } },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
    ]);

    const conversionRate = totalOrders > 0 ? ((paidOrders / totalOrders) * 100).toFixed(1) : 0;

    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('orderNumber totalAmount status createdAt telegramUsername');

    res.json({
      totalOrders,
      paidOrders,
      pendingOrders,
      cancelledOrders,
      totalRevenue,
      conversionRate: parseFloat(conversionRate),
      dailyRevenue: dailyRevenue.reverse(),
      topProducts,
      paymentMethods,
      recentOrders,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
