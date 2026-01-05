import axios from "axios";
import Product from "../models/Product.js";
import catchAsync from "../utils/catchAsync.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { transformShopifyProduct } from "../helper/productHelper.js";

// export const createProduct = async (req, res) => {
//   try {
//     const { product, collectionIds } = req.body;

//     // Remove metafields (Shopify won't accept inside product payload)
//     const cleanProduct = { ...product };
//     delete cleanProduct.metafields;

//     // Enable inventory tracking on variants
//     if (!cleanProduct.variants || !cleanProduct.variants.some(v => v.option1 || v.option2 || v.option3)) {
//       cleanProduct.variants = [
//         {
//           price: product.price || "0.00",
//           sku: "DEFAULT",
//           inventory_quantity: 0,
//           inventory_management: "shopify",
//         }
//       ];
//     } else {
//       cleanProduct.variants = cleanProduct.variants.map(v => ({
//         ...v,
//         inventory_management: "shopify"
//       }));
//     }

//     // --- Create product in Shopify ---
//     const productResponse = await axios.post(
//       `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/products.json`,
//       { product: cleanProduct },
//       {
//         headers: {
//           "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     const shopifyProduct = productResponse.data.product;
//     console.log(shopifyProduct, "show.....")
//     const productId = shopifyProduct.id;
//     const variants = shopifyProduct.variants;

//     // --- Assign product to multiple collections ---
//     if (Array.isArray(collectionIds) && collectionIds.length > 0) {
//       for (const cid of collectionIds) {
//         await axios.post(
//           `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/collects.json`,
//           {
//             collect: {
//               product_id: productId,
//               collection_id: Number(cid),
//             },
//           },
//           {
//             headers: {
//               "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
//               "Content-Type": "application/json",
//             },
//           }
//         );
//       }
//     }

//     // --- Calculate total stock across all variants ---
//     const totalStock = variants.reduce(
//       (sum, v) => sum + (v.inventory_quantity || 0),
//       0
//     );

//     // --- Save product to MongoDB ---
//     const newProduct = new Product({
//       shopifyId: productId,
//       title: shopifyProduct.title,
//       price: variants[0]?.price || 0,
//       vendor_name: shopifyProduct.vendor,
//       collectionIds: collectionIds || [],
//       stock: totalStock,
//     });

//     await newProduct.save();

//     res.status(201).json({
//       message: "Product created successfully",
//       product: newProduct,
//     });

//   } catch (err) {
//     console.error(err.response?.data || err.message);

//     res.status(err.response?.status || 500).json({
//       error: "Failed to create product",
//       details: err.response?.data || err.message,
//     });
//   }
// };

// export const getProducts = catchAsync(async (req, res, next) => {
//   const page = parseInt(req.query.page) || 0;
//   const limit = parseInt(req.query.limit) || 10;
//   const skip = page * limit;

//   const { search, vendor_name , sortBy } = req.query;

//   // Default sort (latest products first)
//   let sort = { createdAt: -1 };

//   // Sorting by user input (e.g., price, title, etc.)
//   if (sortBy) {
//      sort = {};
//      const sortParams = sortBy.split(',');
//      sortParams.forEach(param => {
//         const [field, order] = param.split(':');
//         sort[field] = order === 'asc' ? 1 : -1;
//      });
//   }

//   // Filter criteria
//   let filter = {
//      deleted_at: { $in: [null, undefined] }
//   };

//   // Search filter (matches product title, description, or SKU)
//   if (search) {
//      const regex = new RegExp(search, 'i');
//      filter.$or = [
//         { title: regex },
//         { body_html: regex },
//         { sku: regex }
//      ];
//   }

//   // Filter by vendor_name (if provided)
//   if (vendor_name) {
//      filter.vendor_name = vendor_name;
//   }

//   // Fetch matching products from the database
//   const products = await Product.find(filter)
//      .sort(sort)
//      .skip(skip)
//      .limit(limit)
//      .lean(); 

