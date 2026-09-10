import { configureStore, createAsyncThunk, createSlice } from '@reduxjs/toolkit';

const request = async (url, options) => {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Request failed.');
  return result;
};

export const fetchStories = createAsyncThunk('stories/fetch', () => request('/api/stories'));
export const createStory = createAsyncThunk('stories/create', (title) => request('/api/stories', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
}));
export const saveChapter = createAsyncThunk('stories/saveChapter', ({ storyId, chapterNumber, title, content }) => request('/api/chapters', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId, chapterNumber, title, content }),
}));
export const updateChapter = createAsyncThunk('stories/updateChapter', ({ id, chapterNumber, title, content }) => request(`/api/chapters/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chapterNumber, title, content }),
}));
export const deleteChapter = createAsyncThunk('stories/deleteChapter', (id) => request(`/api/chapters/${id}`, { method: 'DELETE' }));
export const deleteStory = createAsyncThunk('stories/deleteStory', (id) => request(`/api/stories/${id}`, { method: 'DELETE' }));

const storiesSlice = createSlice({
  name: 'stories',
  initialState: { items: [], status: 'idle', error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchStories.pending, (state) => { state.status = 'loading'; state.error = null; })
      .addCase(fetchStories.fulfilled, (state, action) => { state.status = 'succeeded'; state.items = action.payload; })
      .addCase(fetchStories.rejected, (state, action) => { state.status = 'failed'; state.error = action.error.message; })
      .addMatcher((action) => action.type.startsWith('stories/') && action.type.endsWith('/fulfilled') && action.type !== 'stories/fetch/fulfilled', (state) => { state.status = 'idle'; });
  },
});

export const store = configureStore({ reducer: { stories: storiesSlice.reducer } });