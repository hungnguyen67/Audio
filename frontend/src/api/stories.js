import { jsonRequest, requestJson } from "./client";

export const storiesApi = {
  list: () => requestJson("/api/stories"),
  create: (title) => requestJson("/api/stories", jsonRequest("POST", { title })),
  update: (id, title) => requestJson(`/api/stories/${id}`, jsonRequest("PUT", { title })),
  remove: (id) => requestJson(`/api/stories/${id}`, { method: "DELETE" }),
};
