// src/redux/slices/productsSlice-actions.js
// Additional action creators for the products slice

/**
 * Action creators for page management
 * These should be added to your productsSlice reducers object
 */

/**
 * Action to set page as pending
 * Usage in slice: _setPagePending: (state, action) => { ... }
 */
export const setPagePending = (pageNumber) => ({
  type: 'products/_setPagePending',
  payload: {
    pageNumber,
    status: 'pending',
    timestamp: new Date().toISOString()
  }
});

/**
 * Action to set page as fulfilled
 * Usage in slice: _setPageFulfilled: (state, action) => { ... }
 */
export const setPageFulfilled = (pageNumber, items = []) => ({
  type: 'products/_setPageFulfilled',
  payload: {
    pageNumber,
    items,
    status: 'fulfilled',
    timestamp: new Date().toISOString(),
    itemCount: items.length
  }
});

/**
 * Action to set page as rejected
 * Usage in slice: _setPageRejected: (state, action) => { ... }
 */
export const setPageRejected = (pageNumber, error) => ({
  type: 'products/_setPageRejected',
  payload: {
    pageNumber,
    error: typeof error === 'string' ? error : error?.message || 'Unknown error',
    status: 'rejected',
    timestamp: new Date().toISOString()
  }
});

/**
 * Reducer functions to add to your productsSlice
 * Add these to your slice's reducers object:
 */
export const pageManagementReducers = {
  _setPagePending: (state, action) => {
    const { pageNumber, status, timestamp } = action.payload;
    
    // Initialize pageStatus if it doesn't exist
    if (!state.pageStatus) {
      state.pageStatus = {};
    }
    
    state.pageStatus[pageNumber] = {
      status,
      timestamp,
      loading: true,
      error: null
    };
    
    // Set loading state for UI
    state.loading = true;
  },

  _setPageFulfilled: (state, action) => {
    const { pageNumber, items, status, timestamp, itemCount } = action.payload;
    
    // Initialize pageStatus if it doesn't exist
    if (!state.pageStatus) {
      state.pageStatus = {};
    }
    
    state.pageStatus[pageNumber] = {
      status,
      timestamp,
      itemCount,
      loading: false,
      error: null
    };
    
    // Update products in state (merge with existing)
    if (items && items.length > 0) {
      // Use your existing merge function or simple concat
      const existingProducts = state.products || [];
      
      // Simple merge by ID to avoid duplicates
      const productMap = new Map();
      
      // Add existing products
      existingProducts.forEach(product => {
        const id = product.id || product._id;
        if (id) productMap.set(id, product);
      });
      
      // Add new products (will overwrite if same ID)
      items.forEach(product => {
        const id = product.id || product._id;
        if (id) productMap.set(id, product);
      });
      
      state.products = Array.from(productMap.values());
    }
    
    // Check if any pages are still loading
    const stillLoading = state.pageStatus && Object.values(state.pageStatus).some(page => page.loading);
    state.loading = stillLoading;
    
    state.error = null;
  },

  _setPageRejected: (state, action) => {
    const { pageNumber, error, status, timestamp } = action.payload;
    
    // Initialize pageStatus if it doesn't exist
    if (!state.pageStatus) {
      state.pageStatus = {};
    }
    
    state.pageStatus[pageNumber] = {
      status,
      timestamp,
      loading: false,
      error
    };
    
    // Check if any pages are still loading
    const stillLoading = state.pageStatus && Object.values(state.pageStatus).some(page => page.loading);
    state.loading = stillLoading;
    
    // Set error in global state if no pages are loading
    if (!stillLoading) {
      state.error = error;
    }
  }
};

/**
 * Cart management reducers
 * Add these to your productsSlice if you need cart functionality:
 */
export const cartManagementReducers = {
  addItemToCart: (state, action) => {
    const { product, quantity = 1 } = action.payload;
    
    if (!product || (!product.id && !product._id)) {
      console.warn('Cannot add item to cart: Invalid product');
      return;
    }
    
    // Initialize cart if it doesn't exist
    if (!state.cart) {
      state.cart = [];
    }
    
    const productId = product.id || product._id;
    const existingItemIndex = state.cart.findIndex(item => 
      (item.id || item._id) === productId
    );
    
    if (existingItemIndex >= 0) {
      // Update quantity of existing item
      state.cart[existingItemIndex].quantity = (state.cart[existingItemIndex].quantity || 0) + quantity;
    } else {
      // Add new item to cart
      const cartItem = {
        ...product,
        quantity: quantity,
        addedAt: new Date().toISOString()
      };
      state.cart.push(cartItem);
    }
  },

  removeItemFromCart: (state, action) => {
    const productId = action.payload;
    
    if (state.cart) {
      state.cart = state.cart.filter(item => 
        (item.id || item._id) !== productId
      );
    }
  },

  updateCartItemQuantity: (state, action) => {
    const { productId, quantity } = action.payload;
    
    if (!state.cart) return;
    
    if (quantity <= 0) {
      // Remove item if quantity is 0 or negative
      state.cart = state.cart.filter(item => 
        (item.id || item._id) !== productId
      );
    } else {
      // Update quantity
      const itemIndex = state.cart.findIndex(item => 
        (item.id || item._id) === productId
      );
      
      if (itemIndex >= 0) {
        state.cart[itemIndex].quantity = quantity;
      }
    }
  },

  clearCart: (state) => {
    state.cart = [];
  }
};

/**
 * Complete set of action creators you can dispatch
 */
export const actionCreators = {
  // Page management
  setPagePending,
  setPageFulfilled,
  setPageRejected,
  
  // Cart management (if you add cart reducers)
  addToCart: (product, quantity = 1) => ({
    type: 'products/addItemToCart',
    payload: { product, quantity }
  }),
  
  removeFromCart: (productId) => ({
    type: 'products/removeItemFromCart',
    payload: productId
  }),
  
  updateCartQuantity: (productId, quantity) => ({
    type: 'products/updateCartItemQuantity',
    payload: { productId, quantity }
  }),
  
  clearCart: () => ({
    type: 'products/clearCart'
  })
};

export default {
  pageManagementReducers,
  cartManagementReducers,
  actionCreators
};