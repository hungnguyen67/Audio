import { useCallback, useEffect, useRef, useState } from 'react';
import { douyinApi } from '../../api/douyin';
import { toast } from '../../components/Toast';

const MAX_VIDEO_DURATION_SECONDS = 20 * 60;
let cachedVideos = null;

function getDouyinLinks(text) {
  const links = [...text.matchAll(/https?:\/\/[^\s"'<>]+/gi)]
    .map(([link]) => link.replace(/[,，。;；、)）\]】]+$/u, ''))
    .filter(Boolean);
  return [...new Set(links)];
}

export function useDouyinDownloader() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle');
  const [videos, setVideos] = useState(() => cachedVideos ?? []);
  const [selectedIds, setSelectedIds] = useState([]);
  const [step, setStep] = useState(0);
  const [batchProgress, setBatchProgress] = useState(null);
  const [loadingLibrary, setLoadingLibrary] = useState(() => cachedVideos === null);
  const stepTimer1 = useRef(null);
  const stepTimer2 = useRef(null);

  const updateVideos = useCallback((updater) => {
    setVideos((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      cachedVideos = next;
      return next;
    });
  }, []);

  const refreshLibrary = useCallback(async () => {
    if (cachedVideos === null) setLoadingLibrary(true);
    try {
      const savedVideos = await douyinApi.listSaved();
      cachedVideos = savedVideos;
      setVideos(savedVideos);
    } catch (requestError) {
      toast.error('Không thể tải thư viện video', requestError.message, 5000);
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    refreshLibrary();
    return () => {
      clearTimeout(stepTimer1.current);
      clearTimeout(stepTimer2.current);
    };
  }, [refreshLibrary]);

  const extract = useCallback(async (rawInput) => {
    const text = (typeof rawInput === 'string' ? rawInput : input).trim();
    if (!text) {
      toast.error('Thiếu liên kết Douyin', 'Vui lòng dán link chia sẻ từ Douyin.', 5000);
      return;
    }

    const foundLinks = [...text.matchAll(/https?:\/\/[^\s"'<>]+/gi)];
    const links = getDouyinLinks(text);
    if (!links.length) {
      toast.error('Không tìm thấy liên kết', 'Dán ít nhất một link video Douyin hợp lệ.', 5000);
      return;
    }

    const duplicateCount = foundLinks.length - links.length;
    const savedVideos = [];
    const failedLinks = [];
    let hasDuplicateOnServer = false;
    setStatus('loading');
    setBatchProgress({ current: 0, total: links.length, saved: 0, failed: 0, link: '' });

    for (const [index, link] of links.entries()) {
      setBatchProgress({
        current: index + 1,
        total: links.length,
        saved: savedVideos.length,
        failed: failedLinks.length,
        link,
      });
      setStatus('loading');
      setStep(1);
      stepTimer1.current = setTimeout(() => setStep(2), 2200);
      stepTimer2.current = setTimeout(() => setStep(3), 4800);

      try {
        const data = await douyinApi.extract(link);
        clearTimeout(stepTimer1.current);
        clearTimeout(stepTimer2.current);
        const duration = Number(data.duration);
        if (!Number.isFinite(duration) || duration < 1) {
          throw new Error('Không xác định được thời lượng video nên không thể kiểm tra giới hạn 20 phút.');
        }
        if (duration > MAX_VIDEO_DURATION_SECONDS) {
          throw new Error('Chỉ hỗ trợ lưu video có thời lượng tối đa 20 phút.');
        }
        const videoUrl = data.direct_video_url || data.bitrates?.[0]?.url;
        if (!videoUrl) throw new Error('Không tìm thấy luồng MP4 trong video này.');

        setStatus('saving');
        setStep(4);
        const saved = await douyinApi.saveVideo({
          awemeId: data.aweme_id || '',
          title: data.desc || 'Video Douyin',
          author: data.author?.nickname || '',
          cover: data.cover || '',
          duration,
          videoUrl,
        });
        savedVideos.push(saved);
        updateVideos((current) => [saved, ...current.filter((video) => video.id !== saved.id)]);
      } catch (requestError) {
        clearTimeout(stepTimer1.current);
        clearTimeout(stepTimer2.current);
        failedLinks.push({ link, message: requestError.message || 'Không thể lưu video.' });
        if (requestError.status === 409) hasDuplicateOnServer = true;
      }

      setBatchProgress({
        current: index + 1,
        total: links.length,
        saved: savedVideos.length,
        failed: failedLinks.length,
        link,
      });
    }

    if (hasDuplicateOnServer) await refreshLibrary();
    if (savedVideos.length) {
      setSelectedIds(savedVideos.map((video) => video.id));
    }
    setInput(failedLinks.map(({ link }) => link).join('\n'));
    setStatus(savedVideos.length ? 'done' : 'error');
    setStep(0);
    setBatchProgress(null);

    if (failedLinks.length) {
      const savedSummary = savedVideos.length ? `Đã lưu ${savedVideos.length}/${links.length} video. ` : '';
      const duplicateSummary = duplicateCount ? `Đã bỏ qua ${duplicateCount} link trùng. ` : '';
      toast.error(
        'Một số video chưa lưu được',
        `${savedSummary}${duplicateSummary}${failedLinks[0].message}`,
        7000,
      );
    } else {
      const duplicateSummary = duplicateCount ? ` Đã bỏ qua ${duplicateCount} link trùng.` : '';
      toast.success(
        'Đã lưu video',
        `Đã lưu ${savedVideos.length} video vào thư viện.${duplicateSummary}`,
        5000,
      );
    }
  }, [input, refreshLibrary, updateVideos]);

  const toggleSelected = useCallback((id) => {
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    ));
  }, []);

  const selectOnly = useCallback((id) => setSelectedIds([id]), []);

  const selectAll = useCallback((visibleIds) => {
    setSelectedIds((current) => (
      visibleIds.length > 0 && visibleIds.every((id) => current.includes(id))
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])]
    ));
  }, []);

  const deleteVideo = useCallback(async (id) => {
    await douyinApi.deleteVideo(id);
    updateVideos((current) => current.filter((video) => video.id !== id));
    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id));
  }, [updateVideos]);

  const deleteSelected = useCallback(async () => {
    if (!selectedIds.length) return;
    await douyinApi.deleteVideos(selectedIds);
    updateVideos((current) => current.filter((video) => !selectedIds.includes(video.id)));
    setSelectedIds([]);
  }, [selectedIds, updateVideos]);

  return {
    input,
    setInput,
    status,
    videos,
    selectedIds,
    step,
    batchProgress,
    loadingLibrary,
    extract,
    refreshLibrary,
    toggleSelected,
    selectOnly,
    selectAll,
    deleteVideo,
    deleteSelected,
  };
}
