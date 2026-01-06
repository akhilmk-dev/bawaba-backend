export const PUBLISH_PRODUCT_MUTATION = `
  mutation PublishProductToMarket($publicationId: ID!, $productId: ID!) {
    publicationUpdate(
      id: $publicationId,
      input: { publishablesToAdd: [$productId] }
    ) {
      publication { id }
      userErrors {
        field
        message
      }
    }
  }
`;