//   // Get total count of matching products
//   const total = await Product.countDocuments(filter);

//   // Send paginated response with product data
//   res.status(200).json({
//      status: 'success',
//      page,
//      limit,
//      total,
//      totalPages: Math.ceil(total / limit),
//      data: products,
//   });
// });

export const createProductAndPublishToMarkets = async (req, res) => {
  try {
    const {
      product,
      collectionIds = [],
      marketIds = [], // array of target market IDs
      inventoryByVariant = {}
    } = req.body;

    if (!marketIds.length) {
      return res.status(400).json({ error: "Provide at least one marketId" });
    }

    /* --------------------------------------------------
     * 1. Separate metafields
     * -------------------------------------------------- */
    const metafields = product.metafields || [];
    const cleanProduct = { ...product };
    delete cleanProduct.metafields;

    /* --------------------------------------------------
     * 2. Enable inventory tracking
     * -------------------------------------------------- */
    cleanProduct.variants = cleanProduct.variants.map(v => ({
      ...v,
      inventory_management: "shopify",
      inventory_policy: "deny"
    }));

    /* --------------------------------------------------
     * 3. Create product (REST)
     * -------------------------------------------------- */
    const productRes = await axios.post(
      `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-10/products.json`,
      { product: cleanProduct },
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    const shopifyProduct = productRes.data.product;
    const productId = shopifyProduct.id;
    const productGid = `gid://shopify/Product/${productId}`;

    /* --------------------------------------------------
     * 4. Attach collections
     * -------------------------------------------------- */
    for (const cid of collectionIds) {
      await axios.post(
        `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/collects.json`,
        {
          collect: {
            product_id: productId,
            collection_id: Number(cid)
          }
        },
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
            "Content-Type": "application/json"
          }
        }
      );
    }

    /* --------------------------------------------------
     * 5. Create metafields
     * -------------------------------------------------- */
    for (const mf of metafields) {
      await axios.post(
        `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/metafields.json`,
        {
          metafield: {
            ...mf,
            owner_resource: "product",
            owner_id: productId
          }
        },
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
            "Content-Type": "application/json"
          }
        }
      );
    }

    /* --------------------------------------------------
     * 6. Set inventory PER LOCATION (REST)
     * -------------------------------------------------- */
    for (const variant of shopifyProduct.variants) {
      const sku = variant.sku;
      if (!inventoryByVariant[sku]) continue;

      for (const loc of inventoryByVariant[sku]) {
        await axios.post(
          `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/inventory_levels/set.json`,
          {
            location_id: Number(loc.locationId.replace("gid://shopify/Location/", "")),
            inventory_item_id: Number(variant.inventory_item_id),
            available: loc.quantity
          },
          {
            headers: {
              "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
              "Content-Type": "application/json"
            }
          }
        );
      }
    }

    /* --------------------------------------------------
     * 7. Publish product to specified markets
     * -------------------------------------------------- */
    for (const marketId of marketIds) {
      // 7.1 Get the catalog publication for this market
      const catalogsRes = await axios.post(
        `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/graphql.json`,
        {
          query: `
            query MarketCatalogPublications($marketId: ID!, $firstCatalogs: Int = 10) {
              market(id: $marketId) {
                id
                name
                catalogs(first: $firstCatalogs) {
                  nodes {
                    id
                    publication {
                      id
                    }
                  }
                }
              }
            }
          `,
          variables: { marketId }
        },
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
            "Content-Type": "application/json"
          }
        }
      );

      const market = catalogsRes.data.data.market;
      if (!market) continue;

      for (const catalog of market.catalogs.nodes) {
        const publicationId = catalog.publication.id;

        // 7.2 Publish product to this catalog's publication
        await axios.post(
          `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/graphql.json`,
          {
            query: `
              mutation PublishProductToMarket($publicationId: ID!, $productId: ID!) {
                publicationUpdate(
                  id: $publicationId,
                  input: { publishablesToAdd: [$productId] }
                ) {
                  publication { id }
                  userErrors { field message }
                }
              }
            `,
            variables: { publicationId, productId: productGid }
          },
          {
            headers: {
              "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
              "Content-Type": "application/json"
            }
          }
        );
      }
    }

    /* --------------------------------------------------
     * 8. Save locally
     * -------------------------------------------------- */
    await new Product({
      shopifyId: productId,
      title: shopifyProduct.title,
      vendor_name: shopifyProduct.vendor,
      price: shopifyProduct.variants[0]?.price || 0,
      collectionIds,
      marketIds
    }).save();

    res.status(201).json({
      message: "Product created and published to selected market(s)",
      shopifyProductId: productId
    });

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      error: "Product creation failed",
      details: error.response?.data || error.message
    });
  }
};

