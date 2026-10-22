import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { fetchStories, receiveStories, store } from '../store';
import { requestJson } from '../lib/apiClient';
import { toast } from '../components/Toast';
import { LibraryPage } from '../features/library/LibraryPage';
import { StoryPage } from '../features/story/StoryPage';
import { AdminPage } from '../features/admin/AdminPage';

const STORY_REFRESH_INTERVAL_MS = 5000;

function getNewContent(currentStories, refreshedStories) {
  const currentById = new Map(currentStories.map((story) => [story.id, story]));
  const newStories = refreshedStories.filter((story) => !currentById.has(story.id));
  const newChapters = refreshedStories.reduce((count, story) => {
    const currentChapterIds = new Set(
      (currentById.get(story.id)?.chapters || []).map((chapter) => chapter.id),
    );
    return count + story.chapters.filter((chapter) => !currentChapterIds.has(chapter.id)).length;
  }, 0);

  return { newStories: newStories.length, newChapters };
}

export function App() {
  const dispatch = useDispatch();
  const location = useLocation();
  const hasShownRefreshError = useRef(false);
  const storyMatch = location.pathname.match(/^\/story\/([^/]+)\/?$/);
  const storyId = storyMatch ? decodeURIComponent(storyMatch[1]) : undefined;

  useEffect(() => {
    let active = true;
    let ready = false;
    let requestInProgress = false;
    let refreshTimer;

    const scheduleRefresh = (delay = STORY_REFRESH_INTERVAL_MS) => {
      window.clearTimeout(refreshTimer);
      if (active) refreshTimer = window.setTimeout(refreshStories, delay);
    };

    const refreshStories = async () => {
      if (!active || !ready || document.visibilityState !== 'visible' || requestInProgress) return;

      requestInProgress = true;
      try {
        const refreshedStories = await requestJson('/api/stories');
        if (!active) return;

        const currentStories = store.getState().stories.items;
        const hasChanges = JSON.stringify(currentStories) !== JSON.stringify(refreshedStories);
        if (hasChanges) {
          const { newStories, newChapters } = getNewContent(currentStories, refreshedStories);
          dispatch(receiveStories(refreshedStories));

          if (newStories || newChapters) {
            const updates = [];
            if (newStories) updates.push(`${newStories} truyện mới`);
            if (newChapters) updates.push(`${newChapters} chương mới`);
            toast.success('Thư viện đã cập nhật', `${updates.join(', ')} đã được thêm vào danh sách.`, 5000);
          }
        }
        hasShownRefreshError.current = false;
      } catch (error) {
        if (!active) return;
        if (!hasShownRefreshError.current) {
          toast.error('Không thể tự cập nhật thư viện', error.message, 5000);
          hasShownRefreshError.current = true;
        }
      } finally {
        requestInProgress = false;
        scheduleRefresh();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleRefresh(0);
    };

    const handleFocus = () => scheduleRefresh(0);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    dispatch(fetchStories()).then(() => {
      if (!active) return;
      ready = true;
      scheduleRefresh();
    });

    return () => {
      active = false;
      window.clearTimeout(refreshTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [dispatch]);

  return <>
    <Routes>
      <Route path="/" element={<LibraryPage />} />
      <Route path="/story/:storyId" element={null} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <StoryPage storyId={storyId} active={Boolean(storyId)} />
  </>;
}