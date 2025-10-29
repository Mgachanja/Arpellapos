// src/services/cartService.js
import api from './api';

// Cache for storing inventory quantities
const inventoryCache = new Map();

// Cache TTL in milliseconds (5 minutes default)
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {number} quantity - Available quantity
 * @property {number} timestamp - When the data was cached
 */

/**
 * Export the helper function so other components can use it
 */
export function extractInventoryIdFromProduct(product) {
  if (!product || typeof product !== 'object') return null;
  return (
    product.inventoryId ||
    product.inventory?.id ||
    product.inventory?._id ||
    product.inventory_id ||
    product.inventoryId ||
    product.invId ||
    product.inventoryIdString ||
    null
  );
}

/**
 * Robust helper to read a numeric available quantity from an inventory response payload.
 * Checks multiple common property names.
 */
function extractAvailableQuantity(invData) {
  if (invData == null) return null;
  // if the response is { data: {...} } normalize
  const payload = invData.data ?? invData;

  // try a list of known possible fields
  const candidates = [
    payload.quantity,
    payload.qty,
    payload.availableQty,
    payload.available_quantity,
    payload.stockQuantity,
    payload.count,
    payload.available,
    payload.onHand,
    payload.available_stock,
  ];

  for (const c of candidates) {
    if (typeof c === 'number') return c;
    // sometimes numeric strings are returned
    if (typeof c === 'string' && /^\d+$/.test(c)) return Number(c);
  }

  // If payload itself is a number (rare), return it
  if (typeof payload === 'number') return payload;

  return null;
}

/**
 * Check if cached inventory data is still valid
 * @param {CacheEntry} cacheEntry 
 * @returns {boolean}
 */
function isCacheValid(cacheEntry) {
  if (!cacheEntry) return false;
  const now = Date.now();
  return (now - cacheEntry.timestamp) < CACHE_TTL;
}

/**
 * Get inventory quantity from cache or API
 * @param {string|number} inventoryId 
 * @param {boolean} forceRefresh - Force API call even if cache exists
 * @returns {Promise<number|null>}
 */
async function getInventoryQuantity(inventoryId, forceRefresh = false) {
  const cacheKey = String(inventoryId);
  
  // Check cache first (unless force refresh is requested)
  if (!forceRefresh) {
    const cached = inventoryCache.get(cacheKey);
    if (cached && isCacheValid(cached)) {
      console.log(`Using cached inventory for ${inventoryId}:`, cached.quantity);
      return cached.quantity;
    }
  }

  // Fetch from API - IMPORTANT: URL encode the inventoryId to handle special characters like slashes
  try {
    console.log(`Fetching inventory from API for ${inventoryId}`);
    const encodedInventoryId = encodeURIComponent(inventoryId);
    const response = await api.get(`/inventory/${encodedInventoryId}`);
    const data = response.data || response;
    
    // Extract quantity from response
    const quantity = extractAvailableQuantity(data);
    
    // Cache the result if we got a valid quantity
    if (quantity !== null) {
      inventoryCache.set(cacheKey, {
        quantity,
        timestamp: Date.now()
      });
      console.log(`Cached inventory for ${inventoryId}:`, quantity);
    }
    
    return quantity;
  } catch (error) {
    console.error('Failed to fetch inventory:', error);
    throw error;
  }
}

/**
 * Clear cache for specific inventory ID
 * @param {string|number} inventoryId 
 */
export function clearInventoryCache(inventoryId) {
  if (inventoryId) {
    inventoryCache.delete(String(inventoryId));
  } else {
    // Clear all cache if no specific ID provided
    inventoryCache.clear();
  }
}

/**
 * Get cache status for debugging
 * @returns {Object}
 */
export function getCacheStatus() {
  const entries = {};
  const now = Date.now();
  
  inventoryCache.forEach((value, key) => {
    entries[key] = {
      quantity: value.quantity,
      age: now - value.timestamp,
      isValid: isCacheValid(value)
    };
  });
  
  return {
    size: inventoryCache.size,
    entries
  };
}

/**
 * Validate inventory availability using inventoryId.
 *
 * @param {Object} opts
 * @param {string|number} opts.productId  - product identifier (required)
 * @param {string|number} opts.inventoryId - inventory identifier (required)
 * @param {number} [opts.qty=1]          - requested quantity to add
 * @param {number} [opts.currentCartQty=0] - current quantity in cart for this product
 * @param {boolean} [opts.forceRefresh=false] - force API call even if cache exists
 */
