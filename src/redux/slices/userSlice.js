// src/redux/slices/userSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { baseUrl } from '../../app/constants';
/**
 * Thunk: loginUser
 * - Calls POST /login with { phoneNumber, password }
 * - Rejects if backend returns user.role === 'Customer'
 * - Returns the user object on success
 */
export const loginUser = createAsyncThunk(
  'user/loginUser',
  async ({ phoneNumber, password }, { rejectWithValue }) => {
    try {
      const { data } = await axios.post(`${baseUrl}/login`, { 
        userName: phoneNumber, 
        passwordHash : password
      },
        {
        headers: {
          'Content-Type': 'application/json',
        },
      }
      );
      // backend returns user object
      if (!data) return rejectWithValue('Invalid server response');

      // Deny "Customer" role explicitly
      if (String(data.role).toLowerCase() === 'customer') {
        return rejectWithValue('Access denied for role: Customer');
      }

      return data;
    } catch (err) {
      // normalize error message
      const msg = err?.response?.data?.message || err.message || 'Login failed';
      return rejectWithValue(msg);
    }
  }
);

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
      .addCase(loginUser.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.loading = false;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Login failed';
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
