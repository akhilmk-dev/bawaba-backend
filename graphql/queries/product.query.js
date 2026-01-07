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

export const GET_ALL_Product =  `
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
`
export const GET_PROVINCES=  `
query GetProvinceSelectorOptions {
metafieldDefinitions(
first: 1
ownerType: PRODUCT
namespace: "availability"
key: "provinces_oman"
) {
edges {
node {
id
name
namespace
key
type {
name
}
validations {
name
value
}
}
}
}
}
`
export const GET_MARKETS =  `
query GetMarketsWithCountries {
markets(first: 10) {
nodes {
id
name
primary
enabled
currencySettings {
baseCurrency {
currencyCode
}
}
conditions {
regionsCondition {
regions(first: 50) {
  nodes {
    ... on MarketRegionCountry {
      id
      name
      code
    }
  }
}
}
}
}
}
}
`