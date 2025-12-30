
const { handleOrderEdit, getVendorOrders } = require('../helper/orderHelper');
const Order = require('../models/Order');
const catchAsync = require('../utils/catchAsync');
const axios = require('axios');
const { NotFoundError } = require('../utils/customErrors');
const RemovedLineItem = require('../models/RemovedLineItem');
const OrderTimeline = require('../models/OrderTimeline');
const User = require('../models/User');

// get all orders
exports.getOrders = catchAsync(async (req, res, next) => {
   const page = parseInt(req.query.page) || 0;
   const limit = parseInt(req.query.limit) || 10;
   const skip = page * limit;
   const user = await User.findById(req.user?.id)?.populate('role');
   const { search, financial_status,sortBy,vendor_name} = req.query;

   if(user?.role?.role_name?.toLowerCase() == "vendor"){
      const vendorName = user.name;
      const result = await getVendorOrders(vendorName, page, limit,search, financial_status,sortBy);
      return res.status(200).json(result)
   }

   // Default sort
   let sort = { createdAt: -1 };
   if (req.query.sortBy) {
      sort = {};
      const sortParams = req.query.sortBy.split(',');
      sortParams.forEach(param => {
         const [field, order] = param.split(':');
         sort[field] = order === 'asc' ? 1 : -1;
      });
   }

   let filter = {
      deleted_at: { $in: [null, undefined] }
   };

   // search filter
   if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
         { order_number: regex },
         { 'customer.firstname': regex },
         { 'customer.lastname': regex }
      ];
   }

   if (vendor_name) {
      filter['line_items'] = {
         $elemMatch: { vendor_name}
      };
   }

   // Financial status filter
   if (financial_status) {
      filter.financial_status = financial_status;
   }

   // Fetch matching orders
   const orders = await Order.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(); 

   const total = await Order.countDocuments(filter);

   //  Filter out unrelated line_items if vendor_id is used
   const filteredOrders = orders.map(order => {
      if (vendor_name) {
         order.line_items = order.line_items.filter(item => item.vendor_name === vendor_name);
         // console.log("orderlineitems:",order.line_items)
      }
      return order;
   });
   // console.log("filteredOrders:",filteredOrders)

   // Send response
   res.status(200).json({
      status: 'success',
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: filteredOrders,
   });
});

//create order
exports.createOrder = catchAsync(async (req, res, next) => {
   const order = req.body;
   const orderExists = await Order?.findOne({ order_id: req.body.id ?? req.body.order_id });

   if(orderExists?.deleted_at)return res.status(200).json({status:"success",message:"update successfull"});

   if (orderExists) {
      orderExists.financial_status = order?.financial_status;
      orderExists.fulfillment_status = order?.fulfillment_status;
      orderExists.line_items = orderExists?.line_items?.map(item => ({
         ...item,
         fulfillment_status: order?.line_items?.find(lineItem => item?.id == lineItem?.id)?.fulfillment_status
      }));
      orderExists.currency = order?.currency;
      const data = await orderExists.save();
      return res.status(200).json({ status: "success", message: "order payment successful", data: data });
   }

   // Fetch fulfillment orders from Shopify
   const fulfillmentRes = await axios.get(`${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/orders/${order?.id}/fulfillment_orders.json`, {
      headers: {
         'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN,
         'Content-Type': 'application/json',
      }
   });

   const fulfillmentOrder = fulfillmentRes?.data?.fulfillment_orders?.[0];

   const metafieldsPerProduct = {};
   await Promise.all(order.line_items.map(async item => {
      if (!item?.product_id) return;
   
      try {
         const metafieldRes = await axios.get(
            `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/products/${item.product_id}/metafields.json`,
            {
               headers: {
                  'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN
               }
            }
         );

         console.log(metafieldRes?.data?.metafields,"metafields-ref")
   
         const vendorIdMeta = metafieldRes.data.metafields.find(mf => mf.key === "vendorid");
         const vendorMeta = metafieldRes.data.metafields.find(mf => mf.key === "vendor");
   
         metafieldsPerProduct[item.product_id] = {
            vendor_id: vendorIdMeta?.value || null,
            vendor_name: vendorMeta?.value || null
         };
      } catch (err) {
         console.error(`Error fetching metafields for product ${item.product_id}:`, err.message);
         metafieldsPerProduct[item.product_id] = {
            vendor_id: null,
            vendor_name: null
         };
      }
   }));
   
   // 🛠 Build final data
   const lineItems = order?.line_items?.map(item => {
      const meta = metafieldsPerProduct[item.product_id] || {};
      const fulfillmentLineItem = fulfillmentOrder?.line_items?.find(line => line.line_item_id === item.id);
      return {
         id: item?.id,
         name: item?.name || null,
         price: item?.price || null,
         product_id: item?.product_id || null,
         sku: item?.sku || null,
         total_discount: item?.total_discount || null,
         title: item?.title || null,
         quantity: item?.quantity || "",
         variant_id: item?.variant_id,
         vendor_name: item?.vendor,
         deleted_date: null,
         fulfillment_status: item?.fulfillment_status || "",
         fulfillment_item_id: fulfillmentLineItem?.id || "",
         vendor_id: meta.vendor_id,
      };
   });

   const newOrder = new Order({
      order_id: order?.id || "",
      fulfillment_id: fulfillmentOrder?.id || "",
      cancel_reason: null,
      cancelled_at: null,
      created_at: order?.created_at || null,
      deleted_at: order?.deleted_at || null,
      email: order?.email || "",
      name: order?.name || "",
      order_number: order?.order_number || "",
      payment_gate_way: order?.payment_gateway_names?.[0] || null,
      phone: order?.phone || "",
      currency: order?.currency || "",
      financial_status: order?.financial_status || "",
      fulfillment_status: order?.fulfillment_status || "",
      total_discounts: order?.total_discounts || null,
      total_price: order?.total_price || null,
      total_tax: order?.total_tax || null,
      subtotal_price: order?.subtotal_price || null,
      shipping_address: order?.shipping_address || {},
      customer: order?.customer || {},
      line_items: lineItems
   });

   await newOrder.save();

   await OrderTimeline.create({
      order_id: order.id,
      action: 'created',
      changes: newOrder,
      message: 'Order created'
   });

   res.status(200).json({ message: "New order created" });
});

