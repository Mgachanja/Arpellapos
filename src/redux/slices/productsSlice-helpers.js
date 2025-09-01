// src/redux/slices/productsSlice-helpers.js
import axios from 'axios';

// Base URL - adjust this to match your API endpoint
export const baseUrl ="https://api.arpellastore.com";

/**
 * API function to fetch products with pagination
 * @param {number} pageNumber - Page number to fetch
 * @param {number} pageSize - Number of items per page
 * @returns {Promise} - Axios response promise
 */
export const fetchProductsApi = async (pageNumber = 1, pageSize = 200) => {
  const url = `${baseUrl}/paged-products?pageNumber=${pageNumber}&pageSize=${pageSize}`;
  return axios.get(url);
};

/**
 * API function to fetch all products without pagination
 * @returns {Promise} - Axios response promise
 */
export const fetchAllProductsApi = async () => {
  const url = `${baseUrl}/products`;
  return axios.get(url);
};

/**
 * API function to fetch a single product by ID
 * @param {string|number} productId - Product ID
 * @returns {Promise} - Axios response promise
 */
export const fetchProductByIdApi = async (productId) => {
  const url = `${baseUrl}/products/${productId}`;
  return axios.get(url);
};

/**
 * API function to search products
 * @param {string} searchTerm - Search term
 * @param {number} pageNumber - Page number
 * @param {number} pageSize - Items per page
 * @returns {Promise} - Axios response promise
 */
export const searchProductsApi = async (searchTerm, pageNumber = 1, pageSize = 50) => {
  const url = `${baseUrl}/products/search?q=${encodeURIComponent(searchTerm)}&pageNumber=${pageNumber}&pageSize=${pageSize}`;
  return axios.get(url);
};

/**
 * Utility function to normalize products data
 * Handles different API response formats
 * @param {any} data - Raw API response data
 * @returns {Array} - Normalized products array
 */
export const normalizeProductsData = (data) => {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.items)) {
    return data.items;
  }
  if (data && Array.isArray(data.products)) {
    return data.products;
  }
  if (data && Array.isArray(data.data)) {
    return data.data;
  }
  return [];
};

/**
 * Utility function to merge products by name, avoiding duplicates
 * @param {Array} existingProducts - Current products in state
 * @param {Array} newProducts - New products to merge
 * @returns {Array} - Merged products array without duplicates
 */
export const mergeProductsByName = (existingProducts = [], newProducts = []) => {
  const productMap = new Map();
  
  // Add existing products to map
  existingProducts.forEach(product => {
    if (product && product.name) {
      productMap.set(product.name.toLowerCase(), product);
    }
  });
  
  // Add new products, overwriting existing ones with same name
  newProducts.forEach(product => {
    if (product && product.name) {
      productMap.set(product.name.toLowerCase(), product);
    }
  });
  
  return Array.from(productMap.values());
};

/**
 * Utility function to merge products by ID, avoiding duplicates
 * @param {Array} existingProducts - Current products in state
 * @param {Array} newProducts - New products to merge
 * @returns {Array} - Merged products array without duplicates
 */
export const mergeProductsById = (existingProducts = [], newProducts = []) => {
  const productMap = new Map();
  
  // Add existing products to map
  existingProducts.forEach(product => {
    if (product && (product.id || product._id)) {
      const id = product.id || product._id;
      productMap.set(id, product);
    }
  });
  
  // Add new products, overwriting existing ones with same ID
  newProducts.forEach(product => {
    if (product && (product.id || product._id)) {
      const id = product.id || product._id;
      productMap.set(id, product);
    }
  });
  
  return Array.from(productMap.values());
};

/**
 * Utility function to format price for display
 * @param {number|string} price - Price value
 * @param {string} currency - Currency symbol (default: 'KSh')
 * @returns {string} - Formatted price string
 */
