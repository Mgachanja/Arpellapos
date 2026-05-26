/**
 * Maps cart items to receipt items structure, ensuring critical ID and cost fields are preserved.
 * This is essential for profit calculations which rely on inventoryId, productId, and cost mappings.
 * 
 * @param {Array} cartItems - The source cart items
 * @returns {Array} - The mapped items for receipt/storage
 */
export const mapCartToReceiptItems = (cartItems) => {
    if (!Array.isArray(cartItems)) return [];

    return cartItems.map(ci => {
        let sellingPrice = 0;
        if (ci.priceType === 'Retail') {
            sellingPrice = Number(ci.price) || 0;
        } else {
            // For 'Wholesale', 'Discounted', or any other non-Retail type, use wholesalePrice.
            sellingPrice = Number(ci.wholesalePrice) || Number(ci.price) || 0;
        }
        
        if (ci.applyDiscount && ci.priceAfterDiscount && Number(ci.priceAfterDiscount) > 0) {
            sellingPrice = Number(ci.priceAfterDiscount);
        }

        const quantity = Number(ci.quantity) || 1;
        const lineTotal = sellingPrice * quantity;

        return {
            // Identity fields - Critical for cost lookup
            id: ci.id || ci._id || ci.productId,
            _id: ci._id || ci.id || ci.productId,
            productId: ci.productId || ci.id || ci._id,
            inventoryId: ci.inventoryId || ci.inventory_id || ci.invId,

            // Cost/Price fields - Critical for profit calculation if lookup fails
            stockPrice: ci.stockPrice || ci.unitCost || ci.cost || ci.purchasePrice,
            unitCost: ci.unitCost || ci.stockPrice || ci.cost || ci.purchasePrice,
            cost: ci.cost || ci.stockPrice || ci.unitCost || ci.purchasePrice,
            purchasePrice: ci.purchasePrice || ci.stockPrice || ci.unitCost || ci.cost,
            priceAfterDiscount: ci.priceAfterDiscount,

            // Display fields
            name: ci.name || ci.productName || 'Item',
            productName: ci.name || ci.productName || 'Item',

            // Transaction fields
            salePrice: sellingPrice,
            sellingPrice,
            price: sellingPrice,
            quantity,
            qty: quantity,
            lineTotal,
            total: lineTotal,

            // Meta
            priceType: ci.priceType,
            barcode: ci.barcode || ''
        };
    });
};