//get all orders by id
exports.getOrderByVendor = catchAsync(async (req, res, next) => {
   const vendorId = req.params.id
   console.log("vendorId:",vendorId)
   const page = parseInt(req.query.page) || 1;
   const limit = parseInt(req.query.limit) || 10;
   const result = await getVendorOrders(vendorId, page, limit);
   res.status(200).json({ status: "success", message: "orders fetched successfully", data: result })
});

//update order
exports.updateOrder = catchAsync(async (req, res, next) => {
   console.log("edit")
   const orderEditPayload = req.body?.order_edit;
   const response = await handleOrderEdit(orderEditPayload);
   await OrderTimeline.create({
      order_id: orderEditPayload?.order_id,
      action: 'updated',
      message: 'Order updated'
   });
   res.status(200).json({ status: "success", message: "Order updated successfully" });
});

//Cancell order
exports.cancelOrder = catchAsync(async (req, res, next) => {
   const orderCancelPayload = req.body;
   const order = await Order.findOne({ order_id: orderCancelPayload.id });
   order.cancelled_at = orderCancelPayload?.cancelled_at;
   order.cancel_reason = orderCancelPayload?.cancel_reason;
   order.financial_status = orderCancelPayload?.financial_status;
   const now = new Date();
   order.line_items = order.line_items.map(item => ({
      ...item,
      deleted_date: now
   }));
   const data = await order.save();
   await OrderTimeline.create({
      order_id: orderCancelPayload.id,
      action: 'cancelled',
      changes: {
         cancelled_at: orderCancelPayload?.cancelled_at,
         cancel_reason: orderCancelPayload?.cancel_reason,
         financial_status: orderCancelPayload?.financial_status,
         deleted_items: order.line_items
      },
      message: 'Order cancelled'
   });
   res.status(200).json({ status: "success", message: "Order Cancelled successfully", data: data });
})

exports.getOrderById = catchAsync(async (req, res, next) => {
   const orderId = req.params.id;
  
   // Fetch the order by ID
   const order = await Order.findById(orderId).lean();
   if (!order) {
      return next(new NotFoundError("Order not found"));
   }

   // Fetch removed line items
   const removedItems = await RemovedLineItem.find({ order_id: order.order_id }).lean();

   // Fetch timeline for this order
   const timeline = await OrderTimeline.find({ order_id: order.order_id }).sort({ createdAt: -1 }).lean();

   // Fetch user and check if vendor
   const user = await User.findById(req.user?.id).populate('role');
 

   // Filter line items if user is a vendor
   if (user?.role?.role_name?.toLowerCase() === "vendor") {

      order.line_items = order.line_items?.filter(item => item.vendor_id?.toString() === req.user.id);
    
   }

   return res.status(200).json({
      status: "success",
      message: "Order details fetched successfully",
      data: {
         ...order,
         removed_line_items: removedItems,
         timeline,
      }
   });
});
 
