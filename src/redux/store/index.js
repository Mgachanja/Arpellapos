// src/redux/store.js
import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { combineReducers } from '@reduxjs/toolkit';

// Import your reducers
import productSlice from '../slices/productSlice';
import userSlice from '../slices/userSlice';
import { rtkApi } from '../../services/rtkApi';
// Persist configuration
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['products', 'user'], // Only persist products slice and user slice
  blacklist: [rtkApi.reducerPath] // Don't persist these slices
};

// Root reducer combining all slices
const rootReducer = combineReducers({
  user: userSlice,
  products: productSlice,
  [rtkApi.reducerPath]: rtkApi.reducer,
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
    }).concat(rtkApi.middleware),
  devTools: process.env.NODE_ENV !== 'production',
});

// Create persistor
export const persistor = persistStore(store);

// Export types for TypeScript (if you're using TypeScript)
export const  RootState = store.getState;
export const AppDispatch =  store.dispatch

// Export store as default
export default store;