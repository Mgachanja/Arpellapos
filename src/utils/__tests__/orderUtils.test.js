import { mapCartToReceiptItems } from '../orderUtils';

describe('mapCartToReceiptItems', () => {
    it('should return empty array for invalid input', () => {
        expect(mapCartToReceiptItems(null)).toEqual([]);
        expect(mapCartToReceiptItems(undefined)).toEqual([]);
        expect(mapCartToReceiptItems("not array")).toEqual([]);
    });

    it('should preserve critical ID fields', () => {
        const cart = [{
            productId: '123',
            inventoryId: '999',
            name: 'Test Product',
            price: 100,
            quantity: 1
        }];

        const result = mapCartToReceiptItems(cart);

        expect(result[0]).toEqual(expect.objectContaining({
            productId: '123',
            inventoryId: '999',
            // mapped generic ID
            id: '123'
        }));
    });

    it('should preserve integrity of cost fields', () => {
        const cart = [{
            name: 'Cost Item',
            price: 200,
            stockPrice: 150, // Specific cost field
            quantity: 1
        }];

        const result = mapCartToReceiptItems(cart);

        expect(result[0]).toEqual(expect.objectContaining({
            stockPrice: 150,
            unitCost: 150, // Should fallback/alias
            cost: 150      // Should fallback/alias
        }));
    });

    it('should calculate totals correctly for Retail price', () => {
        const cart = [{
            name: 'Retail Item',
            priceType: 'Retail',
            price: 100,
            priceAfterDiscount: 80, // Should be ignored for retail
            quantity: 2
        }];

        const result = mapCartToReceiptItems(cart);

        expect(result[0].sellingPrice).toBe(100);
        expect(result[0].lineTotal).toBe(200);
    });

    it('should use priceAfterDiscount for non-Retail items', () => {
        const cart = [{
            name: 'Discount Item',
            priceType: 'Discounted',
            price: 100,
            priceAfterDiscount: 80,
            quantity: 3
        }];

        const result = mapCartToReceiptItems(cart);

        expect(result[0].sellingPrice).toBe(80);
        expect(result[0].lineTotal).toBe(240);
    });

    it('should handle missing quantity by defaulting to 1', () => {
        const cart = [{
            name: 'Default Qty Item',
            price: 50
        }];

        const result = mapCartToReceiptItems(cart);
        expect(result[0].quantity).toBe(1);
        expect(result[0].lineTotal).toBe(50);
    });

    it('should fallback to price if priceAfterDiscount is missing for discounted item', () => {
        const cart = [{
            name: 'Bad Discount Item',
            priceType: 'Discounted',
            price: 50
            // priceAfterDiscount missing
        }];

        const result = mapCartToReceiptItems(cart);
        expect(result[0].sellingPrice).toBe(50);
    });
});
