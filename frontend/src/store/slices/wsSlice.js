import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as socketService from '../../services/socketService';
import { jobCompleted, jobCreated } from './jobsSlice';

// All frontend events go through thunks, never a custom hook holding connection state — a
// component only ever dispatches connectWebSocket()/disconnectWebSocket() and reads
// state.ws via useSelector. The actual Socket.IO client lives in socketService; this thunk's
// only job is translating its callbacks into dispatched actions.
export const connectWebSocket = createAsyncThunk(
  'ws/connect',
  async (_, { dispatch, getState, rejectWithValue }) => {
    const { accessToken } = getState().auth;
    if (!accessToken) {
      return rejectWithValue('No access token — cannot open the connection.');
    }

    return new Promise((resolve, reject) => {
      // Only the very first connect/connect_error settles this thunk's promise — Socket.IO's
      // own reconnection (on by default) handles every attempt after that; wsConnected/
      // wsDisconnected below keep Redux state in sync with those automatic retries without
      // the caller ever needing to dispatch connectWebSocket() again.
      let settled = false;

      socketService.connect(accessToken, {
        onConnect: () => {
          dispatch(wsConnected());
          if (!settled) {
            settled = true;
            resolve();
          }
        },
        onDisconnect: (reason) => dispatch(wsDisconnected(reason)),
        onConnectError: (err) => {
          dispatch(wsConnectError(err.message));
          if (!settled) {
            settled = true;
            reject(err);
          }
        },
        onMessage: (payload) => {
          dispatch(wsMessageReceived(payload));
          if (payload?.type === 'job.created') {
            dispatch(jobCreated(payload));
          } else if (payload?.type === 'job.completed') {
            dispatch(jobCompleted(payload));
          }
        },
      });
    });
  },
);


export const disconnectWebSocket = createAsyncThunk('ws/disconnect', async () => {
  socketService.disconnect();
});

const wsSlice = createSlice({
  name: 'ws',
  initialState: {
    status: 'idle', // idle | connecting | connected | disconnected | error
    lastMessage: null,
    error: null,
  },
  reducers: {
    wsConnected(state) {
      state.status = 'connected';
      state.error = null;
    },
    wsDisconnected(state, action) {
      // A manual disconnectWebSocket() call reports 'io client disconnect' — anything else
      // means Socket.IO is auto-retrying in the background, so reflect that as 'connecting'
      // rather than a dead-end 'disconnected'.
      state.status = action.payload === 'io client disconnect' ? 'idle' : 'connecting';
    },
    wsConnectError(state, action) {
      state.status = 'error';
      state.error = action.payload;
    },
    wsMessageReceived(state, action) {
      state.lastMessage = action.payload;
      // Future work: once job.completed/job.status have a home (jobsSlice), branch on
      // action.payload.type here and update the relevant slice instead of just storing the
      // raw last message.
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(connectWebSocket.pending, (state) => {
        state.status = 'connecting';
        state.error = null;
      })
      .addCase(connectWebSocket.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload || action.error.message;
      })
      .addCase(disconnectWebSocket.fulfilled, (state) => {
        state.status = 'idle';
      });
  },
});

const { wsConnected, wsDisconnected, wsConnectError, wsMessageReceived } = wsSlice.actions;
export default wsSlice.reducer;
