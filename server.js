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

async function getPinVideoUrl(pinUrl) {
  // Способ 1: через Pinterest API (публичный, без ключа)
  const pinId = extractPinterestId(pinUrl);
  if (!pinId) throw new Error('Неверная ссылка на Pinterest');

  // Пробуем через публичный embed/oembed
  try {
    const oembedRes = await axios.get(`https://www.pinterest.com/oembed.json?url=${encodeURIComponent(pinUrl)}`, {
      timeout: 10000
    });
    // oembed даёт HTML, но не прямую ссылку на видео
    console.log('oembed:', oembedRes.data);
  } catch (e) {
    console.log('oembed failed, trying next method');
  }

  // Способ 2: парсим страницу Pinterest
  const res = await axios.get(pinUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0'
    },
    timeout: 15000
  });

  const html = res.data;

  // Ищем видео URL в JSON данных страницы
  const jsonMatch = html.match(/<script id="initial-state" type="application\/json">(.+?)<\/script>/);
  if (jsonMatch) {
    const data = JSON.parse(jsonMatch[1]);
    const pins = data?.resourceResponses?.[0]?.response?.data;
    const pin = pins || data?.resources?.data?.[`PinResource:/pin/${pinId}/`];
    
    if (pin?.videos?.video_list) {
      const videos = pin.videos.video_list;
      const best = Object.values(videos).sort((a, b) => (b.width || 0) - (a.width || 0))[0];
      if (best?.url) return best.url;
    }
  }

  // Способ 3: ищем прямую ссылку на видео в HTML
  const videoMatch = html.match(/"url":"(https:\/\/v\.pinimg\.com\/[^"]+\.mp4)"/);
  if (videoMatch) return videoMatch[1].replace(/\\/g, '');

  const videoMatch2 = html.match(/(https:\/\/v\.pinimg\.com\/[^"']+\.mp4)/);
  if (videoMatch2) return videoMatch2[1];

  throw new Error('Не удалось найти видео на странице Pinterest');
}

async function downloadFile(url, outputPath) {
  const res = await axios.get(url, {
    responseType: 'stream',
    timeout: 120000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0',
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
      throw new Error('В {
    {
    "express": "^ "express": "^4.18.2",
    "cors": "^2.8.5",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1"
  }
}

