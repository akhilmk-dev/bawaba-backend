export const MARKET_CATALOG_QUERY = `
  query MarketCatalogPublications($marketId: ID!) {
    market(id: $marketId) {
      id
      name
      catalogs(first: 10) {
        nodes {
          id
          publication {
            id
          }
        }
      }
    }
  }
`;
export const PRODUCT_BY_ID_QUERY = `
  query ProductWithInventory($id: ID!, $inventoryLevelsFirst: Int!) {
    product(id: $id) {
      id
      title
      vendor
      productType
      bodyHtml
      tags
      variants(first: 50) {
        edges {
          node {
            id
            title
            sku
            price
          }
        }
      }
    }
  }
`;