export const formatPrice = (price, currency = 'KSh') => {
  if (!price && price !== 0) return `${currency} 0.00`;
  const numPrice = parseFloat(price);
  if (isNaN(numPrice)) return `${currency} 0.00`;
  return `${currency} ${numPrice.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Utility function to calculate discount percentage
 * @param {number} originalPrice - Original price
 * @param {number} salePrice - Sale price
 * @returns {number} - Discount percentage
 */
export const calculateDiscountPercentage = (originalPrice, salePrice) => {
  if (!originalPrice || !salePrice || originalPrice <= salePrice) return 0;
  return Math.round(((originalPrice - salePrice) / originalPrice) * 100);
};

/**
 * Utility function to check if product is on sale
 * @param {Object} product - Product object
 * @returns {boolean} - True if product is on sale
 */
export const isProductOnSale = (product) => {
  if (!product) return false;
  const { price, salePrice, originalPrice } = product;
  
  // Check if there's a sale price that's lower than regular price
  if (salePrice && price && parseFloat(salePrice) < parseFloat(price)) return true;
  if (originalPrice && price && parseFloat(price) < parseFloat(originalPrice)) return true;
  if (originalPrice && salePrice && parseFloat(salePrice) < parseFloat(originalPrice)) return true;
  
  return false;
};

/**
 * Utility function to get the effective price (sale price if available, otherwise regular price)
 * @param {Object} product - Product object
 * @returns {number} - Effective price
 */
export const getEffectivePrice = (product) => {
  if (!product) return 0;
  const { price, salePrice, originalPrice } = product;
  
  // Priority: salePrice > price > originalPrice
  if (salePrice && parseFloat(salePrice) > 0) return parseFloat(salePrice);
  if (price && parseFloat(price) > 0) return parseFloat(price);
  if (originalPrice && parseFloat(originalPrice) > 0) return parseFloat(originalPrice);
  
  return 0;
};

/**
 * Utility function to filter products by category
 * @param {Array} products - Products array
 * @param {string} category - Category to filter by
 * @returns {Array} - Filtered products
 */
export const filterProductsByCategory = (products = [], category) => {
  if (!category || category === 'all') return products;
  
  return products.filter(product => {
    if (!product) return false;
    const productCategory = product.category || product.categoryName || '';
    return productCategory.toLowerCase().includes(category.toLowerCase());
  });
};

/**
 * Utility function to search products by name or description
 * @param {Array} products - Products array
 * @param {string} searchTerm - Search term
 * @returns {Array} - Filtered products
 */
export const searchProducts = (products = [], searchTerm) => {
  if (!searchTerm || searchTerm.trim() === '') return products;
  
  const term = searchTerm.toLowerCase().trim();
  
  return products.filter(product => {
    if (!product) return false;
    
    const name = (product.name || '').toLowerCase();
    const description = (product.description || '').toLowerCase();
    const category = (product.category || product.categoryName || '').toLowerCase();
    const brand = (product.brand || '').toLowerCase();
    
    return name.includes(term) || 
           description.includes(term) || 
           category.includes(term) || 
           brand.includes(term);
  });
};

/**
 * Utility function to sort products
 * @param {Array} products - Products array
 * @param {string} sortBy - Sort criteria ('name', 'price', 'category', 'newest')
 * @param {string} sortOrder - Sort order ('asc', 'desc')
 * @returns {Array} - Sorted products
 */
export const sortProducts = (products = [], sortBy = 'name', sortOrder = 'asc') => {
  const sorted = [...products].sort((a, b) => {
    let aValue, bValue;
    
    switch (sortBy) {
      case 'name':
        aValue = (a.name || '').toLowerCase();
        bValue = (b.name || '').toLowerCase();
        return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        
      case 'price':
        aValue = getEffectivePrice(a);
        bValue = getEffectivePrice(b);
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
        
      case 'category':
        aValue = (a.category || a.categoryName || '').toLowerCase();
        bValue = (b.category || b.categoryName || '').toLowerCase();
        return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        
      case 'newest':
        aValue = new Date(a.createdAt || a.dateAdded || 0);
        bValue = new Date(b.createdAt || b.dateAdded || 0);
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
        
      default:
        return 0;
    }
  });
  
  return sorted;
};

/**
 * Utility function to validate product object
 * @param {Object} product - Product object to validate
 * @returns {Object} - Validation result with isValid boolean and errors array
 */
export const validateProduct = (product) => {
  const errors = [];
  
  if (!product) {
    errors.push('Product is required');
    return { isValid: false, errors };
  }
  
  if (!product.name || product.name.trim() === '') {
    errors.push('Product name is required');
  }
  
  if (!product.price && product.price !== 0) {
    errors.push('Product price is required');
  } else if (isNaN(parseFloat(product.price)) || parseFloat(product.price) < 0) {
    errors.push('Product price must be a valid non-negative number');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Cart utility functions
 */

/**
 * Add item to cart with quantity
 * @param {Array} cartItems - Current cart items
 * @param {Object} product - Product to add
 * @param {number} quantity - Quantity to add (default: 1)
 * @returns {Array} - Updated cart items
 */
export const addItemToCart = (cartItems = [], product, quantity = 1) => {
  if (!product || !product.id && !product._id) {
    console.warn('Cannot add item to cart: Invalid product');
    return cartItems;
  }
  
  const productId = product.id || product._id;
  const existingItemIndex = cartItems.findIndex(item => 
    (item.id || item._id) === productId
  );
  
  if (existingItemIndex >= 0) {
    // Update quantity of existing item
    const updatedItems = [...cartItems];
    updatedItems[existingItemIndex] = {
      ...updatedItems[existingItemIndex],
      quantity: (updatedItems[existingItemIndex].quantity || 0) + quantity
    };
    return updatedItems;
  } else {
    // Add new item to cart
    const cartItem = {
      ...product,
      quantity: quantity,
      addedAt: new Date().toISOString()
    };
    return [...cartItems, cartItem];
  }
};

/**
 * Remove item from cart
 * @param {Array} cartItems - Current cart items
 * @param {string|number} productId - Product ID to remove
 * @returns {Array} - Updated cart items
 */
export const removeItemFromCart = (cartItems = [], productId) => {
  return cartItems.filter(item => 
    (item.id || item._id) !== productId
  );
};

/**
 * Update item quantity in cart
 * @param {Array} cartItems - Current cart items
 * @param {string|number} productId - Product ID to update
 * @param {number} newQuantity - New quantity
 * @returns {Array} - Updated cart items
 */
export const updateCartItemQuantity = (cartItems = [], productId, newQuantity) => {
  if (newQuantity <= 0) {
    return removeItemFromCart(cartItems, productId);
  }
  
  return cartItems.map(item => {
    if ((item.id || item._id) === productId) {
      return { ...item, quantity: newQuantity };
    }
    return item;
  });
};

/**
 * Calculate cart total
 * @param {Array} cartItems - Cart items
 * @returns {number} - Total cart value
 */
export const calculateCartTotal = (cartItems = []) => {
  return cartItems.reduce((total, item) => {
    const price = getEffectivePrice(item);
    const quantity = item.quantity || 1;
    return total + (price * quantity);
  }, 0);
};

/**
 * Calculate cart item count
 * @param {Array} cartItems - Cart items
 * @returns {number} - Total number of items in cart
 */
export const calculateCartItemCount = (cartItems = []) => {
  return cartItems.reduce((count, item) => count + (item.quantity || 1), 0);
};

/**
 * Clear cart
 * @returns {Array} - Empty cart array
 */
export const clearCart = () => {
  return [];
};

/**
 * Page management utility functions for pagination state
 */

/**
 * Create page pending action payload
 * @param {number} pageNumber - Page number being fetched
 * @returns {Object} - Action payload
 */
export const createPagePendingPayload = (pageNumber) => ({
  pageNumber,
  status: 'pending',
  timestamp: new Date().toISOString()
});

/**
 * Create page fulfilled action payload
 * @param {number} pageNumber - Page number that was fetched
 * @param {Array} items - Items that were fetched
 * @returns {Object} - Action payload
 */
export const createPageFulfilledPayload = (pageNumber, items = []) => ({
  pageNumber,
  items,
  status: 'fulfilled',
  timestamp: new Date().toISOString(),
  itemCount: items.length
});

/**
 * Create page rejected action payload
 * @param {number} pageNumber - Page number that failed
 * @param {string|Error} error - Error that occurred
 * @returns {Object} - Action payload
 */
export const createPageRejectedPayload = (pageNumber, error) => ({
  pageNumber,
  error: typeof error === 'string' ? error : error?.message || 'Unknown error',
  status: 'rejected',
  timestamp: new Date().toISOString()
});

/**
 * Sleep utility function for delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after delay
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry utility function for API calls
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Delay between retries in milliseconds
 * @returns {Promise} - Promise that resolves with function result or rejects with last error
 */
export const retryApiCall = async (fn, maxRetries = 3, delay = 1000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      console.warn(`API call failed (attempt ${attempt}/${maxRetries}):`, error.message);
      await sleep(delay * attempt); // Exponential backoff
    }
  }
};

export default {
  // API functions
  fetchProductsApi,
  fetchAllProductsApi,
  fetchProductByIdApi,
  searchProductsApi,
  
  // Product utilities
  normalizeProductsData,
  mergeProductsByName,
  mergeProductsById,
  formatPrice,
  calculateDiscountPercentage,
  isProductOnSale,
  getEffectivePrice,
  filterProductsByCategory,
  searchProducts,
  sortProducts,
  validateProduct,
  
  // Cart utilities
  addItemToCart,
  removeItemFromCart,
  updateCartItemQuantity,
  calculateCartTotal,
  calculateCartItemCount,
  clearCart,
  
  // Page management utilities
  createPagePendingPayload,
  createPageFulfilledPayload,
  createPageRejectedPayload,
  
  // General utilities
  sleep,
  retryApiCall
};