import { jsonRequest, requestJson } from "./client";

export const progressApi = {
  getPlaybackState: (chapterId) => requestJson(`/api/playback-state/${chapterId}`),
  savePlaybackState: (chapterId, body, { keepalive = false } = {}) =>
    requestJson(`/api/playback-state/${chapterId}`, jsonRequest("PUT", body, { keepalive })),
  getStoryProgress: (storyId) => requestJson(`/api/story-progress/${storyId}`),
  saveStoryProgress: (storyId, chapter) =>
    requestJson(
      `/api/story-progress/${storyId}`,
      jsonRequest("PUT", { chapterId: chapter.id, chapterNumber: chapter.number }),
    ),
};
