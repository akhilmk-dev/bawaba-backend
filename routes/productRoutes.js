const express = require('express');
const { createProduct, getProducts, deleteProduct, getProductById, updateProduct, shopifyProductDeleteWebhook, updateVariantQuantity, updateVariantPrice, getDashboardStats, getFullDashboard, createProductAndPublishToMarket, createProductAndPublishToMarkets, getMarkets, getLocationsByMarketId, getProvinces } = require('../controllers/productController');
const { authenticate } = require('../middleware/authMiddleware');
const router = express.Router();

// POST /api/products

router.post("/",authenticate, createProductAndPublishToMarkets);
router.get("/",authenticate, getProducts);
router.get("/market/All",authenticate,getMarkets);
router.get("/province/all",getProvinces);
router.get("/locations/byMarket/:marketId",getLocationsByMarketId)
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
