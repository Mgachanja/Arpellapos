import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { baseUrl } from '../app/constants';
import { logout } from '../redux/slices/userSlice';

const baseQuery = fetchBaseQuery({
  baseUrl,
  prepareHeaders: (headers, { getState }) => {
    const state = getState();
    const userObj = state?.user?.user;
    const token = userObj?.token || (Array.isArray(userObj) && userObj[0]?.token);
    
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

const baseQueryWithLogout = async (args, api, extraOptions) => {
  let result = await baseQuery(args, api, extraOptions);
  
  if (result.error && result.error.status === 401 && !(typeof args === 'string' && args.includes('login')) && !(args.url && args.url.includes('login'))) {
    api.dispatch(logout());
  }
  
  return result;
};

export const rtkApi = createApi({
  reducerPath: 'rtkApi',
  baseQuery: baseQueryWithLogout,
  tagTypes: ['User', 'Staff', 'Order', 'Product', 'Inventory', 'Category', 'Subcategory', 'Supplier', 'Invoice', 'Restock'],
  endpoints: (build) => ({
    login: build.mutation({
      query: ({ phoneNumber, password }) => ({
        url: '/login?platform=pos',
        method: 'POST',
        body: { userName: phoneNumber, password: password },
      }),
    }),
    sendOtp: build.mutation({
      query: (phoneNumber) => ({
        url: `/send-otp?username=${phoneNumber}`,
        method: 'GET',
      }),
    }),
    resetPassword: build.mutation({
      query: ({ otp, userId, newpassword, confirmPassword }) => ({
        url: `/reset-password?otp=${otp}`,
        method: 'POST',
        body: { userId, newpassword, confirmPassword },
      }),
    }),
    getStaffs: build.query({
      query: () => '/special-users',
      providesTags: ['Staff'],
      transformResponse: (response) => {
        if (Array.isArray(response)) return response;
        if (response && response.data && Array.isArray(response.data)) return response.data;
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
      providesTags: ['Order'],
    }),
    getOrderById: build.query({
      query: (id) => `/order/${id}`,
      providesTags: (result, error, id) => [{ type: 'Order', id }],
    }),
    createDeliveryTracking: build.mutation({
      query: (payload) => ({
        url: '/deliverytracking/',
        method: 'POST',
        body: payload,
      }),
    }),
    getPagedProducts: build.query({
      query: ({ pageNumber, pageSize }) => `/pos-paged-products?pageNumber=${pageNumber}&pageSize=${pageSize}`,
      providesTags: ['Product'],
    }),
    getPagedInventories: build.query({
      query: ({ pageNumber, pageSize }) => `/inventories?pageNumber=${pageNumber}&pageSize=${pageSize}`,
      providesTags: ['Inventory'],
    }),

    // Categories
    getCategories: build.query({
      query: () => '/categories',
      providesTags: ['Category'],
    }),
    createCategory: build.mutation({
      query: (data) => ({ url: '/categories', method: 'POST', body: data }),
      invalidatesTags: ['Category'],
    }),
    updateCategory: build.mutation({
      query: ({ id, ...data }) => ({ url: `/categories/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Category'],
    }),
    deleteCategory: build.mutation({
      query: (id) => ({ url: `/categories/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Category'],
    }),

    // Subcategories
    getSubcategories: build.query({
      query: () => '/subcategories',
      providesTags: ['Subcategory'],
    }),
    createSubcategory: build.mutation({
      query: (data) => ({ url: '/subcategories', method: 'POST', body: data }),
      invalidatesTags: ['Subcategory'],
    }),
    updateSubcategory: build.mutation({
      query: ({ id, ...data }) => ({ url: `/subcategories/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Subcategory'],
    }),
    deleteSubcategory: build.mutation({
      query: (id) => ({ url: `/subcategories/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Subcategory'],
    }),

    // Suppliers
    getSuppliers: build.query({
      query: () => '/suppliers',
      providesTags: ['Supplier'],
    }),
    createSupplier: build.mutation({
      query: (data) => ({ url: '/suppliers', method: 'POST', body: data }),
      invalidatesTags: ['Supplier'],
    }),
    updateSupplier: build.mutation({
      query: ({ id, ...data }) => ({ url: `/suppliers/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Supplier'],
    }),
    deleteSupplier: build.mutation({
      query: (id) => ({ url: `/suppliers/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Supplier'],
    }),

    // Inventory CRUD
    createInventory: build.mutation({
      query: (data) => ({ url: '/inventory', method: 'POST', body: data }),
      invalidatesTags: ['Inventory'],
    }),
    updateInventory: build.mutation({
      query: ({ id, ...data }) => ({ url: `/inventory/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Inventory'],
    }),
    deleteInventory: build.mutation({
      query: (id) => ({ url: `/inventories/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Inventory'],
    }),
    uploadInventoryExcel: build.mutation({
      query: (formData) => ({ url: '/inventories/upload-excel', method: 'POST', body: formData }),
      invalidatesTags: ['Inventory'],
    }),

    // Products CRUD
    getProductById: build.query({
      query: (id) => `/products/${id}`,
      providesTags: (result, error, id) => [{ type: 'Product', id }],
    }),
    createProduct: build.mutation({
      query: (data) => ({ url: '/product', method: 'POST', body: data }),
      invalidatesTags: ['Product'],
    }),
    updateProduct: build.mutation({
      query: ({ id, ...data }) => ({ url: `/product/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Product'],
    }),
    deleteProduct: build.mutation({
      query: (id) => ({ url: `/products/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Product'],
    }),
    uploadProductImage: build.mutation({
      query: (formData) => ({ url: '/products/upload-image', method: 'POST', body: formData }),
    }),
    uploadProductExcel: build.mutation({
      query: (formData) => ({ url: '/products/upload-excel', method: 'POST', body: formData }),
      invalidatesTags: ['Product'],
    }),

    // Invoices
    getInvoices: build.query({
      query: () => '/invoices',
      providesTags: ['Invoice'],
    }),
    getPagedInvoices: build.query({
      query: ({ pageNumber, pageSize }) => `/invoices?pageNumber=${pageNumber}&pageSize=${pageSize}`,
      providesTags: ['Invoice'],
    }),
    createInvoice: build.mutation({
      query: (data) => ({ url: '/invoice', method: 'POST', body: data }),
      invalidatesTags: ['Invoice'],
    }),
    updateInvoice: build.mutation({
      query: ({ id, ...data }) => ({ url: `/invoices/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['Invoice'],
    }),
    deleteInvoice: build.mutation({
      query: (id) => ({ url: `/invoices/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Invoice'],
    }),

    // Restock Log
    getRestockLog: build.query({
      query: () => '/restock-log',
      providesTags: ['Restock'],
    }),
    createRestockLog: build.mutation({
      query: (data) => ({ url: '/restock-log', method: 'POST', body: data }),
      invalidatesTags: ['Restock', 'Inventory'],
    }),

    // Goods Info
    createGoodsInfo: build.mutation({
      query: (data) => ({ url: '/goods-info', method: 'POST', body: data }),
    }),
    updateGoodsInfo: build.mutation({
      query: ({ id, ...data }) => ({ url: `/goods-info/${id}`, method: 'PUT', body: data }),
    }),
  }),
});

export const {
  useLoginMutation,
  useSendOtpMutation,
  useResetPasswordMutation,
  useGetStaffsQuery,
  useLazyGetStaffsQuery,
  useGetUsersQuery,
  useGetPendingOrdersQuery,
  useLazyGetPendingOrdersQuery,
  useGetOrderByIdQuery,
  useLazyGetOrderByIdQuery,
  useCreateDeliveryTrackingMutation,
  useGetPagedProductsQuery,
  useLazyGetPagedProductsQuery,
  useGetPagedInventoriesQuery,
  useLazyGetPagedInventoriesQuery,
  // Categories
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  // Subcategories
  useGetSubcategoriesQuery,
  useCreateSubcategoryMutation,
  useUpdateSubcategoryMutation,
  useDeleteSubcategoryMutation,
  // Suppliers
  useGetSuppliersQuery,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useDeleteSupplierMutation,
  // Inventory CRUD
  useCreateInventoryMutation,
  useUpdateInventoryMutation,
  useDeleteInventoryMutation,
  useUploadInventoryExcelMutation,
  // Product CRUD
  useGetProductByIdQuery,
  useLazyGetProductByIdQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useUploadProductImageMutation,
  useUploadProductExcelMutation,
  // Invoices
  useGetInvoicesQuery,
  useGetPagedInvoicesQuery,
  useLazyGetPagedInvoicesQuery,
  useCreateInvoiceMutation,
  useUpdateInvoiceMutation,
  useDeleteInvoiceMutation,
  // Restock
  useGetRestockLogQuery,
  useCreateRestockLogMutation,
  // Goods Info
  useCreateGoodsInfoMutation,
  useUpdateGoodsInfoMutation,
} = rtkApi;
