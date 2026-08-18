import { createSlice } from '@reduxjs/toolkit';

const themeSlice = createSlice({
  name: 'theme',
  initialState: {
    mode: null, // null = use system, 'light' | 'dark' = user override
  },
  reducers: {
    setThemeMode(state, action) {
      state.mode = action.payload;
    },
  },
});

export const { setThemeMode } = themeSlice.actions;
export default themeSlice.reducer;
