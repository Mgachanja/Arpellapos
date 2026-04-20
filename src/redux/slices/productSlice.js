// src/redux/slices/productSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { rtkApi } from '../../services/rtkApi';
import indexedDb from '../../services/indexedDB';
import { 
  addItemToCart as addItemToCartHelper,
  extractId
} from './productsSlice-helpers';

const getKey = (p) => extractId(p);

function mergeProductsById(existing = [], incoming = []) {
  const map = {};
  existing.forEach(p => {
    const k = getKey(p);
    if (k) map[k] = { ...p, id: k };
  });

  incoming.forEach(p => {
    const k = getKey(p);
    if (!k) return;
    const prev = map[k] || { id: k, inventoryHistory: [] };
    const merged = {
      ...prev,
      ...p,
      id: k,
      name: (p.name || prev.name || p.productName || '') ,
      name_lower: (p.name || prev.name || p.productName || '').toLowerCase(),
      stockPrice: p.stockPrice !== undefined ? Number(p.stockPrice) : prev.stockPrice ?? null,
      stockQuantity: p.stockQuantity !== undefined ? Number(p.stockQuantity) : prev.stockQuantity ?? null,
      stockThreshold: p.stockThreshold !== undefined ? Number(p.stockThreshold) : prev.stockThreshold ?? null,
      inventoryHistory: Array.isArray(prev.inventoryHistory) ? prev.inventoryHistory.slice() : []
    };

    // Append inventory snapshot if inventory fields present on incoming
    if (p.stockPrice !== undefined || p.stockQuantity !== undefined || p.stockThreshold !== undefined) {
      const snapshot = {
        inventoryId: p.inventoryId || null,
        productId: k,
        stockPrice: merged.stockPrice,
        stockQuantity: merged.stockQuantity,
        stockThreshold: merged.stockThreshold,
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: p.updatedAt || new Date().toISOString(),
        raw: p
      };
      const last = merged.inventoryHistory[0];
      const isDup = last && last.inventoryId === snapshot.inventoryId && last.updatedAt === snapshot.updatedAt;
      if (!isDup) {
        merged.inventoryHistory.unshift(snapshot);
        if (merged.inventoryHistory.length > 50) merged.inventoryHistory.length = 50;
      }
    }

    map[k] = merged;
  });

  return Object.values(map);
}

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
  pageStatus: {},
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
  incrementalFetch: {
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
  }
};

/* -------------------------
   Thunks
------------------------- */

export const fetchSinglePage = createAsyncThunk(
  'products/fetchSinglePage',
  async ({ pageNumber, pageSize = 200 }, { dispatch, rejectWithValue }) => {
    try {
      dispatch(_setPagePending({ pageNumber }));
      const res = await dispatch(
        rtkApi.endpoints.getPagedProducts.initiate({ pageNumber, pageSize })
      ).unwrap();
      const data = res?.data ?? res;
      const items = Array.isArray(data) ? data : (data.items || []);

      // write raw page items into products store
      await indexedDb.putProducts(items);

      // build inventories from page items and persist
      const inventories = items
        .map(it => {
          const productId = it.productId || it.inventoryId || it.id;
          if (!productId) return null;
          const hasInventory = it.inventoryId || (it.stockPrice !== undefined) || (it.stockQuantity !== undefined);
          if (!hasInventory) return null;
          return {
            inventoryId: it.inventoryId || null,
            productId,
            stockPrice: it.stockPrice !== undefined ? Number(it.stockPrice) : undefined,
            stockQuantity: it.stockQuantity !== undefined ? Number(it.stockQuantity) : undefined,
            stockThreshold: it.stockThreshold !== undefined ? Number(it.stockThreshold) : undefined,
            createdAt: it.createdAt || null,
            updatedAt: it.updatedAt || null,
            raw: it
          };
        })
        .filter(Boolean);

      if (inventories.length) {
        await indexedDb.putInventories(inventories);
      }

      dispatch(_setPageFulfilled({ pageNumber, items }));
      return {
        pageNumber,
        items,
        itemCount: items.length,
        hasMore: items.length === pageSize
      };
    } catch (err) {
      const message = err?.data || err?.message || String(err);
      dispatch(_setPageRejected({ pageNumber, error: message }));
      return rejectWithValue({ pageNumber, error: message });
    }
  }
);

export const fetchAndIndexAllProducts = createAsyncThunk(
  'products/fetchAndIndexAllProducts',
  async ({ pageSize = 200, startPage = 1, force = false } = {}, { dispatch, getState, rejectWithValue }) => {
    try {
      if (force) {
        await indexedDb.clearAll();
        dispatch(resetIncrementalFetch());
      }

      let page = startPage;
      while (true) {
        const result = await dispatch(fetchSinglePage({ pageNumber: page, pageSize })).unwrap();
        if (!result || (result.itemCount === 0)) break;
        if (!result.hasMore) break;
        page += 1;
      }

      return { success: true };
    } catch (err) {
      return rejectWithValue(err?.message || String(err));
    }
  }
);

