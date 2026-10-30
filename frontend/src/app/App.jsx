import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { AdminStoriesPage } from "../features/admin-stories/AdminStoriesPage";
import { LibraryPage } from "../features/library/LibraryPage";
import { StoryPage } from "../features/story/StoryPage";
import { DouyinDownloaderPage } from "../features/douyin/DouyinDownloaderPage";
import { PlayerProvider } from "../features/player/PlayerProvider";
import { PlayerWindowPage } from "../features/player/PlayerWindowPage";

export function App() {
  return (
    <PlayerProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/admin" replace />} />
          <Route path="admin" element={<AdminStoriesPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="story/:storyId" element={<StoryPage />} />
          <Route path="douyin" element={<DouyinDownloaderPage />} />
        </Route>
        <Route path="player-window" element={<PlayerWindowPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </PlayerProvider>
  );
}
