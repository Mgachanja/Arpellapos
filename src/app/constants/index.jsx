// src/constants/index.js

// API Configuration
export const baseUrl = "https://api.arpellastore.com";
export const apiTimeout = 30000; // 30 seconds

// App Configuration
export const appName = 'POS System';
export const version = '1.0.0';

// LocalStorage Keys
export const STORAGE_KEYS = {
  USER_TOKEN: 'pos_user_token',
  USER_DATA: 'pos_user_data',
  CART_DATA: 'pos_cart_data',
  SETTINGS: 'pos_settings'
};

// API Endpoints
export const API_ENDPOINTS = {
  // Products
  PRODUCTS: '/products',
  PAGED_PRODUCTS: '/pos-paged-products',
  PRODUCT_BY_ID: (id) => `/products/${id}`,
  SEARCH_PRODUCTS: '/products/search',
  
  // Orders
  ORDERS: '/orders',
  ORDER_BY_ID: (id) => `/orders/${id}`,
  
  // Cart
  VALIDATE_CART: '/cart/validate',
  ADD_TO_CART: '/cart/add',
  
  // Auth
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh'
};

// Pagination Settings
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 200,
  MAX_PAGE_SIZE: 500,
  DEFAULT_SEARCH_SIZE: 50
};

// IndexedDB Configuration
export const INDEXED_DB = {
  DB_NAME: 'posSystemDB',
  VERSION: 1,
  STORES: {
    PRODUCTS: 'products',
    ORDERS: 'orders',
    CART: 'cart'
  }
};

// UI Configuration
export const UI_CONFIG = {
  DEBOUNCE_DELAY: 300,
  TOAST_DURATION: 3000,
  MODAL_TIMEOUT: 5000
};

// Product Categories (if you have predefined ones)
export const PRODUCT_CATEGORIES = [
  'Electronics',
  'Clothing',
  'Food & Beverages',
  'Health & Beauty',
  'Home & Garden',
  'Sports & Outdoors',
  'Books & Media',
  'Toys & Games',
  'Automotive',
  'Office Supplies'
];

// Order Status
export const ORDER_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
};

// Payment Methods
export const PAYMENT_METHODS = {
  CASH: 'cash',
  CARD: 'card',
  MOBILE_MONEY: 'mobile_money',
  BANK_TRANSFER: 'bank_transfer'
};

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  SERVER_ERROR: 'Server error. Please try again later.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  NOT_FOUND: 'The requested item was not found.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  CART_EMPTY: 'Your cart is empty.',
  PRODUCT_OUT_OF_STOCK: 'This product is out of stock.',
  INVALID_QUANTITY: 'Please enter a valid quantity.'
};

// Success Messages
export const SUCCESS_MESSAGES = {
  PRODUCT_ADDED: 'Product added to cart successfully',
  ORDER_PLACED: 'Order placed successfully',
  PRODUCT_UPDATED: 'Product updated successfully',
  SYNC_COMPLETED: 'Data synchronized successfully'
};

export default {
  baseUrl,
  apiTimeout,
  appName,
  version,
  STORAGE_KEYS,
  API_ENDPOINTS,
  PAGINATION,
  INDEXED_DB,
  UI_CONFIG,
  PRODUCT_CATEGORIES,
  ORDER_STATUS,
  PAYMENT_METHODS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
};