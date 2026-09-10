import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Pagination } from '../shared/Pagination';
import { Select } from '../shared/Select';

const voices = [['edge:vi-VN-HoaiMyNeural', 'Hoài My'], ['edge:vi-VN-NamMinhNeural', 'Nam Minh']];
const speeds = [0.75, 1, 1.25, 1.5, 1.75, 2];
const api = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Request failed.');
  return data;
};

function HeadphonesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

export function Story() {
  const { storyId } = useParams();
  const story = useSelector((state) => state.stories.items.find((s) => s.id === storyId));
  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const playingChunkRef = useRef(false);
  const progressTimerRef = useRef(null);
  const progressJobRef = useRef(null);
  const persistTimerRef = useRef(null);
  const currentChunkRef = useRef(0);
  const resumeRef = useRef({ chunkIndex: 0, positionSeconds: 0 });
  const currentChapterRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [lastListenedChapter, setLastListenedChapter] = useState(null);
  const [voice, setVoice] = useState(localStorage.getItem('audio-voice') || 'edge:vi-VN-HoaiMyNeural');
  const [speed, setSpeed] = useState(Number(localStorage.getItem('audio-playback-rate') || 1));
  const [autoNext, setAutoNext] = useState(localStorage.getItem('audio-auto-next') === 'true');
  const [volume, setVolume] = useState(Number(localStorage.getItem('audio-volume') ?? 1));
  const [chapterPage, setChapterPage] = useState(1);
  const [chapterPageSize, setChapterPageSize] = useState(5);
  const [status, setStatus] = useState('Vui lòng chọn một chương để bắt đầu nghe');
  const visibleChapters = story
    ? story.chapters.slice((chapterPage - 1) * chapterPageSize, chapterPage * chapterPageSize)
    : [];

  useEffect(() => {
    setSelected(null);
    setLastListenedChapter(null);
    setChapterPage(1);
    if (!storyId) return;
    api(`/api/story-progress/${storyId}`)
      .then((progress) => {
        if (progress.chapterNumber) {
          setLastListenedChapter(progress.chapterNumber);
          const chapterIndex = story?.chapters.findIndex((chapter) => chapter.id === progress.chapterId);
          const page = chapterIndex >= 0
            ? Math.floor(chapterIndex / chapterPageSize) + 1
            : 1;
          setChapterPage(page);
        }
      })
      .catch(() => {});
  }, [storyId, story, chapterPageSize]);

  useEffect(() => () => {
    window.clearTimeout(timerRef.current);
    window.clearTimeout(progressTimerRef.current);
    window.clearTimeout(persistTimerRef.current);
  }, []);
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    const savedVolume = Number(localStorage.getItem('audio-volume'));
    if (Number.isFinite(savedVolume)) setVolume(savedVolume);
  }, []);
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed]);

  const savePlaybackStateNow = (chapterId, chunkIndex = currentChunkRef.current, positionSeconds = 0) => {
    if (!chapterId) return;
    return api(`/api/playback-state/${chapterId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice, playbackRate: speed, volume, chunkIndex, positionSeconds }),
    }).catch(() => {});
  };

  const savePlaybackState = (chapterId, chunkIndex = currentChunkRef.current, positionSeconds = 0) => {
    if (!chapterId) return;
    window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      savePlaybackStateNow(chapterId, chunkIndex, positionSeconds);
    }, 700);
  };

  const savePlaybackSettings = (chapterId, settings) => {
    if (!chapterId) return;
    api(`/api/playback-state/${chapterId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voice: settings.voice ?? voice,
        playbackRate: settings.playbackRate ?? speed,
        volume: settings.volume ?? volume,
        chunkIndex: currentChunkRef.current,
        positionSeconds: audioRef.current?.currentTime || 0,
      }),
    }).catch(() => {});
  };

  const saveStoryProgress = (chapter) => {
    if (!storyId || !chapter) return;
    setLastListenedChapter(chapter.number);
    api(`/api/story-progress/${storyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId: chapter.id, chapterNumber: chapter.number }),
    }).catch(() => {});
  };

  const playUrl = async (url, waitForEnd = false, startAt = 0) => {
    const audio = audioRef.current;
    const playback = waitForEnd
      ? new Promise((resolve, reject) => {
        const onError = () => reject(new Error('Không tải được đoạn audio.'));
        audio.addEventListener('ended', resolve, { once: true });
        audio.addEventListener('error', onError, { once: true });
      })
      : null;
    if (startAt > 0) {
      audio.addEventListener('loadedmetadata', () => { audio.currentTime = startAt; }, { once: true });
    }
    audio.src = `${url}?t=${Date.now()}`;
    const savedVolume = Number(localStorage.getItem('audio-volume'));
    if (Number.isFinite(savedVolume)) audio.volume = savedVolume;
    audio.playbackRate = speed;
    await audio.play();
    if (playback) await playback;
  };

  const watchJobProgress = async (jobId) => {
    while (true) {
      const job = await api(`/api/audio-jobs/${jobId}`);
      if (progressJobRef.current !== jobId) return;
      if (job.status === 'failed' || job.status === 'completed') return;
      if (job.totalChunks) {
        const completedChunks = job.completedCount ?? 0;
        const progress = Math.round((completedChunks / job.totalChunks) * 100);
        setStatus(`Đang phát | Đang tạo: ${completedChunks}/${job.totalChunks} (${progress}%)`);
      }
      await new Promise((resolve) => {
        progressTimerRef.current = window.setTimeout(resolve, 500);
      });
    }
  };

  const playJob = async (jobId, chapterId, resume = resumeRef.current) => {
    let nextIndex = resume?.chunkIndex || 0;
    const chunks = [];
    progressJobRef.current = jobId;
    watchJobProgress(jobId).catch(() => {});
    while (true) {
      const job = await api(`/api/audio-jobs/${jobId}`);
      if (job.status === 'failed') throw new Error(job.message || 'Tạo audio thất bại.');
      (job.completedChunks || []).forEach((chunk) => { chunks[chunk.index] = chunk.url; });
      if (chunks[nextIndex]) {
        const currentIndex = nextIndex++;
        const chunkUrl = chunks[currentIndex];
        currentChunkRef.current = currentIndex;
        playingChunkRef.current = true;
        try {
          setStatus(`Đang phát đoạn ${currentIndex + 1}/${job.totalChunks || '?'} | Đã tạo: ${job.completedCount || 0}/${job.totalChunks || '?'}`);
          await playUrl(chunkUrl, true, currentIndex === resume?.chunkIndex ? resume.positionSeconds : 0);
          savePlaybackState(chapterId, nextIndex, 0);
        } finally {
          playingChunkRef.current = false;
        }
        continue;
      }
      if (job.status === 'completed') {
        if (nextIndex >= (job.totalChunks || 0)) {
          setStatus('Đang tạo: 100% | Đã phát xong');
          return;
        }
        if (job.finalUrl) { await playUrl(job.finalUrl); setStatus('Đang phát'); return; }
      }
      if (job.totalChunks) {
        const completedChunks = job.completedCount ?? chunks.filter(Boolean).length;
        const progress = Math.round((completedChunks / job.totalChunks) * 100);
        setStatus(`Đang tạo: ${completedChunks}/${job.totalChunks} (${progress}%)`);
      } else setStatus('Đang tạo audio...');
      await new Promise((resolve) => { timerRef.current = window.setTimeout(resolve, 500); });
    }
  };

  const selectChapter = async (chapter, shouldPlay = true) => {
    setSelected(chapter);
    currentChapterRef.current = chapter.id;
    saveStoryProgress(chapter);
    if (!shouldPlay) return;
    setStatus('Đang kiểm tra audio...');
    try {
      const saved = await api(`/api/playback-state/${chapter.id}`);
      setVoice(saved.voice);
      setSpeed(saved.playbackRate);
      setVolume(saved.volume);
      resumeRef.current = { chunkIndex: saved.chunkIndex || 0, positionSeconds: saved.positionSeconds || 0 };
      currentChunkRef.current = resumeRef.current.chunkIndex;
      const result = await api(`/api/chapters/${chapter.id}/audio-jobs?voice=${encodeURIComponent(saved.voice)}`, { method: 'POST' });
      if (result.status === 'ready') {
        currentChunkRef.current = 0;
        await playUrl(result.url, false, resumeRef.current.positionSeconds);
        setStatus('Đang phát');
      } else await playJob(result.jobId, chapter.id, resumeRef.current);
    } catch (error) { setStatus(error.message); }
  };

  const finishChapter = () => {
    if (playingChunkRef.current) return;
    if (!selected || !autoNext || !story) return;
    const next = story.chapters[story.chapters.findIndex((c) => c.id === selected.id) + 1];
    if (next) { setStatus('Đã xong, đang chuyển chương tiếp...'); timerRef.current = window.setTimeout(() => selectChapter(next), 700); }
    else setStatus('Đã nghe hết truyện');
  };

  if (!story) {
    return (
      <>
        <nav className="navbar">
          <div className="navbar-inner">
            <div className="brand">
              <div className="brand-icon"><HeadphonesIcon /></div>
              <div className="brand-text">
                <span className="brand-name">Audio Story Reader</span>
                <span className="brand-page">Đang phát</span>
              </div>
            </div>
            <Link to="/" className="btn btn-outline">Thư viện</Link>
          </div>
        </nav>
        <div className="container" style={{ padding: '48px 24px', color: '#64748b', textAlign: 'center' }}>
          Không tìm thấy truyện. <Link to="/" style={{ color: '#2563eb' }}>Quay lại thư viện</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="brand">
            <div className="brand-icon"><HeadphonesIcon /></div>
            <div className="brand-text">
              <span className="brand-name">Audio Story Reader</span>
              <span className="brand-page">Đang phát</span>
            </div>
          </div>
        </div>
      </nav>

      <main>
        <div className="container">
          {/* Story header */}
          <div className="page-hero">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: '#94a3b8' }}>
                <BookIcon />
                <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Audio Story Reader</span>
              </div>
              <h1 style={{ fontSize: 'clamp(1.6rem, 3vw, 2rem)', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: 5 }}>
                {story.title}
              </h1>
              {lastListenedChapter ? (
                <div className="story-progress-label">Đã nghe đến tập {lastListenedChapter}</div>
              ) : (
                <div className="story-progress-label">Chưa nghe tập nào</div>
              )}
            </div>
            <Link to="/" className="btn btn-outline">Thư viện</Link>
          </div>

          {/* Two-column layout */}
          <div className="story-wrap">
            {/* Left: chapter list */}
            <div className="section-card">
              <div className="section-head">
                <div>
                  <div className="section-title">Danh sách chương</div>
                </div>
              </div>

              <div className="ch-tbl">
                {visibleChapters.map((chapter) => (
                  <div
                    key={chapter.id}
                    className={`dt-row${selected?.id === chapter.id ? ' active' : ''}${lastListenedChapter === chapter.number ? ' progress' : ''}`}
                    onClick={() => selectChapter(chapter)}
                  >
                    <span className="row-num">{String(chapter.number).padStart(2, '0')}</span>

                    <div style={{ overflow: 'hidden' }}>
                      <div className="ch-title">{chapter.title}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination
                total={story.chapters.length}
                page={chapterPage}
                pageSize={chapterPageSize}
                onPageChange={setChapterPage}
                onPageSizeChange={(size) => { setChapterPageSize(size); setChapterPage(1); }}
              />
            </div>

            {/* Right: player + tips */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="player-card">
                <div className="player-label">Đang phát</div>
                <div className="player-title">
                  {selected ? selected.title : 'Chưa chọn chương'}
                </div>
                <div className="player-status">{status}</div>

                <div className="ctrl-row">
                  <div className="ctrl-col">
                    <label className="ctrl-label">Giọng đọc</label>
                    <Select
                      value={voice}
                      options={voices.map(([value, label]) => ({ value, label }))}
                      onChange={(value) => {
                        setVoice(value);
                        localStorage.setItem('audio-voice', value);
                        savePlaybackSettings(currentChapterRef.current, { voice: value });
                        if (selected) setStatus('Giọng thay đổi. Nhấn vào chương để nghe lại.');
                      }}
                    />
                  </div>
                  <div className="ctrl-col">
                    <label className="ctrl-label">Tốc độ</label>
                    <Select
                      value={speed}
                      options={speeds.map((value) => ({ value, label: `${value}x` }))}
                      onChange={(value) => {
                        const nextSpeed = Number(value);
                        setSpeed(nextSpeed);
                        localStorage.setItem('audio-playback-rate', nextSpeed);
                        savePlaybackSettings(currentChapterRef.current, { playbackRate: nextSpeed });
                      }}
                    />
                  </div>
                </div>

                <label className="auto-label">
                  <input
                    type="checkbox"
                    checked={autoNext}
                    onChange={(e) => { setAutoNext(e.target.checked); localStorage.setItem('audio-auto-next', e.target.checked); }}
                  />
                  <span className="check-box" aria-hidden="true" />
                  Tự động phát chương tiếp theo
                </label>

                <audio
                  ref={audioRef}
                  controls
                  onEnded={finishChapter}
                  onTimeUpdate={() => savePlaybackState(currentChapterRef.current, currentChunkRef.current, audioRef.current?.currentTime || 0)}
                  onSeeked={() => savePlaybackStateNow(currentChapterRef.current, currentChunkRef.current, audioRef.current?.currentTime || 0)}
                  onPause={() => savePlaybackStateNow(currentChapterRef.current, currentChunkRef.current, audioRef.current?.currentTime || 0)}
                  onLoadedMetadata={() => {
                    audioRef.current.volume = volume;
                  }}
                  onVolumeChange={() => savePlaybackState(currentChapterRef.current, currentChunkRef.current, audioRef.current?.currentTime || 0)}
                  onInput={() => savePlaybackState(currentChapterRef.current, currentChunkRef.current, audioRef.current?.currentTime || 0)}
                />
                <label className="volume-control">
                  <span>Âm lượng</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(event) => {
                      const nextVolume = Number(event.target.value);
                      setVolume(nextVolume);
                      localStorage.setItem('audio-volume', String(nextVolume));
                      savePlaybackSettings(currentChapterRef.current, { volume: nextVolume });
                    }}
                  />
                  <span>{Math.round(volume * 100)}%</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}