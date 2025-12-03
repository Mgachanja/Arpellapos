// services/heldSalesService.js

const STORAGE_KEY = 'pos_held_sales';

/**
 * Get all held sales from localStorage
 */
export const getAllHeldSales = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading held sales:', error);
    return [];
  }
};

/**
 * Save a new held sale
 * @param {string} name - Name/identifier for the sale
 * @param {Array} items - Cart items
 * @param {Object} paymentData - Payment information (optional)
 * @returns {Object} The saved sale object
 */
export const holdSale = (name, items, paymentData = null) => {
  try {
    const sales = getAllHeldSales();
    
    const newSale = {
      id: `sale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      items: JSON.parse(JSON.stringify(items)), // Deep clone
      paymentData: paymentData ? JSON.parse(JSON.stringify(paymentData)) : null,
      timestamp: new Date().toISOString(),
    };
    
    sales.push(newSale);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
    
    return newSale;
  } catch (error) {
    console.error('Error holding sale:', error);
    throw error;
  }
};

/**
 * Retrieve a held sale by ID
 * @param {string} id - Sale ID
 * @returns {Object|null} The sale object or null if not found
 */
export const retrieveHeldSale = (id) => {
  try {
    const sales = getAllHeldSales();
    return sales.find(sale => sale.id === id) || null;
  } catch (error) {
    console.error('Error retrieving held sale:', error);
    return null;
  }
};

/**
 * Delete a held sale by ID
 * @param {string} id - Sale ID
 * @returns {boolean} Success status
 */
export const deleteHeldSale = (id) => {
  try {
    const sales = getAllHeldSales();
    const filtered = sales.filter(sale => sale.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Error deleting held sale:', error);
    return false;
  }
};

/**
 * Update a held sale
 * @param {string} id - Sale ID
 * @param {Object} updates - Updates to apply
 * @returns {boolean} Success status
 */
export const updateHeldSale = (id, updates) => {
  try {
    const sales = getAllHeldSales();
    const index = sales.findIndex(sale => sale.id === id);
    
    if (index === -1) return false;
    
    sales[index] = {
      ...sales[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
    return true;
  } catch (error) {
    console.error('Error updating held sale:', error);
    return false;
  }
};

/**
 * Clear all held sales
 * @returns {boolean} Success status
 */
export const clearAllHeldSales = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('Error clearing held sales:', error);
    return false;
  }
};

export default {
  getAllHeldSales,
  holdSale,
  retrieveHeldSale,
  deleteHeldSale,
  updateHeldSale,
  clearAllHeldSales,
};