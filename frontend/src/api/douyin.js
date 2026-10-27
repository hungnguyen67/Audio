const DOUYIN_BASE = '/api/douyin';
const LIBRARY_BASE = '/api/saved-douyin-videos';
const FOLDERS_BASE = '/api/saved-douyin-folders';

async function requestLibrary(path, options, base = LIBRARY_BASE) {
  const res = await fetch(`${base}${path}`, options);
  const body = await res.text();
  let json;
  try {
    json = body ? JSON.parse(body) : {};
  } catch {
    throw new Error(`Máy chủ trả về dữ liệu không hợp lệ (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    const error = new Error(json.message || `Lỗi server: ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return json;
}

export const douyinApi = {
  async extract(input) {
    const res = await fetch(`${DOUYIN_BASE}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input }),
    });
    const body = await res.text();
    let json;
    try {
      json = body ? JSON.parse(body) : {};
    } catch {
      if (res.status >= 500) {
        throw new Error('Dịch vụ Douyin hiện không phản hồi. Hãy khởi động lại ứng dụng rồi thử lại.');
      }
      throw new Error(`Dịch vụ Douyin trả về dữ liệu không hợp lệ (HTTP ${res.status}).`);
    }
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Lỗi server: ${res.status}`);
    }
    return json.data;
  },

  listSaved: () => requestLibrary('', { method: 'GET' }),

  listFolders: () => requestLibrary('', { method: 'GET' }, FOLDERS_BASE),

  createFolder: (name) => requestLibrary('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }, FOLDERS_BASE),

  deleteFolder: (id) => requestLibrary(`/${id}`, { method: 'DELETE' }, FOLDERS_BASE),

  saveVideo: (video) => requestLibrary('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(video),
  }),

  deleteVideo: (id) => requestLibrary(`/${id}`, { method: 'DELETE' }),

  deleteVideos: (ids) => requestLibrary('/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }),

  moveVideos: (ids, folderId) => requestLibrary('/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, folderId }),
  }),

  savedMediaUrl: (id) => `${LIBRARY_BASE}/${id}/media`,

  proxyUrl(mediaUrl, opts = {}) {
    const params = new URLSearchParams({ url: mediaUrl });
    if (opts.download) params.set('download', '1');
    if (opts.filename) params.set('filename', opts.filename);
    return `${DOUYIN_BASE}/proxy-stream?${params.toString()}`;
  },
};
