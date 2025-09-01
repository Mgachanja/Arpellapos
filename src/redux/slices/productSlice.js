// src/redux/slices/productsSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import indexedDb from '../../services/indexedDB'; // adjust path if needed
import { 
  fetchProductsApi,
  normalizeProductsData,
  mergeProductsByName,
  mergeProductsById,
  addItemToCart as addItemToCartHelper,
  sleep,
  baseUrl
} from './productsSlice-helpers';

// Initial state
const initialState = {
  products: [],
  cart: [],
  loading: false,
  error: null,
  searchResults: [],
  searchLoading: false,
  searchError: null,
  currentProduct: null,
  productLoading: false,
  productError: null,
  pageStatus: {}, // For tracking individual page fetch status
  filters: {
    category: '',
    priceRange: { min: 0, max: Infinity },
    searchTerm: ''
  },
  pagination: {
    currentPage: 1,
    pageSize: 200,
    totalPages: 1,
    totalItems: 0
  },
  // Enhanced state for incremental fetching
  incrementalFetch: {
    isActive: false,
    currentPage: 1,
    totalFetched: 0,
    startTime: null,
    lastFetchTime: null,
    fetchInterval: 3000, // 3 seconds default
    hasMore: true,
    isPaused: false,
    autoFetch: false, // Whether to automatically start fetching on app load
    error: null
  }
};

// Existing thunks
export const fetchProducts = createAsyncThunk(
  'products/fetchProducts',
  async (params = {}, { rejectWithValue }) => {
    try {
      const { pageNumber = 1, pageSize = 200 } = params;
      const response = await fetchProductsApi(pageNumber, pageSize);
      const products = normalizeProductsData(response.data);
      
      return {
        products,
        pagination: {
          currentPage: pageNumber,
          pageSize,
          totalItems: response.data.totalItems || products.length,
          totalPages: Math.ceil((response.data.totalItems || products.length) / pageSize)
        }
      };
    } catch (error) {
      return rejectWithValue(error?.response?.data || error.message || 'Failed to fetch products');
    }
  }
);

export const fetchProductById = createAsyncThunk(
  'products/fetchProductById',
  async (productId, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${baseUrl}/products/${productId}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error?.response?.data || error.message || 'Failed to fetch product');
    }
  }
);

export const searchProducts = createAsyncThunk(
  'products/searchProducts',
  async (searchParams, { rejectWithValue }) => {
    try {
      const { searchTerm, pageNumber = 1, pageSize = 50 } = searchParams;
      const response = await axios.get(`${baseUrl}/products/search`, {
        params: { q: searchTerm, pageNumber, pageSize }
      });
      return normalizeProductsData(response.data);
    } catch (error) {
      return rejectWithValue(error?.response?.data || error.message || 'Search failed');
    }
  }
);

/**
 * Fetch a single page of products
 */
export const fetchSinglePage = createAsyncThunk(
  'products/fetchSinglePage',
  async (params, { dispatch, getState, rejectWithValue }) => {
    const { pageNumber, pageSize = 200 } = params;
    
    try {
      // Set page as pending
      dispatch(_setPagePending({ pageNumber }));
      
      const url = `${baseUrl}/paged-products?pageNumber=${pageNumber}&pageSize=${pageSize}`;
      const { data } = await axios.get(url);
      const items = Array.isArray(data) ? data : (data.items || []);
      
      // Store items in IndexedDB
      await indexedDb.putProducts(items);
      
      // Set page as fulfilled
      dispatch(_setPageFulfilled({ pageNumber, items }));
      
      return { 
        pageNumber, 
        items, 
        hasMore: items.length === pageSize,
        itemCount: items.length 
      };
    } catch (err) {
      dispatch(_setPageRejected({ pageNumber, error: err?.response?.data || err.message || err }));
      return rejectWithValue({
        pageNumber,
        error: err?.response?.data || err.message || err
      });
    }
  }
);

/**
 * Start incremental fetching of all products
 */
export const startIncrementalFetch = createAsyncThunk(
  'products/startIncrementalFetch',
  async (params = {}, { dispatch, getState, rejectWithValue }) => {
    const { 
      pageSize = 200, 
      interval = 3000, 
      force = false,
      startPage = 1 
    } = params;

    try {
      if (force) {
        await indexedDb.clearAll();
        dispatch(resetIncrementalFetch());
      }

      dispatch(setIncrementalFetchConfig({ 
        fetchInterval: interval, 
        currentPage: startPage,
        isActive: true,
        hasMore: true,
        startTime: new Date().toISOString(),
        error: null
      }));

      // Start the incremental fetch process
      dispatch(continueIncrementalFetch({ pageSize }));
      
      return { success: true, startPage, interval };
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to start incremental fetch');
    }
  }
);

