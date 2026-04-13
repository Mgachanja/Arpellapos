import { createSlice } from '@reduxjs/toolkit';
import { rtkApi } from '../../services/rtkApi';

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
      .addMatcher(rtkApi.endpoints.getStaffs.matchPending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addMatcher(rtkApi.endpoints.getStaffs.matchFulfilled, (state, action) => {
        state.isLoading = false;
        state.staffList = action.payload; // Already normalized by transformResponse in rtkApi
      })
      .addMatcher(rtkApi.endpoints.getStaffs.matchRejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error?.message || "Failed to fetch staff";
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
