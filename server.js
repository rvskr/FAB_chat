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

// Маршрут для загрузки файлов
app.post('/upload', (req, res) => {
  sessionParser(req, {}, async () => {
    const uid = req.session.uid;
    if (!uid) return res.status(401).send('Unauthorized');

    const { type, filename, mimeType } = req.body;
    const file = req.files.file;

    if (!userMessages.has(uid)) userMessages.set(uid, []);

    let newMessage;
    switch (type) {
      case 'voice':
        newMessage = { type: 'voice', voiceUrl: file.data.toString('base64'), filename: filename || 'voice.ogg', fromBot: false, uid };
        userMessages.get(uid).push(newMessage);
        await bot.sendVoice(telegramChatIds[0], file.data, { caption: `Голосовое сообщение от ${uid}` });
        break;
      case 'photo':
        newMessage = { type: 'photo', fileUrl: file.data.toString('base64'), filename: filename || 'photo.jpg', fromBot: false, uid };
        userMessages.get(uid).push(newMessage);
        await bot.sendPhoto(telegramChatIds[0], file.data, { caption: `Фото от ${uid}` });
        break;
      case 'video':
        newMessage = { type: 'video', fileUrl: file.data.toString('base64'), filename: filename || 'video.mp4', fromBot: false, uid };
        userMessages.get(uid).push(newMessage);
        await bot.sendVideo(telegramChatIds[0], file.data, { caption: `Видео от ${uid}` });
        break;
      case 'file':
        newMessage = { type: 'file', fileUrl: file.data.toString('base64'), filename: filename || 'file', fromBot: false, uid };
        userMessages.get(uid).push(newMessage);
        await bot.sendDocument(telegramChatIds[0], file.data, { caption: `Файл от ${uid}` });
        break;
    }

    const ws = activeConnections.get(uid);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, message: newMessage }));
    }
    res.sendStatus(200);
  });
});

const extractUid = (msg) => {
  if (msg.text?.startsWith('Пользователь')) return msg.text.match(/^Пользователь ([a-zA-Z0-9-]+):/)?.[1];
  if (msg.caption?.match(/^(Голосовое сообщение|Файл|Фото|Видео) от/)) return msg.caption.match(/от ([a-zA-Z0-9-]+)/)?.[1];
  return null;
};

const sendToUser = async (uid, message, type = 'message') => {
  if (!userMessages.has(uid)) userMessages.set(uid, []);

  if (message.fromBot && message.adminId) {
    try {
      const profilePhotos = await bot.getUserProfilePhotos(message.adminId);
      if (profilePhotos.photos.length > 0) {
        const fileId = profilePhotos.photos[0][0].file_id;
        const file = await bot.getFile(fileId);
        message.photoUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
      }
    } catch (err) {
      console.error('Ошибка получения фото профиля:', err);
    }
  }

  userMessages.get(uid).push(message);
  const ws = activeConnections.get(uid);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, message }));
  }
  setLastRespondedUid(uid);
};

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
      const message = { type: 'voice', voiceUrl: fileUrl, fromBot: true, uid: targetUid, adminId: msg.from.id };
      sendToUser(targetUid, message, 'voice');
      if (!replyUid) bot.sendMessage(chat.id, `Голосовое сообщение отправлено пользователю ${targetUid}`);
    });
  } else if (document) {
    bot.getFileLink(document.file_id).then(fileUrl => {
      const message = { type: 'file', fileUrl, filename: document.file_name, fromBot: true, uid: targetUid, adminId: msg.from.id };
      sendToUser(targetUid, message, 'file');
      if (!replyUid) bot.sendMessage(chat.id, `Файл отправлен пользователю ${targetUid}`);
    });
  } else if (photo) {
    const largestPhoto = photo[photo.length - 1];
    bot.getFileLink(largestPhoto.file_id).then(fileUrl => {
      const message = { type: 'photo', fileUrl, filename: `photo_${Date.now()}.jpg`, fromBot: true, uid: targetUid, adminId: msg.from.id };
      sendToUser(targetUid, message, 'photo');
      if (!replyUid) bot.sendMessage(chat.id, `Фото отправлено пользователю ${targetUid}`);
    });
  } else if (video) {
    bot.getFileLink(video.file_id).then(fileUrl => {
      const message = { type: 'video', fileUrl, filename: `video_${Date.now()}.mp4`, fromBot: true, uid: targetUid, adminId: msg.from.id };
      sendToUser(targetUid, message, 'video');
      if (!replyUid) bot.sendMessage(chat.id, `Видео отправлено пользователю ${targetUid}`);
    });
  } else if (text) {
    const message = { text, fromBot: true, uid: targetUid, adminId: msg.from.id };
    sendToUser(targetUid, message, 'message');
    if (!replyUid) bot.sendMessage(chat.id, `Сообщение отправлено пользователю ${targetUid}`);
  }
});

server.listen(port, () => console.log(`Server is running on port ${port}`));