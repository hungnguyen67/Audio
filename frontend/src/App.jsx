import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { fetchStories } from './store';
import { Library } from './pages/Library';
import { Story } from './pages/Story';
import { Admin } from './pages/Admin';

export function App() {
  const dispatch = useDispatch();
  useEffect(() => { dispatch(fetchStories()); }, [dispatch]);
  return <Routes>
    <Route path="/" element={<Library />} />
    <Route path="/story/:storyId" element={<Story />} />
    <Route path="/admin" element={<Admin />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}