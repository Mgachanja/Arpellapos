// src/services/api.js
import axios from 'axios';
import { baseUrl, apiTimeout, STORAGE_KEYS } from '../app/constants/index';
import { store } from '../redux/store/index';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: baseUrl,
  timeout: apiTimeout,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(STORAGE_KEYS.USER_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear legacy storage
      localStorage.removeItem(STORAGE_KEYS.USER_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER_DATA);
      
      // Dispatch logout to update app state and trigger safe redirect via HashRouter
      try {
        store.dispatch({ type: 'user/logout' });
      } catch (err) {
        console.error('Failed to dispatch logout:', err);
      }
    }
    return Promise.reject(error);
  }
);

// API service functions
export const apiService = {
  // Generic HTTP methods
  get: (url, config) => apiClient.get(url, config),
  post: (url, data, config) => apiClient.post(url, data, config),
  put: (url, data, config) => apiClient.put(url, data, config),
  patch: (url, data, config) => apiClient.patch(url, data, config),
  delete: (url, config) => apiClient.delete(url, config),

  // Products
  getProducts: (params = {}) => apiClient.get('/products', { params }),
  getPagedProducts: (pageNumber = 1, pageSize = 200) =>
    apiClient.get('/pos-paged-products', { params: { pageNumber, pageSize } }),
  getProductById: (id) => apiClient.get(`/products/${id}`),
  searchProducts: (searchTerm, pageNumber = 1, pageSize = 50) =>
    apiClient.get('/products/search', {
      params: { q: searchTerm, pageNumber, pageSize }
    }),
  createProduct: (productData) => apiClient.post('/products', productData),
  updateProduct: (id, productData) => apiClient.put(`/products/${id}`, productData),
  deleteProduct: (id) => apiClient.delete(`/products/${id}`),

  // Inventories (new)
  // - endpoint returns paginated inventories similar to products
  getInventories: (params = {}) => apiClient.get('/inventories', { params }),
  getPagedInventories: (pageNumber = 1, pageSize = 200) =>
    apiClient.get('/paged-inventories', { params: { pageNumber, pageSize } }),
  getInventoryById: (inventoryId) => apiClient.get(`/inventories/${inventoryId}`),
  createInventory: (payload) => apiClient.post('/inventories', payload),
  updateInventory: (id, payload) => apiClient.put(`/inventories/${id}`, payload),
  deleteInventory: (id) => apiClient.delete(`/inventories/${id}`),

  // Orders
  getOrders: (params = {}) => apiClient.get('/orders', { params }),
  getOrderById: (id) => apiClient.get(`/orders/${id}`),
  createOrder: (orderData) => apiClient.post('/order', orderData),
  updateOrder: (id, orderData) => apiClient.put(`/orders/${id}`, orderData),
  cancelOrder: (id) => apiClient.patch(`/orders/${id}/cancel`),

  // Cart operations
  validateCart: (cartData) => apiClient.post('/cart/validate', cartData),
  addToCart: (cartItem) => apiClient.post('/cart/add', cartItem),

  // Authentication
  login: (credentials) => apiClient.post('/auth/login', credentials),
  logout: () => apiClient.post('/auth/logout'),
  refreshToken: () => apiClient.post('/auth/refresh'),

  // Categories
  getCategories: () => apiClient.get('/categories'),

  // Stats/Analytics
  getDashboardStats: () => apiClient.get('/stats/dashboard'),
  getSalesReport: (params) => apiClient.get('/reports/sales', { params }),

  // SMS
  getSmsTemplates: () => apiClient.get('/sms-templates'),
  sendSmsTemplate: (data) => apiClient.post('/sms-template', data),
  sendMessage: (templateType) => apiClient.post('/send-message', null, { params: { templateType } }),
  deleteSmsTemplate: (templateType) => apiClient.delete(`/sms-template/${templateType}`)
};

// Utility functions for common API patterns
export const apiUtils = {
  /**
   * Handle API response and extract data
   * @param {Promise} apiCall - The API call promise
   * @returns {Promise} - Promise resolving to response data
   */
  handleResponse: async (apiCall) => {
    try {
      const response = await apiCall;
      return response.data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  /**
   * Generic paginated fetch helper used by callers
   * apiMethod should be a function that accepts (pageNumber, pageSize, otherParams)
   */
  fetchAllPages: async (apiMethod, { pageSize = 200, maxPages = 50, onPage } = {}) => {
    let page = 1;
    const all = [];
    while (page <= maxPages) {
      const res = await apiMethod(page, pageSize);
      const data = res?.data ?? res;
      // normalize to array
      const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : (Array.isArray(data.data) ? data.data : []));
      if (!items || items.length === 0) break;
      all.push(...items);
      if (typeof onPage === 'function') onPage(items, page);
      if (items.length < pageSize) break;
      page += 1;
    }
    return all;
  }
};

// Export axios instance for custom usage
export { apiClient };

// Export base URL for other services
export { baseUrl };

export default apiService;