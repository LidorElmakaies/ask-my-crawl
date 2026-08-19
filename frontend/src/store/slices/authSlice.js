import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as authService from '../../services/authService';

// register/login both return { user, access_token, refresh_token } per docs/specs/api-contracts.md.
// refreshToken is stored now (not used yet) so a future /auth/refresh thunk has something to send —
// see docs/specs/auth.md's token lifecycle.
export const registerUser = createAsyncThunk(
  'auth/register',
  async (payload, { rejectWithValue }) => {
    try {
      return await authService.register(payload);
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const loginUser = createAsyncThunk(
  'auth/login',
  async (payload, { rejectWithValue }) => {
    try {
      return await authService.login(payload);
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    accessToken: null,
    refreshToken: null,
    // status/error are ephemeral (form-submission state) and blacklisted from persistence in
    // store/index.js — same "don't persist transient state" rule as scraperSlice/wsSlice.
    status: 'idle',
    error: null,
  },
  reducers: {
    clearAuth(state) {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.status = 'idle';
      state.error = null;
    },
    clearAuthError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    const handlePending = (state) => {
      state.status = 'loading';
      state.error = null;
    };
    const handleFulfilled = (state, action) => {
      state.status = 'succeeded';
      state.user = action.payload.user;
      state.accessToken = action.payload.access_token;
      state.refreshToken = action.payload.refresh_token;
    };
    const handleRejected = (state, action) => {
      state.status = 'failed';
      state.error = action.payload;
    };

    builder
      .addCase(registerUser.pending, handlePending)
      .addCase(registerUser.fulfilled, handleFulfilled)
      .addCase(registerUser.rejected, handleRejected)
      .addCase(loginUser.pending, handlePending)
      .addCase(loginUser.fulfilled, handleFulfilled)
      .addCase(loginUser.rejected, handleRejected);
  },
});

export const { clearAuth, clearAuthError } = authSlice.actions;
export default authSlice.reducer;
