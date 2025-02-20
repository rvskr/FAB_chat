require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  botToken: process.env.BOT_TOKEN,
  telegramChatIds: process.env.TELEGRAM_CHAT_ID.split(',').map(id => id.trim()),
  clientUrl: process.env.CLIENT_URL,
  sessionSecret: process.env.SESSION_SECRET || 'your-secret-key'
};