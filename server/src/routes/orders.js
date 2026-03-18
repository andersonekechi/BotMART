const router = require('express').Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, orderController.getAll);
router.get('/analytics', authMiddleware, orderController.getAnalytics);
router.get('/:id', authMiddleware, orderController.getOne);
router.put('/:id/status', authMiddleware, orderController.updateStatus);

module.exports = router;