exports.fulfilOrder = catchAsync(async (req, res, next) => {
   const lineItems = req.body?.line_items?.filter(item=> !item?.fulfillment_status)?.map(item => ({
      id: `gid://shopify/FulfillmentOrderLineItem/${item?.fulfillment_item_id}`,
      quantity: item?.quantity
   }));

   // Convert JS object to GraphQL input format
   const lineItemsString = JSON.stringify(lineItems).replace(/"([^"]+)":/g, '$1:');

   const mutation = `
     mutation FulfillSingleLineItem {
       fulfillmentCreateV2(fulfillment: {
         notifyCustomer: false,
         trackingInfo: {
           company: "My Shipping Company",
           number: "TRACKING_NUMBER",
           url: "https://tracking-url.com"
         },
         lineItemsByFulfillmentOrder: [
           {
             fulfillmentOrderId: "gid://shopify/FulfillmentOrder/${req.body?.fulfillment_id}",
             fulfillmentOrderLineItems: ${lineItemsString}
           }
         ]
       }) {
         fulfillment {
           id
           status
           trackingInfo {
             company
             number
             url
           }
         }
         userErrors {
           field
           message
         }
       }
     }
   `;

   try {
      const response = await axios.post(
         process.env.SHOPIFY_ADMIN_API,
         { query: mutation },
         {
            headers: {
               'Content-Type': 'application/json',
               'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN
            }
         }
      );
      if(response?.data.data?.fulfillmentCreateV2?.userErrors?.length >0  || response?.data?.errors){
         return res.status(500).json({status:"failed",message:'The requested quantity is not available'})
      }

      const order = await Order.findOne({ order_id: req.body.order_id });
      order.fulfillment_status = "Fulfilled"
      order.line_items = order.line_items?.map(item => ({ ...item, fulfillment_status: "Fulfilled" }));
      const data = await order.save();
      await OrderTimeline.create({
         order_id: order.order_id,
         action: 'Fulfilled',
         message: 'Order Fulfilled'
      });
      res.status(201).json({
         status: "success",
         message: "Fulfillment successful",
         data: data
      });
   } catch (error) {
      console.error(error?.response?.data || error);
      res.status(500).json({
         status: "error",
         message: "Fulfillment failed",
         error: error?.response?.data || error.message
      });
   }
});

exports.fulfillSingleItem = catchAsync(async (req, res, next) => {
   const { fulfillment_id, fulfillment_item_id, quantity, order_id, title } = req.body;
   
   if (!fulfillment_id || !fulfillment_item_id || !quantity) {
     return res.status(400).json({
       status: 'fail',
       message: 'Missing required parameters (fulfillment_id, fulfillment_item_id, quantity)'
     });
   }
 
   const mutation = `
     mutation FulfillSingleItem {
       fulfillmentCreateV2(fulfillment: {
         notifyCustomer: false,
         trackingInfo: {
           company: "My Shipping Company",
           number: "TRACKING_NUMBER",
           url: "https://tracking-url.com"
         },
         lineItemsByFulfillmentOrder: [
           {
             fulfillmentOrderId: "gid://shopify/FulfillmentOrder/${fulfillment_id}",
             fulfillmentOrderLineItems: [
               {
                 id: "gid://shopify/FulfillmentOrderLineItem/${fulfillment_item_id}",
                 quantity: ${quantity}
               }
             ]
           }
         ]
       }) {
         fulfillment {
           id
           status
           trackingInfo {
             company
             number
             url
           }
         }
         userErrors {
           field
           message
         }
       }
     }
   `;
 
   try {
     const response = await axios.post(
       process.env.SHOPIFY_ADMIN_API,
       { query: mutation },
       {
         headers: {
           'Content-Type': 'application/json',
           'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN
         }
       }
     );
 
     const { userErrors } = response?.data?.data?.fulfillmentCreateV2 || {};
 
     if (userErrors?.length > 0 || response?.data?.errors) {
       return res.status(500).json({
         status: 'failed',
         message: userErrors?.[0]?.message || 'Fulfillment error occurred',
         errors: userErrors
       });
     }
 
     // Optional: Update internal order DB
     const order = await Order.findOne({ order_id });
 
     if (order) {
       order.line_items = order.line_items?.map(item => {
         if (item.fulfillment_item_id?.toString() === fulfillment_item_id?.toString()) {
           return { ...item, fulfillment_status: 'Fulfilled' };
         }
         return item;
       });
 
       // Optional: Check if all items are now fulfilled
       const allFulfilled = order.line_items.every(item => item.fulfillment_status === 'Fulfilled');
       if (allFulfilled) {
         order.fulfillment_status = 'Fulfilled';
       }
 
       const result = await order.save();
 
       await OrderTimeline.create({
         order_id: order.order_id,
         action: 'Fulfilled',
         message: `Line item ${title} fulfilled`
       });

       return res.status(201).json({
         status: 'success',
         message: 'Line item fulfilled successfully',
         data: result 
       });
     }
 
   } catch (error) {
     console.error('Fulfill single item error:', error?.response?.data || error);
     return res.status(500).json({
       status: 'error',
       message: 'Failed to fulfill line item',
       error: error?.response?.data || error.message
     });
   }
 });

exports.deleteOrder = catchAsync(async(req,res,next)=>{
   const id = req.body.id
   const order = await Order.findOne({order_id:id});
   if(!order)throw new NotFoundError("order not found");
   order.deleted_at = new Date(); 
   await order.save();

   res.status(200).json({
      status: "success",
      message: "Order deleted successfully",
      data: {
         order_id: id,
         deleted_at: order.deleted_at
      }
   });
})
 

