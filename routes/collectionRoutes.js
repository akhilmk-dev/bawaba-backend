
const express = require('express');
const { getShopifyCategories } = require('../controllers/collectionController');
const router = express.Router();

// POST /api/products
router.get("/", getShopifyCategories);

module.exports = router;
