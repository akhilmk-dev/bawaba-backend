const express = require('express');
const { getOrders, createOrder, getOrderByVendor, updateOrder, cancelOrder, getOrderById, markAsPaid, fulfilOrder, fulfillSingleItem, deleteOrder } = require('../controllers/orderController');
const { authenticate } = require('../middleware/authMiddleware');
const router = express.Router();

router.get('/',authenticate,getOrders);
router.post('/',createOrder);
router.get(`/:id`,authenticate,getOrderByVendor);
// full order details
router.get('/all/:id',authenticate,getOrderById);
router.post('/update',updateOrder);
router.post('/cancel',cancelOrder);
router.post('/fulfilled',fulfilOrder);
router.post('/fulfillSingleItem',fulfillSingleItem);
router.post('/delete',deleteOrder);


module.exports = router;