export const getProducts = catchAsync(async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const pageInfo = req.query.page_info || null;
    const user = await User.findById(req.user?.id)?.populate('role');
    let { search, vendor_name } = req.query;
    if (user?.role?.role_name?.toLowerCase() == "vendor") {
      vendor_name = user.name
    }
    // Build GraphQL query string
    let queryString = "";
    if (search) queryString += `title:*${search}*`;
    if (vendor_name) queryString += queryString ? ` AND vendor:"${vendor_name}"` : `vendor:"${vendor_name}"`;

    const graphQLQuery = {
      query: `
     query GetProducts($first: Int!, $after: String, $query: String) {
  products(first: $first, after: $after, query: $query) {
    edges {
      node {
        id
        legacyResourceId
        title
        handle
        vendor
        productType
        tags
        status
        descriptionHtml
        createdAt
        updatedAt
        options {
          id
          name
          values
        }
        images(first: 20) {
          edges {
            node {
              id
              src
              altText
              width
              height
            }
          }
        }
        variants(first: 50) {
          edges {
            node {
              id
              title
              sku
              price
              compareAtPrice
              inventoryQuantity
              availableForSale
              selectedOptions {
                name
                value
              }
              barcode
              image {
                id
                src
                altText
              }
              unitPrice {
                amount
                currencyCode
              }
              unitPriceMeasurement {
                measuredType
                quantityUnit
              }
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
    `,
      variables: {
        first: limit,
        after: pageInfo,
        query: queryString || null,
      },
    };

    const response = await axios.post(
      `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/graphql.json`,
      graphQLQuery,
      {
        headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN },
      }
    );

    const productsData = response.data.data.products;
    const edges = productsData.edges || [];

    const products = edges.map(e => {
      const product = e.node;

      // Format the product response
      const formattedProduct = {
        id: product.id,
        legacyResourceId: product.legacyResourceId,
        title: product.title,
        handle: product.handle,
        vendor: product.vendor,
        productType: product.productType,
        tags: product.tags,
        status: product.status,
        descriptionHtml: product.descriptionHtml,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        options: product.options.map(option => ({
          name: option.name,
          values: option.values,
        })),
        images: product.images.edges.map(image => ({
          src: image.node.src,
          altText: image.node.altText,
          width: image.node.width,
          height: image.node.height,
        })),
        variants: product.variants.edges.map(variant => ({
          id: variant.node.id,
          title: variant.node.title,
          sku: variant.node.sku,
          price: variant.node.price,
          compareAtPrice: variant.node.compareAtPrice,
          inventoryQuantity: variant.node.inventoryQuantity,
          availableForSale: variant.node.availableForSale,
          selectedOptions: variant.node.selectedOptions,
          barcode: variant.node.barcode,
          image: variant.node.image ? {
            src: variant.node.image.src,
            altText: variant.node.image.altText
          } : null,
          unitPrice: variant.node.unitPrice ? {
            amount: variant.node.unitPrice.amount,
            currencyCode: variant.node.unitPrice.currencyCode
          } : null,
          unitPriceMeasurement: variant.node.unitPriceMeasurement
            ? {
              measuredType: variant.node.unitPriceMeasurement.measuredType,
              quantityUnit: variant.node.unitPriceMeasurement.quantityUnit
            }
            : null
        }))
      };

      return formattedProduct;
    });

    const totalCountResponse = await axios.get(
      `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/products/count.json`,
      {
        headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN },
      }
    );

    const totalProductCount = totalCountResponse.data.count;

    const nextPageInfo = productsData.pageInfo.hasNextPage ? productsData.pageInfo.endCursor : null;

    res.status(200).json({
      status: "success",
      limit,
      total: products.length,
      totalPages: totalProductCount,
      nextPageInfo,
      data: products,
    });
  } catch (error) {
    next()
  }
});

