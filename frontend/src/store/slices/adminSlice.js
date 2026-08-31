import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as adminService from '../../services/adminService';

// Ephemeral state (not persisted) — same rule as scraperSlice/wsSlice. The user list is re-fetched
// on mount every time the Users screen is visited, not cached across app restarts.

export const fetchUsers = createAsyncThunk(
  'admin/fetchUsers',
  async (_, { getState, rejectWithValue }) => {
    try {
      return await adminService.listUsers(getState().auth.accessToken);
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const updateUser = createAsyncThunk(
  'admin/updateUser',
  async ({ id, patch }, { getState, rejectWithValue }) => {
    try {
      return await adminService.updateUser(
        getState().auth.accessToken,
        id,
        patch,
      );
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const removeUser = createAsyncThunk(
  'admin/removeUser',
  async (id, { getState, rejectWithValue }) => {
    try {
      await adminService.deleteUser(getState().auth.accessToken, id);
      return id;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

const adminSlice = createSlice({
  name: 'admin',
  initialState: {
    users: [],
    status: 'idle',
    error: null,
  },
  reducers: {
    clearAdminError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.users = action.payload;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        const index = state.users.findIndex((u) => u.id === action.payload.id);
        if (index !== -1) state.users[index] = action.payload;
      })
      .addCase(updateUser.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(removeUser.fulfilled, (state, action) => {
        state.users = state.users.filter((u) => u.id !== action.payload);
      })
      .addCase(removeUser.rejected, (state, action) => {
        state.error = action.payload;
      });
  },
});

export const { clearAdminError } = adminSlice.actions;
export default adminSlice.reducer;
