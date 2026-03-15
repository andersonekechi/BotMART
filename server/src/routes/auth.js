const router = require('express').Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

router.post('/login', authController.login);
router.get('/me', authMiddleware, authController.me);
router.put('/password', authMiddleware, authController.changePassword);

module.exports = router;
