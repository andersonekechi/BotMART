const router = require('express').Router();
const productController = require('../controllers/productController');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, productController.getAll);
router.get('/:id', authMiddleware, productController.getOne);
router.post('/', authMiddleware, productController.create);
router.put('/:id', authMiddleware, productController.update);
router.delete('/:id', authMiddleware, productController.remove);
router.delete('/:id/permanent', authMiddleware, productController.hardDelete);
router.post('/:id/license-keys', authMiddleware, productController.addLicenseKeys);

module.exports = router;
