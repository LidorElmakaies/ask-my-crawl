import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as jobsService from '../../services/jobsService';

// Ephemeral state (not persisted) — the job list is re-fetched from GET /jobs
// on mount every time the History screen is visited, and updated dynamically via WS events.

export const fetchJobs = createAsyncThunk(
  'jobs/fetchJobs',
  async (_, { getState, rejectWithValue }) => {
    try {
      const { accessToken } = getState().auth;
      if (!accessToken) {
        return rejectWithValue('No access token — cannot fetch jobs.');
      }
      return await jobsService.fetchJobs(accessToken);
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const submitJobRequest = createAsyncThunk(
  'jobs/submitJobRequest',
  async ({ url, query }, { getState, rejectWithValue }) => {
    try {
      const { accessToken } = getState().auth;
      if (!accessToken) {
        return rejectWithValue('No access token — cannot submit job.');
      }
      return await jobsService.createJob(accessToken, { url, query });
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

const jobsSlice = createSlice({
  name: 'jobs',
  initialState: {
    items: [],
    status: 'idle', // idle | loading | succeeded | failed
    error: null,
    submitStatus: 'idle', // idle | loading | succeeded | failed
    submitError: null,
  },
  reducers: {
    jobCreated(state, action) {
      const payload = action.payload;
      if (!payload?.job_id) return;

      const exists = state.items.some((job) => job.id === payload.job_id);
      if (!exists) {
        state.items.unshift({
          id: payload.job_id,
          user_id: payload.user_id,
          url: payload.url,
          query: payload.query,
          result: null,
        });
      }
    },
    jobCompleted(state, action) {
      const payload = action.payload;
      if (!payload?.job_id) return;

      const job = state.items.find((j) => j.id === payload.job_id);
      if (job) {
        job.result = payload.result;
      }
    },
    clearJobsError(state) {
      state.error = null;
      state.submitError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchJobs.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchJobs.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(fetchJobs.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || action.error.message;
      })
      .addCase(submitJobRequest.pending, (state) => {
        state.submitStatus = 'loading';
        state.submitError = null;
      })
      .addCase(submitJobRequest.fulfilled, (state) => {
        state.submitStatus = 'succeeded';
      })
      .addCase(submitJobRequest.rejected, (state, action) => {
        state.submitStatus = 'failed';
        state.submitError = action.payload || action.error.message;
      });
  },
});

export const { jobCreated, jobCompleted, clearJobsError } = jobsSlice.actions;
export default jobsSlice.reducer;
