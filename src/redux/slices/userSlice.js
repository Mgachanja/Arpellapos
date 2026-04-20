import { createSlice } from '@reduxjs/toolkit';
import { rtkApi } from '../../services/rtkApi';
import { STORAGE_KEYS } from '../../app/constants/index';

const initialState = {
  user: null,
  loading: false,
  error: null
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser(state, action) {
      state.user = action.payload;
      state.error = null;
    },
    logout(state) {
      state.user = null;
      state.error = null;
      state.loading = false;
      // Mirror to localStorage for legacy Axios services
      localStorage.removeItem(STORAGE_KEYS.USER_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER_DATA);
    },
    clearError(state) {
      state.error = null;
    }
  },
  extraReducers: builder => {
    builder
      .addMatcher(rtkApi.endpoints.login.matchPending, state => {
        state.loading = true;
        state.error = null;
      })
      .addMatcher(rtkApi.endpoints.login.matchFulfilled, (state, action) => {
        state.user = action.payload;
        state.loading = false;
        
        // Mirror to localStorage for legacy Axios services
        if (action.payload?.token) {
          localStorage.setItem(STORAGE_KEYS.USER_TOKEN, action.payload.token);
          localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(action.payload));
        } else if (Array.isArray(action.payload) && action.payload[0]?.token) {
          localStorage.setItem(STORAGE_KEYS.USER_TOKEN, action.payload[0].token);
          localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(action.payload[0]));
        }
      })
      .addMatcher(rtkApi.endpoints.login.matchRejected, (state, action) => {
        state.loading = false;
        state.error = action.error?.message || 'Login failed';
      });
  }
});

export const { setUser, logout, clearError } = userSlice.actions;

// Selectors
export const selectUser = state => state.user.user;
// src/redux/slices/userSlice.js (ensure this exists / is exported)
export const selectUserName = (state) => {
  const u = state.user?.user; // defensive
  if (!u) return null;
  const first = (u.firstName || '').toString().trim();
  const last = (u.lastName || '').toString().trim();
  const name = [first, last].filter(Boolean).join(' ').trim();
  const fallback = u.userName || u.phoneNumber || null;
  const raw = name || fallback;
  if (!raw) return null;
  return raw.split(' ')
    .map(part => part ? (part.charAt(0).toUpperCase() + part.slice(1)) : '')
    .join(' ')
    .trim();
};

export const selectUserRole = state => state.user.user?.role || null;
export default userSlice.reducer;
