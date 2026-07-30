require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const PORT = process.env.PORT || 3000;

// Скачивание видео через yt-dlp
function downloadVideo(url, outputPath) {
  return new Promise((resolve, reject) => {
    const cmd = `yt-dlp -f "best[height<=720][filesize<100M]" --no-playlist -o "${outputPath}" "${url}"`;
    exec(cmd, { timeout: 300000 }, (err) => {
      if (err) reject(err);
      else resolve(outputPath);
    });
  });
}

// API: загрузка видео на ВК
app.post('/api/upload', async (req, res) => {
  const { youtubeUrl, vkToken } = req.body;
  
  if (!youtubeUrl || !vkToken) {
    return res.status(400).json({ error: 'Нужна ссылка и токен ВК' });
  }

  const videoId = youtubeUrl.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1] || 'video';
  const tempPath = path.join(__dirname, `temp_${Date.now()}_${videoId}.mp4`);

  try {
    // 1. Скачиваем видео
    console.log('Скачиваю...');
    await downloadVideo(youtubeUrl, tempPath);

    // 2. Получаем сервер загрузки ВК
    const videoSave = await axios.get('https://api.vk.com/method/video.save', {
      params: {
        access_token: vkToken,
        v: '5.199',
        name: `YouTube ${videoId}`,
        description: youtubeUrl,
        is_private: 1,
        wallpost: 0
      }
    });

    if (videoSave.data.error) {
      throw new Error(videoSave.data.error.error_msg);
    }

    const uploadUrl = videoSave.data.response.upload_url;
    const videoData = fs.readFileSync(tempPath);

    // 3. Загружаем видео на сервер ВК
    console.log('Загружаю на ВК...');
    const form = new FormData();
    form.append('video_file', videoData, { filename: 'video.mp4', contentType: 'video/mp4' });

    const uploadRes = await axios.post(uploadUrl, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    // 4. Видео загружено, получаем owner_id и video_id
    const { owner_id, video_id } = uploadRes.data;

    res.json({
      success: true,
      message: 'Видео загружено!',
      vkUrl: `https://vk.com/video${owner_id}_${video_id}`,
      owner_id,
      video_id
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Server on port ${PORT}`));

