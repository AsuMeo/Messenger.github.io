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

function extractPinterestId(url) {
  const pinMatch = url.match(/pinterest\.com\/pin\/(\d+)/);
  return pinMatch ? pinMatch[1] : null;
}

async function resolveShortUrl(shortUrl) {
  try {
    const res = await axios.head(shortUrl, {
      maxRedirects: 5,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return res.request.res.responseUrl || res.headers.location || shortUrl;
  } catch (err) {
    if (err.response && err.response.request.res.responseUrl) {
      return err.response.request.res.responseUrl;
    }
    throw new Error('Не удалось развернуть короткую ссылку');
  }
}

async function getPinVideoUrl(pinUrl) {
  let resolvedUrl = pinUrl;
  
  if (pinUrl.includes('pin.it/')) {
    console.log('Разворачиваю короткую ссылку...');
    resolvedUrl = await resolveShortUrl(pinUrl);
    console.log('Развернуто:', resolvedUrl);
  }

  const pinId = extractPinterestId(resolvedUrl);
  if (!pinId) throw new Error('Неверная ссылка на Pinterest');

  const res = await axios.get(resolvedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive'
    },
    timeout: 15000
  });

  const html = res.data;

  const jsonMatch = html.match(/<script id="initial-state" type="application\/json">(.+?)<\/script>/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const resourceKey = Object.keys(data.resources?.data || {}).find(k => k.includes('/pin/' + pinId + '/'));
      const pin = resourceKey ? data.resources.data[resourceKey] : null;
      
      if (pin?.videos?.video_list) {
        const videos = Object.values(pin.videos.video_list);
        const best = videos.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
        if (best?.url) return best.url;
      }
    } catch (e) {
      console.log('JSON parse failed');
    }
  }

  const videoMatch = html.match(/"url":"(https:\\\/\\\/v\.pinimg\.com\\\/[^"]+\.mp4)"/);
  if (videoMatch) return videoMatch[1].replace(/\\/g, '');

  const videoMatch2 = html.match(/(https:\/\/v\.pinimg\.com\/[^"'\s]+\.mp4)/);
  if (videoMatch2) return videoMatch2[1];

  throw new Error('Не удалось найти видео на Pinterest');
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
    return res.status(400).json({ error: 'Нужна ссылка на Pinterest и токен ВК' });
  }

  const pinId = extractPinterestId(pinterestUrl);
  const tempPath = path.join(__dirname, `temp_${Date.now()}_${pinId || 'video'}.mp4`);

  try {
    console.log('Ищу видео на Pinterest...');
    const videoUrl = await getPinVideoUrl(pinterestUrl);
    console.log('Найдено:', videoUrl);

    console.log('Скачиваю...');
    await downloadFile(videoUrl, tempPath);

    const stats = fs.statSync(tempPath);
    console.log('Размер:', (stats.size / 1024 / 1024).toFixed(2), 'MB');

    if (stats.size > 200 * 1024 * 1024) {
      throw new Error('Видео слишком большое (>200MB)');
    }

    console.log('Получаю сервер ВК...');
    const videoSave = await axios.get('https://api.vk.com/method/video.save', {
      params: {
        access_token: vkToken,
        v: '5.199',
        name: `Pinterest ${pinId || 'video'}`,
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

    console.log('Загружаю на ВК...');
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
      message: 'Видео загружено!',
      vkUrl: `https://vk.com/video${owner_id}_${video_id}`
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Неизвестная ошибка' });
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