export const deleteProduct = async (req, res) => {
  const { productId } = req.params;

  if (!productId) {
    return res.status(500).json({ message: "Product ID is required" });
  }

  try {
    // 1 Delete product from Shopify
    const apiUrl = `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/products/${productId}.json`;
    await axios.delete(apiUrl, {
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
        "Content-Type": "application/json",
      },
    });

    //  Delete product from MongoDB
    const deletedProduct = await Product.findOneAndDelete({ shopifyId: productId });

    res.status(200).json({
      message: "Product deleted successfully",
      product: deletedProduct || null,
    });
  } catch (err) {
    console.error("Error deleting product:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      message: "Failed to delete product",
      details: err.response?.data || err.message,
    });
  }
};

export const getProductById = async (req, res) => {
  const { productId } = req.params
  if (!productId) {
    return res.status(500).json({ message: "productId is required" })
  }
  try {
    const apiUrl = `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/products/${productId}.json`;
    const response = await axios.get(apiUrl, {
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
        "Content-Type": "application/json",
      },
    });
    const data = await Product.findOne({ shopifyId: productId })
    return res.status(200).json({ message: "Product details fetched successfully", data: { data: response.data.product, collectionIds: data?.collectionIds || [] } })
  } catch (error) {
    console.log(error)
  }
}

// Assuming you're using async/await

// export const getProductById = async (req, res) => {
//   const { productId } = req.params;

//   // Ensure productId is provided
//   if (!productId) {
//     return res.status(400).json({ message: "productId is required" });
//   }

//   // Shopify GraphQL endpoint
//   const apiUrl = `https://itflowdev.myshopify.com/admin/api/2025-10/graphql.json`;

//   // GraphQL query for product details
//   const query = `
//     query ProductWithInventoryPerLocation($id: ID!, $inventoryLevelsFirst: Int = 10) {
//       product(id: $id) {
//         id
//         title
//         totalInventory
//         status
//         vendor
//         productType
//         bodyHtml
//         tags
//         resourcePublicationsV2(first: 10, catalogType: MARKET) {
//           edges {
//             node {
//               publication {
//                 id
//                 name
//                 catalog {
//                   __typename
//                   ... on MarketCatalog {
//                     markets(first: 10) {
//                       edges {
//                         node {
//                           id
//                           name
//                         }
//                       }
//                     }
//                   }
//                 }
//               }
//             }
//           }
//         }
//         variants(first: 50) {
//           edges {
//             node {
//               id
//               title
//               sku
//               price
//               inventoryItem {
//                 id
//                 inventoryLevels(first: $inventoryLevelsFirst) {
//                   edges {
//                     node {
//                       id
//                       location {
//                         id
//                         name
//                       }
//                       quantities(names: ["available", "on_hand"]) {
//                         name
//                         quantity
//                       }
//                     }
//                   }
//                 }
//               }
//             }
//           }
//         }
//       }
//       markets(first: 20) {
//         edges {
//           node {
//             id
//             name
//           }
//         }
//       }
//     }
//   `;

//   // Prepare variables for the GraphQL request
//   const variables = {
//     id: `gid://shopify/Product/${productId}`,
//     inventoryLevelsFirst: 50
//   };

