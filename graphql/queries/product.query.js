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

export const PRODUCT_MARKETS_QUERY = `
  query ProductMarkets($id: ID!) {
    product(id: $id) {
      id
      title
      resourcePublicationsV2(catalogType: MARKET, first: 50) {
        nodes {
          publication {
            id
            catalog {
              __typename
              ... on MarketCatalog {
                markets(first: 50) {
                  nodes {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const PUBLISH_TO_CATALOG = `
mutation PublishToCatalog($id: ID!, $publicationId: ID!) {
  publishablePublish(id: $id, publicationId: $publicationId) {
    userErrors {
      field
      message
    }
  }
}
`;
