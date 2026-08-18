import { createSlice } from '@reduxjs/toolkit';

// Minimal for now — just enough to hold a token so the WS connection can authenticate.
// Register/login screens (next up) will dispatch setAccessToken on success via a future
// authService; refresh-token rotation is separate future work — see docs/specs/auth.md.
const authSlice = createSlice({
  name: 'auth',
  initialState: {
    accessToken: null,
  },
  reducers: {
    setAccessToken(state, action) {
      state.accessToken = action.payload;
    },
    clearAccessToken(state) {
      state.accessToken = null;
    },
  },
});

export const { setAccessToken, clearAccessToken } = authSlice.actions;
export default authSlice.reducer;
