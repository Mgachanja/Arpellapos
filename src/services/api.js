// src/services/api.js
import axios from 'axios';
import { baseUrl, apiTimeout, STORAGE_KEYS } from '../app/constants/index';

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
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle common errors
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem(STORAGE_KEYS.USER_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER_DATA);
      window.location.href = '/login';
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
    apiClient.get('/paged-products', { params: { pageNumber, pageSize } }),
  getProductById: (id) => apiClient.get(`/products/${id}`),
  searchProducts: (searchTerm, pageNumber = 1, pageSize = 50) =>
    apiClient.get('/products/search', { 
      params: { q: searchTerm, pageNumber, pageSize } 
    }),
  createProduct: (productData) => apiClient.post('/products', productData),
  updateProduct: (id, productData) => apiClient.put(`/products/${id}`, productData),
  deleteProduct: (id) => apiClient.delete(`/products/${id}`),

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
  getSalesReport: (params) => apiClient.get('/reports/sales', { params })
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
   * Create paginated request
   * @param {Function} apiMethod - API method to call
   * @param {Object} params - Parameters for the API call
   * @returns {Promise} - Promise resolving to paginated data
   */
  getPaginated: async (apiMethod, params = {}) => {
    const { page = 1, limit = 50, ...otherParams } = params;
    return apiMethod({ page, limit, ...otherParams });
  },

  /**
   * Retry API call with exponential backoff
   * @param {Function} apiCall - Function that returns a promise
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} baseDelay - Base delay in milliseconds
   * @returns {Promise} - Promise resolving to API response
   */
  retryApiCall: async (apiCall, maxRetries = 3, baseDelay = 1000) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        // Exponential backoff
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
};

// Export axios instance for custom usage
export { apiClient };

// Export base URL for other services
export { baseUrl };

export default apiService;