/* -------------------------
   Slice
------------------------- */

const productsSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {
    _setPagePending: (state, action) => {
      const { pageNumber } = action.payload;
      state.pageStatus = state.pageStatus || {};
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
      state.pageStatus = state.pageStatus || {};
      state.pageStatus[pageNumber] = {
        status: 'fulfilled',
        timestamp: new Date().toISOString(),
        itemCount: items.length,
        loading: false,
        error: null
      };

      if (items && items.length > 0) {
        state.products = mergeProductsById(state.products, items);
      }

      const stillLoading = Object.values(state.pageStatus).some(p => p.loading);
      state.loading = stillLoading;
      if (!stillLoading) state.error = null;
    },

    _setPageRejected: (state, action) => {
      const { pageNumber, error } = action.payload;
      state.pageStatus = state.pageStatus || {};
      state.pageStatus[pageNumber] = {
        status: 'rejected',
        timestamp: new Date().toISOString(),
        loading: false,
        error: typeof error === 'string' ? error : (error?.message || 'Unknown error')
      };

      const stillLoading = Object.values(state.pageStatus).some(p => p.loading);
      state.loading = stillLoading;
      if (!stillLoading) state.error = error;
    },

    // incremental fetch controls (kept minimal for compatibility)
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
      state.incrementalFetch.isActive = false;
      state.incrementalFetch.isPaused = false;
      state.incrementalFetch.hasMore = false;
    },

    completeIncrementalFetch: (state) => {
      state.incrementalFetch.isActive = false;
      state.incrementalFetch.hasMore = false;
      state.incrementalFetch.isPaused = false;
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

    // Cart management
    addItemToCart: (state, action) => {
      const { product, quantity = 1 } = action.payload;
      if (!product || (!product.id && !product._id && !product.productId)) {
        console.warn('Cannot add item to cart: Invalid product');
        return;
      }
      // addItemToCartHelper is now defensive and handles object-based cartItems
      state.cart = addItemToCartHelper(state.cart, product, quantity);
    },

    removeItemFromCart: (state, action) => {
      const identifier = action.payload;
      // removeItemFromCart helper is now defensive and handles composite keys
      const { removeItemFromCart: removeItemFromCartHelper } = require('./productsSlice-helpers');
      state.cart = removeItemFromCartHelper(state.cart, identifier);
    },

    updateCartItemQuantity: (state, action) => {
      const { productId, quantity } = action.payload;
      const { updateCartItemQuantity: updateCartItemQuantityHelper } = require('./productsSlice-helpers');
      state.cart = updateCartItemQuantityHelper(state.cart, productId, quantity);
    },

    clearCart: (state) => {
      state.cart = [];
    },

    // Filters and simple helpers
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

    clearCurrentProduct: (state) => {
      state.currentProduct = null;
      state.productError = null;
    },

    clearSearchResults: (state) => {
      state.searchResults = [];
      state.searchError = null;
    },

    clearErrors: (state) => {
      state.error = null;
      state.searchError = null;
      state.productError = null;
      state.incrementalFetch.error = null;
    }
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchSinglePage.pending, (state) => {
        // page pending handled by _setPagePending
      })
      .addCase(fetchSinglePage.fulfilled, (state) => {
        // handled by _setPageFulfilled
      })
      .addCase(fetchSinglePage.rejected, (state) => {
        // handled by _setPageRejected
      })

      .addCase(fetchAndIndexAllProducts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAndIndexAllProducts.fulfilled, (state) => {
        state.loading = false;
        state.error = null;
      })
      .addCase(fetchAndIndexAllProducts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error?.message;
      });
  }
});

/* -------------------------
   Exports
------------------------- */

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
export const selectCartItemCount = (state) => {
  const items = Array.isArray(state.products.cart) ? state.products.cart : [];
  return items.reduce((count, item) => count + (item.quantity || 1), 0);
};
export const selectCartTotal = (state) => {
  const items = Array.isArray(state.products.cart) ? state.products.cart : [];
  return items.reduce((total, item) => {
    const price = item.priceType === 'Retail' ? (item.price || 0) : (item.priceAfterDiscount || item.price || 0);
    return total + (price * (item.quantity || 1));
  }, 0);
};

export const selectFilters = (state) => state.products.filters;
export const selectPagination = (state) => state.products.pagination;
export const selectPageStatus = (state) => state.products.pageStatus;

export default productsSlice.reducer;
