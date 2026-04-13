import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { baseUrl } from '../app/constants';
import { logout } from '../redux/slices/userSlice';

const baseQuery = fetchBaseQuery({
  baseUrl,
  prepareHeaders: (headers, { getState }) => {
    const token = getState().user?.user?.token;
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

const baseQueryWithLogout = async (args, api, extraOptions) => {
  const result = await baseQuery(args, api, extraOptions);

  const url = typeof args === 'string' ? args : args.url;
  // Let component handle 401 on login
  if (result?.error?.status === 401 && !url?.includes('login')) {
    api.dispatch(logout());
  }

  return result;
};

export const rtkApi = createApi({
  reducerPath: 'rtkApi',
  baseQuery: baseQueryWithLogout,
  tagTypes: ['Products', 'Inventories', 'Orders', 'User', 'Categories', 'Stats'],
  endpoints: (build) => ({
    // Auth Auth
    login: build.mutation({
      query: (credentials) => ({
        url: '/login?platform=pos', // API seems to be POST /login based on userSlice.js
        method: 'POST',
        body: {
          userName: credentials.phoneNumber,
          passwordHash: credentials.password
        },
      }),
      transformResponse: (response) => {
        if (!response?.token || !response?.user) throw new Error('Invalid server response');
        const { token, user } = response;
        if (String(user.role).toLowerCase() === 'customer') {
          throw new Error('Access denied for role: Customer');
        }
        return { token, ...user };
      }
    }),
    logoutUser: build.mutation({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
    }),
    refreshToken: build.mutation({
      query: () => ({
        url: '/auth/refresh',
        method: 'POST',
      }),
    }),

    // Products
    getProducts: build.query({
      query: (params) => ({ url: '/products', params }),
      providesTags: (result) =>
        result ? [{ type: 'Products', id: 'LIST' }] : ['Products'],
    }),
    getPagedProducts: build.query({
      query: ({ pageNumber = 1, pageSize = 200 }) => ({
        url: '/pos-paged-products',
        params: { pageNumber, pageSize },
      }),
      providesTags: ['Products'],
    }),
    getProductById: build.query({
      query: (id) => `/products/${id}`,
      providesTags: (result, error, id) => [{ type: 'Products', id }],
    }),
    searchProducts: build.query({
      query: ({ searchTerm, pageNumber = 1, pageSize = 50 }) => ({
        url: '/products/search',
        params: { q: searchTerm, pageNumber, pageSize },
      }),
      providesTags: ['Products'],
    }),
    createProduct: build.mutation({
      query: (productData) => ({
        url: '/products',
        method: 'POST',
        body: productData,
      }),
      invalidatesTags: [{ type: 'Products', id: 'LIST' }],
    }),
    updateProduct: build.mutation({
      query: ({ id, ...productData }) => ({
        url: `/products/${id}`,
        method: 'PUT',
        body: productData,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Products', id }, { type: 'Products', id: 'LIST' }],
    }),
    deleteProduct: build.mutation({
      query: (id) => ({
        url: `/products/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Products', id: 'LIST' }],
    }),

    // Inventories
    getInventories: build.query({
      query: (params) => ({ url: '/inventories', params }),
      providesTags: (result) =>
        result ? [{ type: 'Inventories', id: 'LIST' }] : ['Inventories'],
    }),
    getPagedInventories: build.query({
      query: ({ pageNumber = 1, pageSize = 200 }) => ({
        url: '/paged-inventories',
        params: { pageNumber, pageSize },
      }),
      providesTags: ['Inventories'],
      lazy: true,
    }),
    getInventoryById: build.query({
      query: (id) => `/inventories/${id}`,
      providesTags: (result, error, id) => [{ type: 'Inventories', id }],
    }),
    createInventory: build.mutation({
      query: (payload) => ({
        url: '/inventories',
        method: 'POST',
        body: payload,
      }),
      invalidatesTags: [{ type: 'Inventories', id: 'LIST' }],
    }),
    updateInventory: build.mutation({
      query: ({ id, ...payload }) => ({
        url: `/inventories/${id}`,
        method: 'PUT',
        body: payload,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Inventories', id }, { type: 'Inventories', id: 'LIST' }],
    }),
    deleteInventory: build.mutation({
      query: (id) => ({
        url: `/inventories/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Inventories', id: 'LIST' }],
    }),

    // Orders
    getOrders: build.query({
      query: (params) => ({ url: '/orders', params }),
      providesTags: (result) =>
        result ? [{ type: 'Orders', id: 'LIST' }] : ['Orders'],
    }),
    getOrderById: build.query({
      query: (id) => `/orders/${id}`,
      providesTags: (result, error, id) => [{ type: 'Orders', id }],
      lazy: true,
    }),
    createOrder: build.mutation({
      query: (orderData) => ({
        url: '/order', // Note from api.js: /order
        method: 'POST',
        body: orderData,
      }),
      invalidatesTags: [{ type: 'Orders', id: 'LIST' }],
    }),
    updateOrder: build.mutation({
      query: ({ id, ...orderData }) => ({
        url: `/orders/${id}`,
        method: 'PUT',
        body: orderData,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Orders', id }, { type: 'Orders', id: 'LIST' }],
    }),
    cancelOrder: build.mutation({
      query: (id) => ({
        url: `/orders/${id}/cancel`,
        method: 'PATCH',
      }),
      invalidatesTags: (result, error, id) => [{ type: 'Orders', id }, { type: 'Orders', id: 'LIST' }],
    }),

    // Cart
    validateCart: build.mutation({
      query: (cartData) => ({
        url: '/cart/validate',
        method: 'POST',
        body: cartData,
      }),
    }),
    addToCart: build.mutation({
      query: (cartItem) => ({
        url: '/cart/add',
        method: 'POST',
        body: cartItem,
      }),
    }),

    // Categories
    getCategories: build.query({
      query: () => '/categories',
      providesTags: ['Categories'],
    }),

    // Stats
    getDashboardStats: build.query({
      query: () => '/stats/dashboard',
      providesTags: ['Stats'],
    }),
    getSalesReport: build.query({
      query: (params) => ({
        url: '/reports/sales',
        params,
      }),
    }),
    // Staff logic based on earlier searches
    getStaffs: build.query({
      query: (params) => ({ url: '/special-users', params }),
      providesTags: ['Staff'],
      transformResponse: (response) => {
        if (Array.isArray(response)) return response;
        if (Array.isArray(response?.data)) return response.data;
        if (Array.isArray(response?.results)) return response.results;
        const possible = Object.values(response || {}).find((v) => Array.isArray(v));
        return Array.isArray(possible) ? possible : [];
      }
    }),
    getUsers: build.query({
      query: () => '/users',
      providesTags: ['User'],
    }),
    getPendingOrders: build.query({
      query: () => '/pending-orders',
      providesTags: ['Orders'],
    }),
    createDeliveryTracking: build.mutation({
      query: (payload) => ({
        url: '/deliverytracking/',
        method: 'POST',
        body: payload,
      }),
    })
  }),
});

export const {
  useLoginMutation,
  useLogoutUserMutation,
  useRefreshTokenMutation,
  
  useGetProductsQuery,
  useLazyGetProductsQuery,
  useGetPagedProductsQuery,
  useLazyGetPagedProductsQuery,
  useGetProductByIdQuery,
  useSearchProductsQuery,
  useLazySearchProductsQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,

  useGetInventoriesQuery,
  useGetPagedInventoriesQuery,
  useLazyGetPagedInventoriesQuery,
  useGetInventoryByIdQuery,
  useCreateInventoryMutation,
  useUpdateInventoryMutation,
  useDeleteInventoryMutation,

  useGetOrdersQuery,
  useLazyGetOrdersQuery,
  useGetOrderByIdQuery,
  useLazyGetOrderByIdQuery,
  useCreateOrderMutation,
  useUpdateOrderMutation,
  useCancelOrderMutation,

  useValidateCartMutation,
  useAddToCartMutation,

  useGetCategoriesQuery,
  useGetDashboardStatsQuery,
  useGetSalesReportQuery,

  useGetStaffsQuery,
  useLazyGetStaffsQuery,

  useGetUsersQuery,
  useGetPendingOrdersQuery,
  useLazyGetPendingOrdersQuery,
  useCreateDeliveryTrackingMutation
} = rtkApi;
