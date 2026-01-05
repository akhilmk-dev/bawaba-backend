
const express = require('express');
const { getShopifyCategories } = require('../controllers/collectionController');
const { authenticate } = require('../middleware/authMiddleware');
const router = express.Router();

// POST /api/products
router.get("/", authenticate,getShopifyCategories);

module.exports = router;
