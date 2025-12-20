// src/redux/slices/staffSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { baseUrl } from "../../app/constants";

// Async thunk to fetch staff members
export const fetchStaffMembers = createAsyncThunk(
  "staff/fetchStaff",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${baseUrl}/special-users`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message || "Failed to fetch staff");
    }
  }
);

const staffSlice = createSlice({
  name: "staff",
  initialState: {
    staffList: [],
    isLoading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchStaffMembers.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchStaffMembers.fulfilled, (state, action) => {
        state.isLoading = false;
        // backend may return array OR { data: [...] } or object; normalize to array
        if (Array.isArray(action.payload)) {
          state.staffList = action.payload;
        } else if (Array.isArray(action.payload?.data)) {
          state.staffList = action.payload.data;
        } else if (Array.isArray(action.payload?.results)) {
          state.staffList = action.payload.results;
        } else {
          // try to extract array values from any object
          const possible = Object.values(action.payload || {}).find((v) => Array.isArray(v));
          state.staffList = Array.isArray(possible) ? possible : [];
        }
      })
      .addCase(fetchStaffMembers.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || action.error?.message || "Failed to fetch staff";
      });
  },
});

// defensive selector
export const selectStaffCount = (state) => {
  const list = state?.staff?.staffList ?? [];
  if (!Array.isArray(list)) return 0;
  return list.filter((staff) => staff.isActive).length;
};

export default staffSlice.reducer;