//   try {
//     // Perform the GraphQL request to Shopify
//     const response = await axios.post(
//       apiUrl,
//       {
//         query,
//         variables
//       },
//       {
//         headers: {
//           "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
//           "Content-Type": "application/json"
//         }
//       }
//     );
//     // Transform the GraphQL response into the desired format
//     const transformedData = transformShopifyProduct(response.data.data);

//     return res.status(200).json({
//       message: "Product details fetched successfully",
//       data: {
//         data: transformedData.product, // the product data transformed into the desired format
//         collectionIds: data?.collectionIds || [] // Any additional collection info from DB
//       }
//     });
//   } catch (error) {
//     console.error("Error fetching product details:", error);
//     return res.status(500).json({ message: "Error fetching product details" });
//   }
// };


export const updateProduct = async (req, res) => {
  const { productId } = req.params;
  const { product, collectionIds, imagesToKeep } = req.body;

  if (!productId) {
    return res.status(400).json({ message: "productId is required" });
  }

  try {
    // ---------------- CLEAN PRODUCT DATA ----------------
    const cleanProduct = { ...product };

    // Remove metafields (Shopify doesn't allow update here)
    delete cleanProduct.metafields;

    // Shopify deletes all images if empty array is sent — prevent that
    if (!cleanProduct.images || cleanProduct.images.length === 0) {
      delete cleanProduct.images;
    }

    // Enable Shopify inventory management
    if (cleanProduct.variants && cleanProduct.variants.length > 0) {
      cleanProduct.variants = cleanProduct.variants.map((v) => ({
        ...v,
        inventory_management: "shopify",
      }));
    }

    // ---------------- UPDATE PRODUCT (BASIC FIELDS) ----------------
    const apiUrl = `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/products/${productId}.json`;

    const shopifyRes = await axios.put(
      apiUrl,
      { product: cleanProduct },
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const updatedShopifyProduct = shopifyRes.data.product;

    // ----------------------- IMAGE LOGIC ------------------------
    // Get existing images
    const existingRes = await axios.get(
      `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/products/${productId}/images.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
        },
      }
    );

    // ---------------- UPDATE INVENTORY LEVELS ----------------
    const locationId = Number(process.env.SHOPIFY_LOCATION_ID);
    let totalStock = 0;

    for (const variant of updatedShopifyProduct.variants) {
      const match = cleanProduct.variants?.find(
        (v) => v.sku === variant.sku || v.id === variant.id
      );

      const qtyToSet = match?.inventory_quantity ?? 0;

      await axios.post(
        `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/inventory_levels/set.json`,
        {
          location_id: locationId,
          inventory_item_id: variant.inventory_item_id,
          available: qtyToSet,
        },
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );

      totalStock += qtyToSet;
    }

    // ---------------- UPDATE COLLECTION IDS ----------------
    const existingCollectsRes = await axios.get(
      `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/collects.json?product_id=${productId}`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
        },
      }
    );

    const existingCollects = existingCollectsRes.data.collects;

    // Remove any old collections not in new list
    for (const collect of existingCollects) {
      if (!collectionIds?.includes(Number(collect.collection_id))) {
        await axios.delete(
          `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/collects/${collect.id}.json`,
          {
            headers: {
              "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
            },
          }
        );
      }
    }

    // Add new collection mappings
    for (const cid of collectionIds || []) {
      const exists = existingCollects.some(
        (c) => Number(c.collection_id) === Number(cid)
      );

      if (!exists) {
        await axios.post(
          `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/collects.json`,
          {
            collect: {
              product_id: Number(productId),
              collection_id: Number(cid),
            },
          },
          {
            headers: {
              "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
              "Content-Type": "application/json",
            },
          }
        );
      }
    }

    // ---------------- UPDATE MONGODB ----------------
    const updatedProduct = await Product.findOneAndUpdate(
      { shopifyId: productId },
      {
        title: updatedShopifyProduct.title,
        price: updatedShopifyProduct.variants?.[0]?.price || null,
        vendor_name: updatedShopifyProduct.vendor,
        collectionIds: collectionIds || [],
        stock: totalStock,
      },
      { new: true }
    );

    res.status(200).json({
      message: "Product updated successfully",
      data: {
        shopify: updatedShopifyProduct,
        mongo: updatedProduct,
      },
    });

  } catch (err) {
    console.error("UPDATE ERROR:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: "Failed to update product",
      details: err.response?.data || err.message,
    });
  }
};

export const shopifyProductDeleteWebhook = async (req, res) => {
  try {
    const data = req.body;
    const shopifyProductId = data.id;

    if (!shopifyProductId) {
      return res.status(400).json({ message: "Shopify product ID missing" });
    }

    // Delete from MongoDB
    const deleted = await Product.findOneAndDelete({ shopifyId: shopifyProductId });

    // console.log(" Shopify Deleted Product:", shopifyProductId);
    // console.log("Mongo Deleted:", deleted);

    // Important: Respond with 200 so Shopify knows webhook succeeded
    return res.status(200).json({ success: true, message: "Product deleted locally" });

  } catch (error) {
    console.error("SHOPIFY DELETE WEBHOOK ERROR:", error);
    return res.status(500).json({ message: "Error processing webhook" });
  }
};

export const updateVariantQuantity = catchAsync(async (req, res, next) => {
  const { productId, variantId } = req.params;
  const { quantity } = req.body;

  if (!variantId || !productId || quantity === undefined) {
    return res.status(400).json({ message: "productId, variantId and quantity are required" });
  }

  try {
    // 1. Get variant to fetch inventory_item_id
    const variantURL = `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/variants/${variantId}.json`;

    const variantRes = await axios.get(variantURL, {
      headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN },
    });

    const inventoryItemId = variantRes.data?.variant?.inventory_item_id;

    // 2. Get location id
    const locURL = `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/locations.json`;
    const locRes = await axios.get(locURL, {
      headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN },
    });

    const locationId = locRes.data.locations[0].id;

    // 3. Update inventory level
    const invURL = `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/inventory_levels/set.json`;

    const updateRes = await axios.post(
      invURL,
      {
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available: Number(quantity),
      },
      {
        headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN },
      }
    );

    res.status(200).json({
      message: "Variant quantity updated successfully",
      data: updateRes.data,
    });
  } catch (error) {
    console.error("Variant quantity update error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      message: "Failed to update variant quantity",
      details: error.response?.data || error.message,
    });
  }
});

export const updateVariantPrice = catchAsync(async (req, res, next) => {
  const { productId, variantId } = req.params;
  const { price } = req.body;

  if (!variantId || !productId || price === undefined) {
    return res.status(400).json({ message: "productId, variantId and price are required" });
  }

  try {
    const url = `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/variants/${variantId}.json`;

    const response = await axios.put(
      url,
      { variant: { id: variantId, price: Number(price) } },
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json({
      message: "Variant price updated successfully",
      data: response.data,
    });
  } catch (error) {
    console.error("Variant price update error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      message: "Failed to update variant price",
      details: error.response?.data || error.message,
    });
  }
});

export const updateProductPrice = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { price } = req.body;

  if (!productId || price === undefined) {
    return res.status(400).json({ message: "productId and price are required" });
  }

  try {
    // Simple product means only 1 variant
    const url = `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/products/${productId}.json`;

    const response = await axios.put(
      url,
      {
        product: {
          id: productId,
          variants: [{ price: Number(price) }],
        },
      },
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json({
      message: "Product price updated successfully",
      data: response.data,
    });
  } catch (error) {
    console.error("Product price update error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      message: "Failed to update product price",
      details: error.response?.data || error.message,
    });
  }
});

export const updateProductQuantity = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { quantity } = req.body;

  if (!productId || quantity === undefined) {
    return res.status(400).json({ message: "productId and quantity are required" });
  }

  try {
    // step 1: get product → get first variant id
    const productURL = `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/products/${productId}.json`;

    const productRes = await axios.get(productURL, {
      headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN },
    });

    const variant = productRes.data.product.variants[0];
    const variantId = variant.id;
    const inventoryItemId = variant.inventory_item_id;

    // step 2: get location id
    const locURL = `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/locations.json`;
    const locRes = await axios.get(locURL, {
      headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN },
    });

    const locationId = locRes.data.locations[0].id;

    // step 3: update inventory
    const invURL = `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/inventory_levels/set.json`;

    const updateRes = await axios.post(
      invURL,
      {
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available: Number(quantity),
      },
      {
        headers: { "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN },
      }
    );

    res.status(200).json({
      message: "Product quantity updated successfully",
      data: updateRes.data,
    });
  } catch (error) {
    console.error("Product qty update error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      message: "Failed to update product quantity",
      details: error.response?.data || error.message,
    });
  }
});

async function getShopifyProductsCount(vendor) {
  try {
    const res = await axios.get(
      `${process.env.SHOPIFY_BASE_URL}/admin/api/2024-01/products/count.json${vendor ? `?vendor=${vendor}` : ''}`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
        },
      }
    );

    return res.data?.count || 0;
  } catch (error) {
    console.error("Shopify Products Error:", error.message);
    return 0;
  }
}

async function getShopifyCustomersCount() {
  try {
    const res = await axios.get(
      `${process.env.SHOPIFY_BASE_URL}/admin/api/2024-01/customers/count.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
        },
      }
    );

    return res.data?.count || 0;
  } catch (error) {
    console.error("Shopify Products Error:", error.message);
    return 0;
  }
}

