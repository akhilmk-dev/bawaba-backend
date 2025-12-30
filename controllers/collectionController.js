// controllers/shopifyController.js
import axios from "axios";

export const getShopifyCategories = async (req, res) => {
  try {
    const url = `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/custom_collections.json`;
    const response = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
        "Content-Type": "application/json"
      }
    });

    return res.status(200).json({
      status: "success",
      data: response.data.custom_collections || []
    });

  } catch (error) {
    console.error("Error fetching categories:", error.response?.data || error.message);

    return res.status(error.response?.status || 500).json({
      error: "Failed to fetch Shopify categories",
      details: error.response?.data || error.message
    });
  }
};
