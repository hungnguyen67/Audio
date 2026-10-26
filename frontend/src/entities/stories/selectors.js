export const selectStories = (state) => state.stories.items;
export const selectStoriesStatus = (state) => state.stories.status;
export const selectStoryById = (id) => (state) =>
  id ? state.stories.items.find((story) => story.id === id) : undefined;
