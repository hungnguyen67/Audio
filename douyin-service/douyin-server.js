import express from 'express';
import cors from 'cors';
import https from 'https';
import http from 'http';
import { extractDouyinVideo } from './douyin-extractor.js';

const app = express();
const PORT = process.env.DOUYIN_PORT || 5005;

app.use(cors());
app.use(express.json());

app.get('/api/douyin/health', (req, res) => {
  res.json({ status: 'ok', service: 'douyin-service' });
});

app.post('/api/douyin/extract', async (req, res) => {
  try {
    const { url, text } = req.body;
    const input = url || text;
    if (!input) {
      return res.status(400).json({
        success: false,
        error: 'Vui lòng cung cấp link hoặc nội dung chia sẻ Douyin!'
      });
    }

    const data = await extractDouyinVideo(input);
    return res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Douyin Service /api/douyin/extract Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Lỗi xử lý trích xuất video'
    });
  }
});

app.get('/api/douyin/proxy-stream', (req, res) => {
  const targetUrl = req.query.url;
  const isDownload = req.query.download === '1';
  const filename = req.query.filename || 'douyin_media';

  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://www.douyin.com/'
    };

    if (req.headers.range) {
      requestHeaders['Range'] = req.headers.range;
    }

    const proxyReq = client.get(targetUrl, { headers: requestHeaders }, (proxyRes) => {
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        return res.redirect(`/api/douyin/proxy-stream?url=${encodeURIComponent(proxyRes.headers.location)}&download=${req.query.download || 0}&filename=${encodeURIComponent(filename)}`);
      }

      res.status(proxyRes.statusCode);

      const headersToForward = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'last-modified',
        'etag'
      ];

      for (const h of headersToForward) {
        if (proxyRes.headers[h]) {
          res.setHeader(h, proxyRes.headers[h]);
        }
      }

      if (isDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      } else {
        res.setHeader('Content-Disposition', 'inline');
      }

      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy stream error:', err.message);
      if (!res.headersSent) {
        res.status(502).send('Error streaming media file');
      }
    });
  } catch (err) {
    console.error('Invalid URL:', err);
    res.status(400).send('Invalid URL format');
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Douyin Service] Running at http://127.0.0.1:${PORT}`);
});
