import axios from "axios";

export const getAllLocations = async (req, res) => {
  try {
    const response = await axios.get(`${process.env.SHOPIFY_BASE_URL}/admin/api/2025-10/locations.json`, {
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
        "Content-Type": "application/json"
      }
    });

    return res.status(200).json({
      message: "Locations fetched successfully",
      data: response.data.locations
    });

  } catch (error) {
    console.error("Error fetching locations:", error?.response?.data || error);
    return res.status(500).json({
      message: "Failed to fetch locations"
    });
  }
};