// GET 5 Recent Shopify Products
async function getRecentShopifyProducts(vendor) {
  try {
    const res = await axios.get(
      `${process.env.SHOPIFY_BASE_URL}/admin/api/2024-01/products.json?limit=5&order=created_at desc${vendor ? `&vendor=${vendor}` : ''}`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
        },
      }
    );

    return res.data?.products || [];
  } catch (error) {
    console.error("Recent Products Error:", error.message);
    return [];
  }
}

async function getTotalEarnings(vendorName = null) {
  let filter = {
    deleted_at: { $in: [null, undefined] },
    financial_status: "paid"
  };

  const orders = await Order.find(filter).lean();

  let total = 0;

  orders.forEach(order => {
    order.line_items.forEach(item => {
      if (!vendorName || item.vendor_name === vendorName) {
        total += Number(item.price) * Number(item.quantity);
      }
    });
  });

  return total;
}

async function getRecentOrders(vendorName = null) {
  let filter = { deleted_at: { $in: [null, undefined] } };

  if (vendorName) {
    filter["line_items.vendor_name"] = vendorName;
  }

  return await Order.find(filter)
    .sort({ created_at: -1 })
    .limit(5)
    .lean();
}

async function getTotalOrdersCount(vendorName = null) {
  let filter = {
    deleted_at: { $in: [null, undefined] }
  };

  if (vendorName) {
    filter["line_items.vendor_name"] = vendorName;
  }

  return await Order.countDocuments(filter);
}

