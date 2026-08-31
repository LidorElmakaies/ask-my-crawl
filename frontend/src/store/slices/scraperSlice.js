import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as scraperService from '../../services/scraperService';

export const submitScrapeRequest = createAsyncThunk(
  'scraper/submit',
  async ({ url, query }, { rejectWithValue }) => {
    try {
      return await scraperService.submitScrapeRequest({ url, query });
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
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