/**
 * Continue incremental fetching (fetches next page and schedules the next one)
 */
export const continueIncrementalFetch = createAsyncThunk(
  'products/continueIncrementalFetch',
  async (params = {}, { dispatch, getState, rejectWithValue }) => {
    const { pageSize = 200 } = params;
    const state = getState();
    const { incrementalFetch } = state.products;

    // Check if we should continue
    if (!incrementalFetch.isActive || !incrementalFetch.hasMore || incrementalFetch.isPaused) {
      return { shouldStop: true, reason: 'Fetch stopped or paused' };
    }

    try {
      const result = await dispatch(fetchSinglePage({ 
        pageNumber: incrementalFetch.currentPage, 
        pageSize 
      })).unwrap();

      // Update incremental fetch state
      dispatch(updateIncrementalFetchProgress({
        currentPage: incrementalFetch.currentPage + 1,
        totalFetched: incrementalFetch.totalFetched + result.itemCount,
        hasMore: result.hasMore,
        lastFetchTime: new Date().toISOString()
      }));

      // Schedule next fetch if there are more items
      if (result.hasMore && incrementalFetch.isActive) {
        setTimeout(() => {
          const currentState = getState();
          if (currentState.products.incrementalFetch.isActive && 
              currentState.products.incrementalFetch.hasMore &&
              !currentState.products.incrementalFetch.isPaused) {
            dispatch(continueIncrementalFetch({ pageSize }));
          }
        }, incrementalFetch.fetchInterval);
      } else {
        // No more pages, mark as complete
        dispatch(completeIncrementalFetch());
      }

      return result;
    } catch (error) {
      dispatch(setIncrementalFetchError(error.error || error.message || 'Fetch failed'));
      return rejectWithValue(error);
    }
  }
);

/**
 * Enhanced version: fetchAndIndexAllProducts (kept for backward compatibility)
 * Now uses the incremental system internally
 */
