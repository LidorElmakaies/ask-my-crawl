import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { URLS } from '../../config/urls';

export const submitScrapeRequest = createAsyncThunk(
  'scraper/submit',
  async (url, { rejectWithValue }) => {
    try {
      const response = await fetch(URLS.gateway.scrape, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

const scraperSlice = createSlice({
  name: 'scraper',
  initialState: {
    status: 'idle',
    result: null,
    error: null,
  },
  reducers: {
    clearScraper(state) {
      state.status = 'idle';
      state.result = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(submitScrapeRequest.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(submitScrapeRequest.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.result = action.payload;
      })
      .addCase(submitScrapeRequest.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      });
  },
});

export const { clearScraper } = scraperSlice.actions;
export default scraperSlice.reducer;
