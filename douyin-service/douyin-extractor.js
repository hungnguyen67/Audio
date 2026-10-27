import puppeteer from 'puppeteer-core';
import fs from 'fs';

function findBrowserPath() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error('Không tìm thấy trình duyệt Google Chrome hoặc Microsoft Edge trên hệ thống!');
}

const BROWSER_PATH = findBrowserPath();

const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function extractDouyinVideo(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    throw new Error('Vui lòng nhập đường link hoặc đoạn văn bản chia sẻ từ Douyin!');
  }

  const match = rawInput.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) {
    throw new Error('Không tìm thấy đường link hợp lệ (ví dụ: https://v.douyin.com/...) trong văn bản nhập!');
  }

  const targetUrl = match[0].replace(/[,，。;；、)）\]】]+$/u, '');

  if (cache.has(targetUrl)) {
    const cached = cache.get(targetUrl);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    cache.delete(targetUrl);
  }

  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--mute-audio',
      '--window-size=1280,800',
      '--disable-dev-shm-usage'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    let awemeDetail = null;
    const mediaUrls = [];

    page.on('response', async (response) => {
      const url = response.url();
      const ct = response.headers()['content-type'] || '';

      if (url.includes('aweme/v1/web/aweme/detail')) {
        try {
          const json = await response.json();
          if (json && json.aweme_detail) {
            awemeDetail = json.aweme_detail;
          }
        } catch {}
      }

      if (
        (ct.includes('video/') || url.includes('.mp4') || (url.includes('video/tos/') && !url.includes('media-audio'))) &&
        !url.includes('uuu_265.mp4')
      ) {
        mediaUrls.push(url);
      }
    });

    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const startTime = Date.now();
    while (!awemeDetail && (Date.now() - startTime) < 9000) {
      await new Promise(r => setTimeout(r, 300));
    }

    if (!awemeDetail) {
      const pageInfo = await page.evaluate(() => {
        const title = document.title || '';
        const video = document.querySelector('video');
        const src = video ? (video.src || video.currentSrc) : null;
        return { title, src };
      });

      if (!mediaUrls.length && !pageInfo.src) {
        throw new Error('Không thể trích xuất video từ liên kết này. Video có thể đã bị xóa hoặc ở chế độ riêng tư.');
      }

      const fallbackResult = {
        aweme_id: 'unknown',
        desc: pageInfo.title.replace(' - 抖音', '').trim(),
        duration: 0,
        author: {
          nickname: 'Douyin Creator',
          avatar: null,
          signature: ''
        },
        stats: { likes: 0, comments: 0, shares: 0, collects: 0 },
        cover: null,
        direct_video_url: mediaUrls[0] || pageInfo.src,
        bitrates: (mediaUrls.length ? mediaUrls : [pageInfo.src]).map((u, idx) => ({
          gear_name: `Tùy chọn ${idx + 1}`,
          quality_type: idx,
          url: u
        })),
        music: null
      };

      cache.set(targetUrl, { timestamp: Date.now(), data: fallbackResult });
      return fallbackResult;
    }

    const video = awemeDetail.video || {};
    const author = awemeDetail.author || {};
    const stats = awemeDetail.statistics || {};
    const music = awemeDetail.music || {};

    const playAddrList = video.play_addr?.url_list || [];

    const bitRates = (video.bit_rate || []).map(b => ({
      gear_name: b.gear_name || 'Standard',
      quality_type: b.quality_type,
      bit_rate: b.bit_rate,
      width: b.play_addr?.width,
      height: b.play_addr?.height,
      url: (b.play_addr?.url_list || [])[0]
    })).filter(b => !!b.url);

    const bestUrl = bitRates.find(b => b.gear_name?.includes('1080'))?.url ||
                    bitRates.find(b => b.gear_name?.includes('720'))?.url ||
                    bitRates[0]?.url ||
                    playAddrList[0] ||
                    mediaUrls[0];

    const result = {
      aweme_id: awemeDetail.aweme_id,
      desc: awemeDetail.desc || 'Video Douyin',
      create_time: awemeDetail.create_time,
      duration: Math.round((video.duration || 0) / 1000),
      author: {
        nickname: author.nickname || 'Tác giả',
        avatar: author.avatar_thumb?.url_list?.[0] || author.avatar_medium?.url_list?.[0] || '',
        signature: author.signature || '',
        sec_uid: author.sec_uid || '',
        unique_id: author.unique_id || author.short_id || ''
      },
      stats: {
        likes: stats.digg_count || 0,
        comments: stats.comment_count || 0,
        shares: stats.share_count || 0,
        collects: stats.collect_count || 0
      },
      cover: video.origin_cover?.url_list?.[0] || video.cover?.url_list?.[0] || '',
      dynamic_cover: video.dynamic_cover?.url_list?.[0] || '',
      direct_video_url: bestUrl,
      bitrates: bitRates.length > 0 ? bitRates : [{ gear_name: 'HD Quality', url: bestUrl }],
      music: music.title || music.play_url?.url_list?.[0] ? {
        title: music.title || 'Nhạc nền',
        author: music.author || '',
        url: music.play_url?.url_list?.[0] || ''
      } : null
    };

    cache.set(targetUrl, { timestamp: Date.now(), data: result });
    return result;
  } finally {
    await browser.close().catch(() => {});
  }
}
