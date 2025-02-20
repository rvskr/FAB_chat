const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const { port, clientUrl } = require('./config/config');
const sessionParser = require('./middleware/session');
const setupWebSocket = require('./services/websocket');
const apiRoutes = require('./routes/api');
const { bot } = require('./services/telegram');
const {
  banUser,
  unbanUser,
  userMessages,
  activeConnections,
  setLastRespondedUid,
  getLastRespondedUid,
} = require('./services/userManagement');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: clientUrl, credentials: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(sessionParser);
app.set('trust proxy', 1);
app.use('/', apiRoutes);

setupWebSocket(server, sessionParser);

// Вспомогательная функция для извлечения UID
const extractUid = (msg) => {
  if (msg.text?.startsWith('Пользователь')) return msg.text.match(/^Пользователь ([a-zA-Z0-9-]+):/)?.[1];
  if (msg.caption?.match(/^(Голосовое сообщение|Файл|Фото|Видео) от/)) return msg.caption.match(/от ([a-zA-Z0-9-]+)/)?.[1];
  return null;
};

// Вспомогательная функция для отправки сообщений через WebSocket
const sendToUser = (uid, message, type = 'message') => {
  if (!userMessages.has(uid)) userMessages.set(uid, []);
  userMessages.get(uid).push(message);
  const ws = activeConnections.get(uid);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, message }));
  }
  setLastRespondedUid(uid);
};

// Обработка команд
bot.onText(/\/(ban|unban)/, (msg, match) => {
  const { chat, reply_to_message: reply } = msg;
  if (!reply || !reply.text?.startsWith('Пользователь')) return bot.sendMessage(chat.id, 'Ответьте на сообщение пользователя.');
  const [, uid] = reply.text.match(/^Пользователь ([a-zA-Z0-9-]+):/) || [];
  if (!uid) return bot.sendMessage(chat.id, 'Не удалось извлечь UID.');

  const command = match[1];
  if (command === 'ban') {
    const [, time] = msg.text.split(' ');
    const banTime = parseInt(time) * 60000;
    if (isNaN(banTime) || banTime <= 0) return bot.sendMessage(chat.id, 'Укажите время в минутах.');
    banUser(uid, banTime);
    bot.sendMessage(chat.id, `Пользователь ${uid} заблокирован на ${time} минут.`);
  } else {
    unbanUser(uid);
    bot.sendMessage(chat.id, `Пользователь ${uid} разблокирован.`);
  }
});

// Универсальная обработка всех сообщений
bot.on('message', (msg) => {
  const { chat, text, voice, document, photo, video } = msg;
  if (text?.startsWith('/')) return;

  const replyUid = msg.reply_to_message ? extractUid(msg.reply_to_message) : null;
  const targetUid = replyUid || getLastRespondedUid();

  if (!targetUid || !userMessages.has(targetUid)) {
    if (text && !replyUid) bot.sendMessage(chat.id, 'Пожалуйста, сначала ответьте на сообщение пользователя, чтобы выбрать цель.');
    return;
  }

  if (voice) {
    bot.getFileLink(voice.file_id).then(fileUrl => {
      const message = { type: 'voice', voiceUrl: fileUrl, fromBot: true, uid: targetUid };
      sendToUser(targetUid, message, 'voice');
      if (!replyUid) bot.sendMessage(chat.id, `Голосовое сообщение отправлено пользователю ${targetUid}`);
    });
  } else if (document) {
    bot.getFileLink(document.file_id).then(fileUrl => {
      const message = { type: 'file', fileUrl, filename: document.file_name, fromBot: true, uid: targetUid };
      sendToUser(targetUid, message, 'file');
      if (!replyUid) bot.sendMessage(chat.id, `Файл отправлен пользователю ${targetUid}`);
    });
  } else if (photo) {
    const largestPhoto = photo[photo.length - 1]; // Берем фото максимального размера
    bot.getFileLink(largestPhoto.file_id).then(fileUrl => {
      const message = { type: 'photo', fileUrl, fromBot: true, uid: targetUid };
      sendToUser(targetUid, message, 'photo');
      if (!replyUid) bot.sendMessage(chat.id, `Фото отправлено пользователю ${targetUid}`);
    });
  } else if (video) {
    bot.getFileLink(video.file_id).then(fileUrl => {
      const message = { type: 'video', fileUrl, fromBot: true, uid: targetUid };
      sendToUser(targetUid, message, 'video');
      if (!replyUid) bot.sendMessage(chat.id, `Видео отправлено пользователю ${targetUid}`);
    });
  } else if (text) {
    const message = { text, fromBot: true, uid: targetUid };
    sendToUser(targetUid, message, 'message');
    if (!replyUid) bot.sendMessage(chat.id, `Сообщение отправлено пользователю ${targetUid}`);
  }
});

server.listen(port, () => console.log(`Server is running on port ${port}`));