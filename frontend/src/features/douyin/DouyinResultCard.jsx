import { douyinApi } from '../../api/douyin';

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatSeconds(s) {
  if (!s) return '0:00';
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

function cleanTitle(desc) {
  return (desc || 'douyin_video')
    .slice(0, 50)
    .replace(/[\\/:*?"<>|#]/g, '')
    .trim() || 'douyin_video';
}

export function DouyinResultCard({ data }) {
  if (!data) return null;

  const title = cleanTitle(data.desc);
  const bitrates = data.bitrates || [];
  const hasVideo = bitrates.length > 0 || data.direct_video_url;
  const hasMusic = data.music?.url;
  const hasCover = !!data.cover;

  const bestBitrate = bitrates[0];

  const handleCopyLink = () => {
    navigator.clipboard.writeText(data.direct_video_url || '').then(() => {
      // flash handled via state in parent if needed
    }).catch(() => {});
  };

  return (
    <div className="dy-result-card">
      {/* Author info */}
      <div className="dy-author-row">
        <img
          className="dy-author-avatar"
          src={data.author?.avatar || ''}
          alt={data.author?.nickname || 'Tác giả'}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <div className="dy-author-info">
          <div className="dy-author-name">{data.author?.nickname || 'Tác giả'}</div>
          <div className="dy-author-id">
            {data.author?.unique_id ? `@${data.author.unique_id}` : (data.author?.signature || '')}
          </div>
        </div>
      </div>

      {/* Video preview */}
      {data.direct_video_url && (
        <div className="dy-video-wrap">
          <video
            className="dy-video-player"
            controls
            preload="metadata"
            poster={data.cover || ''}
            src={douyinApi.proxyUrl(data.direct_video_url)}
          />
        </div>
      )}

      {/* Description */}
      <p className="dy-desc">{data.desc}</p>

      {/* Stats */}
      <div className="dy-stats-row">
        <span className="dy-stat">❤️ {formatNumber(data.stats?.likes)}</span>
        <span className="dy-stat">💬 {formatNumber(data.stats?.comments)}</span>
        <span className="dy-stat">↗️ {formatNumber(data.stats?.shares)}</span>
        <span className="dy-stat">⏱ {formatSeconds(data.duration)}</span>
      </div>

      {/* Download section */}
      <div className="dy-download-section">
        <div className="dy-download-label">TẢI VỀ</div>

        {/* Best quality video */}
        {hasVideo && bestBitrate && (
          <a
            className="dy-dl-btn dy-dl-primary"
            href={douyinApi.proxyUrl(bestBitrate.url, { download: true, filename: `${title}_HD.mp4` })}
            download
          >
            <span>📥 Tải Video Không Logo ({bestBitrate.gear_name || '1080p'})</span>
            <span className="dy-dl-meta">MP4 · Full HD</span>
          </a>
        )}

        {/* Fallback single video URL */}
        {hasVideo && !bestBitrate && data.direct_video_url && (
          <a
            className="dy-dl-btn dy-dl-primary"
            href={douyinApi.proxyUrl(data.direct_video_url, { download: true, filename: `${title}.mp4` })}
            download
          >
            <span>📥 Tải Video Không Logo</span>
            <span className="dy-dl-meta">MP4 · HD</span>
          </a>
        )}

        {/* Other quality options */}
        {bitrates.slice(1, 3).map((b, idx) => (
          <a
            key={idx}
            className="dy-dl-btn dy-dl-secondary"
            href={douyinApi.proxyUrl(b.url, { download: true, filename: `${title}_${b.gear_name || idx}.mp4` })}
            download
          >
            <span>📥 Tải {b.gear_name || `Chất lượng ${idx + 2}`}</span>
            <span className="dy-dl-meta">MP4</span>
          </a>
        ))}

        {/* Extra: Audio MP3 */}
        {hasMusic && (
          <a
            className="dy-dl-btn dy-dl-audio"
            href={douyinApi.proxyUrl(data.music.url, { download: true, filename: `${title}_audio.mp3` })}
            download
          >
            <span>🎵 Tải Nhạc MP3</span>
            <span className="dy-dl-meta">{data.music.title || 'Nhạc nền'}</span>
          </a>
        )}

        {/* Extra: Cover image */}
        {hasCover && (
          <a
            className="dy-dl-btn dy-dl-cover"
            href={douyinApi.proxyUrl(data.cover, { download: true, filename: `${title}_cover.jpg` })}
            download
          >
            <span>🖼️ Tải Ảnh Bìa</span>
            <span className="dy-dl-meta">JPG</span>
          </a>
        )}
      </div>

      {/* Copy stream URL */}
      <button
        type="button"
        className="dy-copy-btn"
        onClick={handleCopyLink}
        title="Sao chép link stream"
      >
        🔗 Sao chép link stream
      </button>
    </div>
  );
}
