// src/redux/store.js
import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { combineReducers } from '@reduxjs/toolkit';

// Import your reducers
import productSlice from '../slices/productSlice';
import userSlice from '../slices/userSlice';
// Persist configuration
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['products'], // Only persist products slice (cart will be persisted)
  blacklist: [] // Don't persist these slices
};

// Cart persist config (separate config for cart to handle complex objects)
const cartPersistConfig = {
  key: 'cart',
  storage,
  whitelist: ['cart'] // Only persist the cart array from products slice
};

// Root reducer combining all slices
const rootReducer = combineReducers({
  user:userSlice,
  products: persistReducer(cartPersistConfig, productSlice),
  // Add other reducers here as you create them
  // auth: authReducer,
  // orders: ordersReducer,
  // settings: settingsReducer,
});

// Create persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Configure store
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types from redux-persist
        ignoredActions: [
          'persist/PERSIST',
          'persist/REHYDRATE',
          'persist/PAUSE',
          'persist/PURGE',
          'persist/REGISTER',
          'persist/FLUSH',
        ],
        // Ignore these field paths in all actions
        ignoredActionsPaths: ['meta.arg', 'payload.timestamp'],
        // Ignore these paths in the state
        ignoredPaths: ['_persist'],
      },
    }),
  devTools: process.env.NODE_ENV !== 'production',
});

// Create persistor
export const persistor = persistStore(store);

// Export types for TypeScript (if you're using TypeScript)
export const  RootState = store.getState;
export const AppDispatch =  store.dispatch

// Export store as default
export default store;