export const fetchAndIndexAllProducts = createAsyncThunk(
  'products/fetchAndIndexAllProducts',
  async (params = {}, { dispatch, rejectWithValue }) => {
    try {
      const { pageSize = 200, force = false, interval = 4000 } = params;
      
      await dispatch(startIncrementalFetch({ 
        pageSize, 
        interval, 
        force 
      })).unwrap();
      
      return { success: true, method: 'incremental' };
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

// Create the products slice
const productsSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {
    // Page management reducers
    _setPagePending: (state, action) => {
      const { pageNumber } = action.payload;
      
      if (!state.pageStatus) {
        state.pageStatus = {};
      }
      
      state.pageStatus[pageNumber] = {
        status: 'pending',
        timestamp: new Date().toISOString(),
        loading: true,
        error: null
      };
      
      state.loading = true;
    },

    _setPageFulfilled: (state, action) => {
      const { pageNumber, items } = action.payload;
      
      if (!state.pageStatus) {
        state.pageStatus = {};
      }
      
      state.pageStatus[pageNumber] = {
        status: 'fulfilled',
        timestamp: new Date().toISOString(),
        itemCount: items.length,
        loading: false,
        error: null
      };
      
      // Merge products with existing ones
      if (items && items.length > 0) {
        state.products = mergeProductsById(state.products, items);
      }
      
      // Check if any pages are still loading
      const stillLoading = Object.values(state.pageStatus).some(page => page.loading);
      state.loading = stillLoading;
      
      if (!stillLoading) {
        state.error = null;
      }
    },

    _setPageRejected: (state, action) => {
      const { pageNumber, error } = action.payload;
      
      if (!state.pageStatus) {
        state.pageStatus = {};
      }
      
      state.pageStatus[pageNumber] = {
        status: 'rejected',
        timestamp: new Date().toISOString(),
        loading: false,
        error: typeof error === 'string' ? error : error?.message || 'Unknown error'
      };
      
      // Check if any pages are still loading
      const stillLoading = Object.values(state.pageStatus).some(page => page.loading);
      state.loading = stillLoading;
      
      if (!stillLoading) {
        state.error = error;
      }
    },

    // Incremental fetch management
    setIncrementalFetchConfig: (state, action) => {
      state.incrementalFetch = {
        ...state.incrementalFetch,
        ...action.payload
      };
    },

    updateIncrementalFetchProgress: (state, action) => {
      state.incrementalFetch = {
        ...state.incrementalFetch,
        ...action.payload
      };
    },

    pauseIncrementalFetch: (state) => {
      state.incrementalFetch.isPaused = true;
    },

    resumeIncrementalFetch: (state) => {
      state.incrementalFetch.isPaused = false;
    },

    stopIncrementalFetch: (state) => {
      state.incrementalFetch = {
        ...state.incrementalFetch,
        isActive: false,
        isPaused: false,
        hasMore: false
      };
    },

    completeIncrementalFetch: (state) => {
      state.incrementalFetch = {
        ...state.incrementalFetch,
        isActive: false,
        hasMore: false,
        isPaused: false
      };
    },

    resetIncrementalFetch: (state) => {
      state.incrementalFetch = {
        isActive: false,
        currentPage: 1,
        totalFetched: 0,
        startTime: null,
        lastFetchTime: null,
        fetchInterval: 3000,
        hasMore: true,
        isPaused: false,
        autoFetch: false,
        error: null
      };
      state.pageStatus = {};
    },

    setIncrementalFetchError: (state, action) => {
      state.incrementalFetch.error = action.payload;
      state.incrementalFetch.isActive = false;
    },

    setAutoFetch: (state, action) => {
      state.incrementalFetch.autoFetch = action.payload;
    },

    // Cart management reducers
    addItemToCart: (state, action) => {
      const { product, quantity = 1 } = action.payload;
      
      if (!product || (!product.id && !product._id)) {
        console.warn('Cannot add item to cart: Invalid product');
        return;
      }
      
      state.cart = addItemToCartHelper(state.cart, product, quantity);
    },

    removeItemFromCart: (state, action) => {
      const productId = action.payload;
      state.cart = state.cart.filter(item => 
        (item.id || item._id) !== productId
      );
    },

    updateCartItemQuantity: (state, action) => {
      const { productId, quantity } = action.payload;
      
      if (quantity <= 0) {
        state.cart = state.cart.filter(item => 
          (item.id || item._id) !== productId
        );
      } else {
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
    },

    // Filter and search reducers
    setFilter: (state, action) => {
      const { filterType, value } = action.payload;
      state.filters[filterType] = value;
    },

    clearFilters: (state) => {
      state.filters = {
        category: '',
        priceRange: { min: 0, max: Infinity },
        searchTerm: ''
      };
    },

    // Product management
    clearCurrentProduct: (state) => {
      state.currentProduct = null;
      state.productError = null;
    },

    clearSearchResults: (state) => {
      state.searchResults = [];
      state.searchError = null;
    },

    // General state management
    clearErrors: (state) => {
      state.error = null;
      state.searchError = null;
      state.productError = null;
      state.incrementalFetch.error = null;
    }
  },
  
  extraReducers: (builder) => {
    // fetchProducts cases
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.loading = false;
        state.products = action.payload.products;
        state.pagination = { ...state.pagination, ...action.payload.pagination };
        state.error = null;
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

    // fetchProductById cases
      .addCase(fetchProductById.pending, (state) => {
        state.productLoading = true;
        state.productError = null;
      })
      .addCase(fetchProductById.fulfilled, (state, action) => {
        state.productLoading = false;
        state.currentProduct = action.payload;
        state.productError = null;
      })
      .addCase(fetchProductById.rejected, (state, action) => {
        state.productLoading = false;
        state.productError = action.payload;
      })

    // searchProducts cases
      .addCase(searchProducts.pending, (state) => {
        state.searchLoading = true;
        state.searchError = null;
      })
      .addCase(searchProducts.fulfilled, (state, action) => {
        state.searchLoading = false;
        state.searchResults = action.payload;
        state.searchError = null;
      })
      .addCase(searchProducts.rejected, (state, action) => {
        state.searchLoading = false;
        state.searchError = action.payload;
      })

    // fetchSinglePage cases
      .addCase(fetchSinglePage.pending, (state) => {
        // Individual page loading is handled by _setPagePending
      })
      .addCase(fetchSinglePage.fulfilled, (state, action) => {
        // Individual page fulfillment is handled by _setPageFulfilled
      })
      .addCase(fetchSinglePage.rejected, (state, action) => {
        // Individual page rejection is handled by _setPageRejected
      })

    // startIncrementalFetch cases
      .addCase(startIncrementalFetch.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(startIncrementalFetch.fulfilled, (state, action) => {
        state.error = null;
      })
      .addCase(startIncrementalFetch.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.incrementalFetch.isActive = false;
        state.incrementalFetch.error = action.payload;
      })

    // continueIncrementalFetch cases
      .addCase(continueIncrementalFetch.fulfilled, (state, action) => {
        if (action.payload.shouldStop) {
          state.loading = false;
        }
      })
      .addCase(continueIncrementalFetch.rejected, (state, action) => {
        state.incrementalFetch.isActive = false;
        state.incrementalFetch.error = action.payload;
      })

    // fetchAndIndexAllProducts cases (backward compatibility)
      .addCase(fetchAndIndexAllProducts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAndIndexAllProducts.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
      })
      .addCase(fetchAndIndexAllProducts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  }
});

// Export actions
export const { 
  _setPagePending,
  _setPageFulfilled, 
  _setPageRejected,
  setIncrementalFetchConfig,
  updateIncrementalFetchProgress,
  pauseIncrementalFetch,
  resumeIncrementalFetch,
  stopIncrementalFetch,
  completeIncrementalFetch,
  resetIncrementalFetch,
  setIncrementalFetchError,
  setAutoFetch,
  addItemToCart,
  removeItemFromCart,
  updateCartItemQuantity,
  clearCart,
  setFilter,
  clearFilters,
  clearCurrentProduct,
  clearSearchResults,
  clearErrors
} = productsSlice.actions;

// Selectors
export const selectAllProducts = (state) => state.products.products;
export const selectProductsLoading = (state) => state.products.loading;
export const selectProductsError = (state) => state.products.error;
export const selectCurrentProduct = (state) => state.products.currentProduct;
export const selectProductLoading = (state) => state.products.productLoading;
export const selectProductError = (state) => state.products.productError;
export const selectSearchResults = (state) => state.products.searchResults;
export const selectSearchLoading = (state) => state.products.searchLoading;
export const selectSearchError = (state) => state.products.searchError;
export const selectCart = (state) => state.products.cart;
export const selectCartItemCount = (state) => 
  state.products.cart.reduce((count, item) => count + (item.quantity || 1), 0);
export const selectCartTotal = (state) => 
  state.products.cart.reduce((total, item) => {
    const price = item.salePrice || item.price || 0;
    return total + (price * (item.quantity || 1));
  }, 0);
export const selectFilters = (state) => state.products.filters;
export const selectPagination = (state) => state.products.pagination;
export const selectPageStatus = (state) => state.products.pageStatus;

// New selectors for incremental fetch
export const selectIncrementalFetch = (state) => state.products.incrementalFetch;
export const selectIncrementalFetchIsActive = (state) => state.products.incrementalFetch.isActive;
export const selectIncrementalFetchProgress = (state) => ({
  currentPage: state.products.incrementalFetch.currentPage,
  totalFetched: state.products.incrementalFetch.totalFetched,
  hasMore: state.products.incrementalFetch.hasMore,
  isPaused: state.products.incrementalFetch.isPaused,
  error: state.products.incrementalFetch.error
});

// Enhanced page status selector with summary
export const selectPageStatusSummary = (state) => {
  const pageStatus = state.products.pageStatus || {};
  const pages = Object.keys(pageStatus);
  
  return {
    totalPages: pages.length,
    pending: pages.filter(p => pageStatus[p].status === 'pending').length,
    fulfilled: pages.filter(p => pageStatus[p].status === 'fulfilled').length,
    rejected: pages.filter(p => pageStatus[p].status === 'rejected').length,
    totalItems: pages.reduce((sum, p) => sum + (pageStatus[p].itemCount || 0), 0)
  };
};

// Filtered products selector
export const selectFilteredProducts = (state) => {
  const { products, filters } = state.products;
  let filtered = [...products];

  // Filter by category
  if (filters.category && filters.category !== '') {
    filtered = filtered.filter(product => 
      (product.category || '').toLowerCase().includes(filters.category.toLowerCase())
    );
  }

  // Filter by price range
  if (filters.priceRange.min > 0 || filters.priceRange.max < Infinity) {
    filtered = filtered.filter(product => {
      const price = product.salePrice || product.price || 0;
      return price >= filters.priceRange.min && price <= filters.priceRange.max;
    });
  }

  // Filter by search term
  if (filters.searchTerm && filters.searchTerm.trim() !== '') {
    const searchTerm = filters.searchTerm.toLowerCase();
    filtered = filtered.filter(product => 
      (product.name || '').toLowerCase().includes(searchTerm) ||
      (product.description || '').toLowerCase().includes(searchTerm) ||
      (product.category || '').toLowerCase().includes(searchTerm)
    );
  }

  return filtered;
};

export default productsSlice.reducer;