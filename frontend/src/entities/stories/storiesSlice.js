import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { storiesApi } from "../../api/stories";
import { chaptersApi } from "../../api/chapters";

export const fetchStories = createAsyncThunk("stories/fetch", () => storiesApi.list());
export const createStory = createAsyncThunk("stories/create", (title) => storiesApi.create(title));
export const updateStory = createAsyncThunk("stories/updateStory", ({ id, title }) =>
  storiesApi.update(id, title),
);
export const deleteStory = createAsyncThunk("stories/deleteStory", (id) => storiesApi.remove(id));
export const saveChapter = createAsyncThunk("stories/saveChapter", (payload) =>
  chaptersApi.create(payload),
);
export const updateChapter = createAsyncThunk("stories/updateChapter", ({ id, ...payload }) =>
  chaptersApi.update(id, payload),
);
export const deleteChapter = createAsyncThunk("stories/deleteChapter", (id) =>
  chaptersApi.remove(id),
);

const isMutationFulfilled = (action) =>
  action.type.startsWith("stories/") &&
  action.type.endsWith("/fulfilled") &&
  action.type !== fetchStories.fulfilled.type;

const storiesSlice = createSlice({
  name: "stories",
  initialState: { items: [], status: "idle", error: null },
  reducers: {
    receiveStories(state, action) {
      state.items = action.payload;
      state.status = "succeeded";
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchStories.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchStories.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload;
      })
      .addCase(fetchStories.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message;
      })
      .addCase(updateStory.fulfilled, (state, action) => {
        const story = state.items.find((item) => item.id === action.payload.id);
        if (story) story.title = action.payload.title;
      })
      // Mọi thay đổi khác đánh dấu dữ liệu cũ để nơi cần có thể tải lại.
      .addMatcher(isMutationFulfilled, (state) => {
        state.status = "idle";
      });
  },
});

export const { receiveStories } = storiesSlice.actions;
export const storiesReducer = storiesSlice.reducer;
