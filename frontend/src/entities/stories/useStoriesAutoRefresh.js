import { useEffect, useRef } from "react";
import { useDispatch, useStore } from "react-redux";
import { storiesApi } from "../../api/stories";
import { toast } from "../../components/Toast";
import { fetchStories, receiveStories } from "./storiesSlice";

const REFRESH_INTERVAL_MS = 5000;

function countNewContent(current, refreshed) {
  const currentById = new Map(current.map((story) => [story.id, story]));
  const newStories = refreshed.filter((story) => !currentById.has(story.id)).length;
  const newChapters = refreshed.reduce((count, story) => {
    const known = new Set((currentById.get(story.id)?.chapters || []).map((c) => c.id));
    return count + story.chapters.filter((c) => !known.has(c.id)).length;
  }, 0);
  return { newStories, newChapters };
}

export function useStoriesAutoRefresh() {
  const dispatch = useDispatch();
  const store = useStore();
  const hasShownError = useRef(false);

  useEffect(() => {
    let active = true;
    let ready = false;
    let inFlight = false;
    let timer;

    const schedule = (delay = REFRESH_INTERVAL_MS) => {
      window.clearTimeout(timer);
      if (active) timer = window.setTimeout(refresh, delay);
    };

    const refresh = async () => {
      if (!active || !ready || document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      try {
        const refreshed = await storiesApi.list();
        if (!active) return;
        const current = store.getState().stories.items;
        if (JSON.stringify(current) !== JSON.stringify(refreshed)) {
          const { newStories, newChapters } = countNewContent(current, refreshed);
          dispatch(receiveStories(refreshed));
          if (newStories || newChapters) {
            const parts = [];
            if (newStories) parts.push(`${newStories} truyện mới`);
            if (newChapters) parts.push(`${newChapters} chương mới`);
            toast.success("Thư viện đã cập nhật", `${parts.join(", ")} đã được thêm vào danh sách.`, 5000);
          }
        }
        hasShownError.current = false;
      } catch (error) {
        if (active && !hasShownError.current) {
          toast.error("Không thể tự cập nhật thư viện", error.message, 5000);
          hasShownError.current = true;
        }
      } finally {
        inFlight = false;
        schedule();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule(0);
    };
    const onFocus = () => schedule(0);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    dispatch(fetchStories()).then(() => {
      if (!active) return;
      ready = true;
      schedule();
    });

    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [dispatch, store]);
}
