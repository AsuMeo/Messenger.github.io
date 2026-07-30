require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const PORT = process.env.PORT || 3000;

function parseToken(input) {
  const match = input.match(/access_token=([a-zA-Z0-9_.-]+)/);
  return match ? match[1] : input.trim();
}

async function resolveShortUrl(shortUrl) {
  try {
    const res = await axios.head(shortUrl, {
      maxRedirects: 10,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return res.request?.res?.responseUrl || res.headers?.location || shortUrl;
  } catch (err) {
    if (err.response?.request?.res?.responseUrl) {
      return err.response.request.res.responseUrl;
    }
    return shortUrl;
  }
}

async function getPinVideoUrl(pinUrl) {
  let url = pinUrl;
  
  if (pinUrl.includes('pin.it/')) {
    console.log('Resolving short URL...');
    url = await resolveShortUrl(pinUrl);
    console.log('Resolved:', url);
  }

  const pinId = url.match(/pin\/(\d+)/)?.[1];
  if (!pinId) throw new Error('Invalid Pinterest URL');

  // Method 1: pinterestdownloader.io API
  try {
    console.log('Trying pinterestdownloader API...');
    const apiRes = await axios.post('https://pinterestdownloader.io/api/ajaxSearch', 
      new URLSearchParams({ q: url, t: 'url', v: 'fh' }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://pinterestdownloader.io/',
          'Origin': 'https://pinterestdownloader.io'
        },
        timeout: 20000
      }
    );

    const html = apiRes.data.data;
    const videoMatch = html.match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/);
    if (videoMatch) {
      console.log('Found via API');
      return videoMatch[1].replace(/&amp;/g, '&');
    }
  } catch (e) {
    console.log('API method failed:', e.message);
  }

  // Method 2: Direct page scrape with cookies
  try {
    console.log('Trying direct scrape...');
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': '_pinterest_sess=1; _auth=1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 15000
    });

    const html = res.data;

    // Try multiple patterns
    const patterns = [
      /"url":"(https:\\\/\\\/v\.pinimg\.com\\\/[^"]+\.mp4)"/,
      /"contentUrl":"(https:\/\/v\.pinimg\.com\/[^"]+\.mp4)"/,
      /(https:\/\/v\.pinimg\.com\/[^"'\s]+\.mp4)/,
      /video_url["']?\s*:\s*["'](https:\/\/[^"']+\.mp4)/,
      /"videos":\{"video_list":\{"v_HLSV4":\{"url":"([^"]+)"/
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        let videoUrl = match[1].replace(/\\/g, '');
        if (!videoUrl.startsWith('http')) videoUrl = 'https:' + videoUrl;
        console.log('Found via pattern:', pattern.toString().slice(0, 50));
        return videoUrl;
      }
    }

    // Try JSON initial state
    const jsonMatch = html.match(/<script id="initial-state" type="application\/json">(.+?)<\/script>/s);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[1]);
      const resources = data?.resources?.data || {};
      const pinKey = Object.keys(resources).find(k => k.includes(pinId));
      const pin = pinKey ? resources[pinKey] : null;
      
      if (pin?.videos?.video_list) {
        const videos = Object.values(pin.videos.video_list);
        const best = videos.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
        if (best?.url) {
          console.log('Found via initial-state JSON');
          return best.url;
        }
      }
    }

  } catch (e) {
    console.log('Scrape failed:', e.message);
  }

  throw new Error('Video not found. Try direct pinterest.com/pin/... URL');
}

async function downloadFile(url, outputPath) {
  const res = await axios.get(url, {
    responseType: 'stream',
    timeout: 120000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.pinterest.com/'
    }
  });

  const writer = fs.createWriteStream(outputPath);
  res.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(outputPath));
    writer.on('error', reject);
  });
}

app.post('/api/upload', async (req, res) => {
  let { pinterestUrl, vkToken } = req.body;
  
  vkToken = parseToken(vkToken);

  if (!pinterestUrl || !vkToken) {
    return res.status(400).json({ error: 'Need Pinterest URL and VK token' });
  }

  const pinId = pinterestUrl.match(/pin\/(\d+)/)?.[1] || 'video';
  const tempPath = path.join(__dirname, `temp_${Date.now()}_${pinId}.mp4`);

  try {
    console.log('Finding video...');
    const videoUrl = await getPinVideoUrl(pinterestUrl);
    console.log('Video URL:', videoUrl.substring(0, 80) + '...');

    console.log('Downloading...');
    await downloadFile(videoUrl, tempPath);

    const stats = fs.statSync(tempPath);
    console.log('Size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');

    if (stats.size > 200 * 1024 * 1024) {
      throw new Error('Video too large (>200MB)');
    }

    console.log('Getting VK upload server...');
    const videoSave = await axios.get('https://api.vk.com/method/video.save', {
      params: {
        access_token: vkToken,
        v: '5.199',
        name: `Pinterest ${pinId}`,
        description: pinterestUrl,
        is_private: 1,
        wallpost: 0
      }
    });

    if (videoSave.data.error) {
      throw new Error(videoSave.data.error.error_msg);
    }

    const uploadUrl = videoSave.data.response.upload_url;
    const videoData = fs.readFileSync(tempPath);

    console.log('Uploading to VK...');
    const form = new FormData();
    form.append('video_file', videoData, { filename: 'video.mp4', contentType: 'video/mp4' });

    const uploadRes = await axios.post(uploadUrl, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 120000
    });

    const { owner_id, video_id } = uploadRes.data;

    res.json({
      success: true,
      message: 'Uploaded!',
      vkUrl: `https://vk.com/video${owner_id}_${video_id}`
    });

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message || 'Unknown error' });
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