export async function validateAndAddToCart({
  productId,
  inventoryId,
  qty = 1,
  currentCartQty = 0,
  forceRefresh = false
}) {
  if (!productId) {
    throw new Error('validateAndAddToCart: productId is required');
  }

  if (!inventoryId) {
    throw new Error('validateAndAddToCart: inventoryId is required');
  }

  const requestedQty = Number(qty) || 1;
  const totalRequiredQty = currentCartQty + requestedQty;

  try {
    // Get inventory quantity (from cache or API)
    const availableQty = await getInventoryQuantity(inventoryId, forceRefresh);

    if (availableQty != null) {
      if (availableQty < totalRequiredQty) {
        // Insufficient stock
        return { 
          status: 'conflict', 
          availableQty,
          maxCanAdd: Math.max(0, availableQty - currentCartQty),
          message: currentCartQty > 0 
            ? `Only ${availableQty} items available in stock. You already have ${currentCartQty} in cart.`
            : `Only ${availableQty} items available in stock.`,
          fromCache: !forceRefresh && inventoryCache.has(String(inventoryId))
        };
      }
      
      // Stock is sufficient
      return {
        status: 'success',
        availableQty,
        message: 'Stock available',
        fromCache: !forceRefresh && inventoryCache.has(String(inventoryId))
      };
    } else {
      return {
        status: 'warning',
        availableQty: null,
        message: 'Could not determine inventory quantity',
        fromCache: false
      };
    }
  } catch (err) {
    console.error('Inventory check failed:', err);
    return {
      status: 'error',
      message: 'Failed to check inventory availability',
      error: err.message,
      fromCache: false
    };
  }
}

/**
 * Validate quantity change for existing cart item
 * Uses cached inventory data when available
 *
 * @param {Object} opts
 * @param {string|number} opts.productId - product identifier
 * @param {string|number} opts.inventoryId - inventory identifier (required)
 * @param {number} opts.newQty - new total quantity requested
 * @param {number} [opts.currentCartQty=0] - current quantity in cart
 * @param {boolean} [opts.forceRefresh=false] - force API call even if cache exists
 */
export async function validateCartQuantityChange({
  productId,
  inventoryId,
  newQty,
  currentCartQty = 0,
  forceRefresh = false
}) {
  if (!productId) {
    throw new Error('validateCartQuantityChange: productId is required');
  }

  if (!inventoryId) {
    throw new Error('validateCartQuantityChange: inventoryId is required');
  }

  const requestedQty = Number(newQty) || 0;
  
  // If reducing quantity or removing item, no validation needed
  if (requestedQty <= currentCartQty) {
    return {
      status: 'success',
      message: 'Quantity change allowed',
      fromCache: false
    };
  }

  // For quantity increases, validate like adding new items
  const additionalQty = requestedQty - currentCartQty;
  
  return await validateAndAddToCart({
    productId,
    inventoryId,
    qty: additionalQty,
    currentCartQty,
    forceRefresh
  });
}

/**
 * Bulk validate multiple cart items
 * Efficiently handles multiple inventory checks with caching
 *
 * @param {Array} cartItems - Array of {productId, inventoryId, qty}
 * @param {boolean} forceRefresh - Force API calls for all items
 * @returns {Promise<Object>} - Validation results for each item
 */
export async function validateCartItems(cartItems = [], forceRefresh = false) {
  const results = {};
  const promises = cartItems.map(async (item) => {
    const { productId, inventoryId, qty = 1 } = item;
    
    if (!productId || !inventoryId) {
      results[productId] = {
        status: 'error',
        message: 'Missing productId or inventoryId'
      };
      return;
    }

    try {
      const result = await validateAndAddToCart({
        productId,
        inventoryId,
        qty: 0, // We're just checking current cart quantities
        currentCartQty: qty,
        forceRefresh
      });
      results[productId] = result;
    } catch (error) {
      results[productId] = {
        status: 'error',
        message: error.message
      };
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * Update inventory cache after successful operations
 * Call this after successful purchases or inventory updates
 *
 * @param {string|number} inventoryId 
 * @param {number} newQuantity 
 */
export function updateInventoryCache(inventoryId, newQuantity) {
  const cacheKey = String(inventoryId);
  if (typeof newQuantity === 'number' && newQuantity >= 0) {
    inventoryCache.set(cacheKey, {
      quantity: newQuantity,
      timestamp: Date.now()
    });
    console.log(`Updated cache for ${inventoryId}:`, newQuantity);
  }
}

/**
 * Checkout: sends cart payload to /orders
 * backend should respond with order id / success
 * Optionally updates inventory cache based on response
 *
 * @param {Object} opts
 * @param {Array} opts.cartItems - Cart items array
 * @param {Object} opts.payment - Payment information
 * @param {Object} opts.metadata - Additional metadata
 * @param {boolean} opts.updateCache - Whether to update cache after successful checkout
 */
export async function checkoutOrder({ 
  cartItems = [], 
  payment = {}, 
  metadata = {},
  updateCache = true 
}) {
  console.log('checkoutOrder', { cartItems, payment, metadata });
  
  try {
    const res = await api.post('/orders', { cartItems, payment, metadata });
    
    // If checkout was successful and we have inventory updates in response
    if (updateCache && res.data && res.data.inventoryUpdates) {
      res.data.inventoryUpdates.forEach(update => {
        if (update.inventoryId && typeof update.newQuantity === 'number') {
          updateInventoryCache(update.inventoryId, update.newQuantity);
        }
      });
    }
    
    return res.data;
  } catch (err) {
    throw err;
  }
}