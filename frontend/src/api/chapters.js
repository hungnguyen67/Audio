import { jsonRequest, requestJson } from "./client";

export const chaptersApi = {
  get: (id) => requestJson(`/api/chapters/${id}`),
  create: (payload) => requestJson("/api/chapters", jsonRequest("POST", payload)),
  update: (id, payload) => requestJson(`/api/chapters/${id}`, jsonRequest("PUT", payload)),
  remove: (id) => requestJson(`/api/chapters/${id}`, { method: "DELETE" }),
  importFromUrl: (url) => requestJson("/api/import-chapter", jsonRequest("POST", { url })),
};
