import axios from "axios";

if (!process.env.SHOPIFY_BASE_URL || !process.env.SHOPIFY_TOKEN) {
  throw new Error("Shopify env variables are missing");
}

const shopifyClient = axios.create({
  baseURL: `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-10`,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
    "Content-Type": "application/json"
  },
  timeout: 15000
});

export default shopifyClient;
