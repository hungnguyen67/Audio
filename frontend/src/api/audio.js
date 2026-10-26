import { requestJson } from "./client";

export const audioApi = {
  createJob: (chapterId, voice) =>
    requestJson(`/api/chapters/${chapterId}/audio-jobs?voice=${encodeURIComponent(voice)}`, {
      method: "POST",
    }),
  getJob: (jobId) => requestJson(`/api/audio-jobs/${jobId}`),
};
