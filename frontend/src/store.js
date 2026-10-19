import { configureStore, createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { requestJson } from './shared/api';

export const fetchStories = createAsyncThunk('stories/fetch', () => requestJson('/api/stories'));
export const createStory = createAsyncThunk('stories/create', (title) => requestJson('/api/stories', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
}));
export const updateStory = createAsyncThunk('stories/updateStory', ({ id, title }) => requestJson(`/api/stories/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
}));
export const saveChapter = createAsyncThunk('stories/saveChapter', ({ storyId, chapterNumber, title, content }) => requestJson('/api/chapters', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId, chapterNumber, title, content }),
}));
export const updateChapter = createAsyncThunk('stories/updateChapter', ({ id, chapterNumber, title, content }) => requestJson(`/api/chapters/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chapterNumber, title, content }),
}));
export const deleteChapter = createAsyncThunk('stories/deleteChapter', (id) => requestJson(`/api/chapters/${id}`, { method: 'DELETE' }));
export const deleteStory = createAsyncThunk('stories/deleteStory', (id) => requestJson(`/api/stories/${id}`, { method: 'DELETE' }));

const storiesSlice = createSlice({
  name: 'stories',
  initialState: { items: [], status: 'idle', error: null },
  reducers: {
    receiveStories(state, action) {
      state.items = action.payload;
      state.status = 'succeeded';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchStories.pending, (state) => { state.status = 'loading'; state.error = null; })
      .addCase(fetchStories.fulfilled, (state, action) => { state.status = 'succeeded'; state.items = action.payload; })
      .addCase(fetchStories.rejected, (state, action) => { state.status = 'failed'; state.error = action.error.message; })
    .addCase(updateStory.fulfilled, (state, action) => {
      const story = state.items.find((item) => item.id === action.payload.id);
      if (story) story.title = action.payload.title;
    })
    .addMatcher((action) => action.type.startsWith('stories/') && action.type.endsWith('/fulfilled') && action.type !== 'stories/fetch/fulfilled', (state) => { state.status = 'idle'; });
  },
});

export const { receiveStories } = storiesSlice.actions;
export const store = configureStore({ reducer: { stories: storiesSlice.reducer } });