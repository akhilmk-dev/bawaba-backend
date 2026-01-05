export const transformShopifyProduct = (response) =>{
    const product = response.product;
  
    // 1. Market IDs (from publications)
    const marketIds = product.resourcePublicationsV2.edges.flatMap(edge =>
      edge.node.publication.catalog?.markets?.edges.map(m => m.node.id) || []
    );
  
    // 2. Extract variants
    const variants = product.variants.edges.map(edge => {
      const [color, size, material] = edge.node.title.split(" / ");
  
      return {
        option1: color,
        option2: size,
        option3: material,
        price: edge.node.price,
        sku: edge.node.sku,
        inventoryLevels: edge.node.inventoryItem.inventoryLevels.edges
      };
    });
  
    // 3. Build options dynamically
    const optionMap = {
      Color: new Set(),
      Size: new Set(),
      Material: new Set()
    };
  
    variants.forEach(v => {
      optionMap.Color.add(v.option1);
      optionMap.Size.add(v.option2);
      optionMap.Material.add(v.option3);
    });
  
    const options = Object.entries(optionMap).map(([name, values]) => ({
      name,
      values: Array.from(values)
    }));
  
    // 4. Inventory by variant (only available > 0)
    const inventoryByVariant = {};
  
    variants.forEach(variant => {
      const inventory = variant.inventoryLevels
        .flatMap(level => {
          const available = level.node.quantities.find(
            q => q.name === "available" && q.quantity > 0
          );
  
          if (!available) return [];
  
          return {
            locationId: level.node.location.id,
            quantity: available.quantity
          };
        });
  
      if (inventory.length > 0) {
        inventoryByVariant[variant.sku] = inventory;
      }
    });
  
    // 5. Final output
    return {
      marketIds,
      collectionIds: [],
      product: {
        title: product.title,
        body_html: product.bodyHtml,
        vendor: product.vendor,
        product_type: product.productType,
        tags: product.tags,
        metafields: [
          {
            namespace: "custom",
            key: "vendor_name",
            type: "single_line_text_field",
            value: product.vendor
          }
        ],
        options,
        variants: variants.map(v => ({
          option1: v.option1,
          option2: v.option2,
          option3: v.option3,
          price: v.price,
          sku: v.sku
        }))
      },
      inventoryByVariant
    };
  }
  