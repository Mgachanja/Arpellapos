import { createSlice } from '@reduxjs/toolkit';
import { rtkApi } from '../../services/rtkApi';

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
