require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());
app.use(express.static('.'));

const activeBots = new Map();

function startBot(token, chatId) {
  const key = `${token}:${chatId}`;
  if (activeBots.has(key)) return activeBots.get(key);

  const bot = new Telegraf(token);

  bot.on('text', async (ctx) => {
    const msg = ctx.message;
    if (msg.chat.id.toString() !== chatId) return;
    if (msg.from.is_bot) return;

    try {
      await ctx.deleteMessage(msg.message_id);
      await ctx.reply(msg.text);
    } catch (e) {
      console.log('Error:', e.message);
    }
  });

  bot.launch();
  activeBots.set(key, bot);
  console.log('Bot started for chat', chatId);
  return bot;
}

app.post('/api/start', (req, res) => {
  const { token, chatId } = req.body;
  if (!token || !chatId) {
    return res.status(400).json({ error: 'Need token and chatId' });
  }

  try {
    startBot(token, chatId);
    res.json({ success: true, message: 'Bot started' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