export const getDashboardStats = async (req, res) => {
  try {
    const user = await User.findById(req.user?.id)?.populate('role');
    let vendor = null;
    console.log(user?.role?.role_name)
    if (user?.role?.role_name?.toLowerCase() == "vendor") {

      vendor = user.name
    }
    // TOTAL PRODUCTS (SHOPIFY)
    const totalProducts = await getShopifyProductsCount(vendor);
    const totalCustomers = await getShopifyCustomersCount();
    // TOTAL ORDERS (ADMIN / VENDOR)
    const totalOrders = await getTotalOrdersCount(vendor);
    // RECENT 5 ORDERS
    const recentOrders = await getRecentOrders(vendor);
    // TOTAL EARNINGS (PAID ORDERS)
    const totalEarnings = await getTotalEarnings(vendor);
    // RECENT 5 PRODUCTS (SHOPIFY)
    const recentProducts = await getRecentShopifyProducts(vendor);

    // Define all possible statuses
    const ORDER_STATUSES = ["paid", "unpaid", "pending", "refunded"];

    const orderStatusAggregation = await Order.aggregate([
      {
        $match: {
          deleted_at: { $in: [null, undefined] },
          ...(vendor ? { "line_items.vendor_name": vendor } : {})
        }
      },
      {
        $group: {
          _id: "$financial_status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Initialize with 0 for all statuses
    const orderStatusDistribution = {};
    ORDER_STATUSES.forEach(status => {
      orderStatusDistribution[status] = 0;
    });

    // Fill actual counts from aggregation
    orderStatusAggregation.forEach(item => {
      const status = item._id?.toLowerCase();
      if (ORDER_STATUSES.includes(status)) {
        orderStatusDistribution[status] = item.count;
      }
    });


    // // RECENT 5 ORDERS
    // const recentOrders = await Order.find(vendorFilter)
    //   .sort({ createdAt: -1 })
    //   .limit(5);

    return res.status(200).json({
      status: "success",
      data: {
        counts: {
          totalOrders,
          // totalSales,
          totalEarnings,
          totalProducts,
          totalCustomers,
        },
        recentProducts,
        recentOrders,
        orderStatusDistribution
      },
    });
  } catch (error) {
    console.error("Dashboard Error:", error);

    return res.status(500).json({
      status: "error",
      message: "Dashboard API failed",
      details: error.message,
    });
  }
};

export const getMarkets = async (req, res) => {
  try {
    const response = await axios.post(
     `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/graphql.json`,
      {
        query: `
          query {
            markets(first: 50) {
              nodes {
                id
                name
                enabled
              }
            }
          }
        `
      },
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    res.status(200).json({
      success: true,
      markets: response.data.data.markets.nodes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
};


export const getLocationsByMarketId = async (req, res) => {
  const { marketId } = req.params;

  if (!marketId) {
    return res.status(400).json({
      success: false,
      message: "marketId is required"
    });
  }

  try {
    const response = await axios.post(
      `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/graphql.json`,
      {
        query: `
          query MarketLocations($marketId: ID!, $firstLocations: Int = 20) {
            market(id: $marketId) {
              id
              name
              conditions {
                conditionTypes
                locationsCondition {
                  applicationLevel
                  locations(first: $firstLocations) {
                    nodes {
                      id
                      name
                      address {
                        formatted
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: {
          marketId:`gid://shopify/Market/${marketId}`
        }
      },
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    const market = response.data?.data?.market;

    if (!market) {
      return res.status(404).json({
        success: false,
        message: "Market not found"
      });
    }

    const locations =
      market.conditions?.locationsCondition?.locations?.nodes || [];

    res.status(200).json({
      success: true,
      market: {
        id: market.id,
        name: market.name
      },
      locations
    });

  } catch (error) {
    console.error("MARKET LOCATION ERROR:", error.response?.data || error.message);

    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
};


// // STEP 2 — Get shop locations
// const locationsResponse = await axios.get(
//   `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/locations.json`,
//   {
//     headers: {
//       "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
//     },
//   }
// );
// const locationId = locationsResponse.data.locations[0].id;

// // STEP 3 — Set inventory level NOW VALID
// const quantity = Number(product.variants?.[0]?.inventory_quantity || 0);

// await axios.post(
//   `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/inventory_levels/set.json`,
//   {
//     location_id: locationId,
//     inventory_item_id: inventoryItemId,
//     available: quantity,
//   },
//   {
//     headers: {
//       "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
//       "Content-Type": "application/json",
//     },
//   }
// );