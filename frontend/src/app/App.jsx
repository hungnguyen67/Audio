import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { AdminStoriesPage } from "../features/admin-stories/AdminStoriesPage";
import { LibraryPage } from "../features/library/LibraryPage";
import { StoryPage } from "../features/story/StoryPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/admin" replace />} />
        <Route path="admin" element={<AdminStoriesPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="story/:storyId" element={<StoryPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
