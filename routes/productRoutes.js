const express = require('express');
const { createProduct, getProducts, deleteProduct, getProductById, updateProduct, shopifyProductDeleteWebhook, updateVariantQuantity, updateVariantPrice, getDashboardStats, getFullDashboard } = require('../controllers/productController');
const { authenticate } = require('../middleware/authMiddleware');
const router = express.Router();

// POST /api/products

router.post("/",authenticate, createProduct);
router.get("/",authenticate, getProducts);
router.delete('/delete/:productId',authenticate, deleteProduct);
router.get('/:productId',authenticate, getProductById);
router.put('/update/:productId',authenticate, updateProduct);
router.post('/product-delete',authenticate, shopifyProductDeleteWebhook);
router.put("/:productId/variant/:variantId/quantity",authenticate,  updateVariantQuantity);
router.put("/:productId/variant/:variantId/price",authenticate,  updateVariantPrice);
router.put("/variant/:variantId/quantity",authenticate,  updateVariantQuantity);
router.put("/variant/:variantId/price",authenticate,  updateVariantPrice);
router.get("/dashboard/stats",authenticate,getDashboardStats);

module.exports = router
