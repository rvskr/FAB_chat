require('dotenv').config();
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
const multer = require('multer');

const app = express();
const server = http.createServer(app);

const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_ID.split(',').map(id => id.trim());

app.use(cors({
  origin: clientUrl,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(sessionParser);
app.set('trust proxy', 1);
app.use('/', apiRoutes);

setupWebSocket(server, sessionParser);

const upload = multer({ storage: multer.memoryStorage() });

const extractUid = (msg) => {
  if (msg.text?.startsWith('Пользователь')) return msg.text.match(/^Пользователь ([a-zA-Z0-9-]+):/)?.[1];
  if (msg.caption?.match(/^(Голосовое сообщение|Файл|Фото|Видео) от/)) return msg.caption.match(/от ([a-zA-Z0-9-]+)/)?.[1];
  return null;
};

const getAdminAvatar = async (adminId) => {
  try {
    const photos = await bot.getUserProfilePhotos(adminId);
    if (photos.total_count > 0) {
      const fileId = photos.photos[0][0].file_id;
      const fileLink = await bot.getFileLink(fileId);
      return fileLink;
    }
    return null;
  } catch (error) {
    console.error('Ошибка получения аватара администратора:', error);
    return null;
  }
};

const sendToUser = async (uid, message, type = 'message') => {
  if (!userMessages.has(uid)) userMessages.set(uid, []);
  userMessages.get(uid).push(message);

  if (message.fromBot) {
    const adminId = message.adminId;
    if (adminId) {
      const avatarUrl = await getAdminAvatar(adminId);
      message.adminAvatar = avatarUrl;
    }
  }

  const ws = activeConnections.get(uid);
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log(`Отправка сообщения типу ${type} пользователю ${uid}`);
    ws.send(JSON.stringify({ type, message }));
  } else {
    console.log(`Пользователь ${uid} не подключен`);
  }
  setLastRespondedUid(uid);
};

// Endpoint для загрузки файлов
app.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  const uid = req.body.uid;
  const type = req.body.type;

  if (!file || !uid) {
    return res.status(400).json({ error: 'Файл или UID отсутствует' });
  }

  if (!userMessages.has(uid)) userMessages.set(uid, []);

  const message = {
    type,
    [type]: file.buffer.toString('base64'),
    filename: file.originalname,
    fromBot: false,
    uid
  };

  userMessages.get(uid).push(message);

  // Отправка в Telegram в зависимости от типа
  TELEGRAM_CHAT_IDS.forEach(chatId => {
    if (type === 'photo') {
      bot.sendPhoto(chatId, file.buffer, {
        caption: `Пользователь ${uid}: Фото - ${file.originalname}`
      }).catch(err => console.error(`Ошибка отправки фото в чат ${chatId}:`, err));
    } else if (type === 'video') {
      bot.sendVideo(chatId, file.buffer, {
        filename: file.originalname,
        caption: `Пользователь ${uid}: Видео - ${file.originalname}`
      }).catch(err => console.error(`Ошибка отправки видео в чат ${chatId}:`, err));
    } else { // 'file'
      bot.sendDocument(chatId, file.buffer, {
        filename: file.originalname,
        caption: `Пользователь ${uid}: Файл - ${file.originalname}`
      }).catch(err => console.error(`Ошибка отправки файла в чат ${chatId}:`, err));
    }
  });

  sendToUser(uid, message, type);

  res.json({ success: true, filename: file.originalname });
});

bot.onText(/\/(ban|unban)/, (msg, match) => {
  const { chat, reply_to_message: reply } = msg;
  if (!reply || !reply.text?.startsWith('Пользователь')) {
    return bot.sendMessage(chat.id, 'Ответьте на сообщение пользователя.');
  }
  const [, uid] = reply.text.match(/^Пользователь ([a-zA-Z0-9-]+):/) || [];
  if (!uid) return bot.sendMessage(chat.id, 'Не удалось извлечь UID.');

  const command = match[1];
  if (command === 'ban') {
    const [, time] = msg.text.split(' ');
    const banTime = parseInt(time) * 60000;
    if (isNaN(banTime) || banTime <= 0) return bot.sendMessage(chat.id, 'Укажите время в минутах.');
    banUser(uid, banTime);
    TELEGRAM_CHAT_IDS.forEach(chatId => {
      bot.sendMessage(chatId, `Пользователь ${uid} заблокирован на ${time} минут.`);
    });
  } else {
    unbanUser(uid);
    TELEGRAM_CHAT_IDS.forEach(chatId => {
      bot.sendMessage(chatId, `Пользователь ${uid} разблокирован.`);
    });
  }
});

bot.on('message', async (msg) => {
  const { chat, from, text, voice, document, photo, video } = msg;
  if (text?.startsWith('/')) return;

  const replyUid = msg.reply_to_message ? extractUid(msg.reply_to_message) : null;
  const targetUid = replyUid || getLastRespondedUid();

  if (!targetUid || !userMessages.has(targetUid)) {
    if (text && !replyUid) {
      bot.sendMessage(chat.id, 'Пожалуйста, сначала ответьте на сообщение пользователя, чтобы выбрать цель.');
    }
    return;
  }

  const adminId = from.id;

  if (voice) {
    bot.getFileLink(voice.file_id).then(fileUrl => {
      const message = { type: 'voice', voiceUrl: fileUrl, fromBot: true, uid: targetUid, adminId };
      sendToUser(targetUid, message, 'voice');
      if (!replyUid) {
        TELEGRAM_CHAT_IDS.forEach(chatId => {
          bot.sendMessage(chatId, `Голосовое сообщение отправлено пользователю ${targetUid}`);
        });
      }
    }).catch(err => console.error('Ошибка получения ссылки на голосовое:', err));
  } else if (document) {
    bot.getFileLink(document.file_id).then(fileUrl => {
      const message = { type: 'file', fileUrl, filename: document.file_name, fromBot: true, uid: targetUid, adminId };
      sendToUser(targetUid, message, 'file');
      if (!replyUid) {
        TELEGRAM_CHAT_IDS.forEach(chatId => {
          bot.sendMessage(chatId, `Файл отправлен пользователю ${targetUid}`);
        });
      }
    }).catch(err => console.error('Ошибка получения ссылки на файл:', err));
  } else if (photo) {
    const largestPhoto = photo[photo.length - 1];
    bot.getFileLink(largestPhoto.file_id).then(fileUrl => {
      const message = { type: 'photo', fileUrl, fromBot: true, uid: targetUid, adminId };
      sendToUser(targetUid, message, 'photo');
      if (!replyUid) {
        TELEGRAM_CHAT_IDS.forEach(chatId => {
          bot.sendMessage(chatId, `Фото отправлено пользователю ${targetUid}`);
        });
      }
    }).catch(err => console.error('Ошибка получения ссылки на фото:', err));
  } else if (video) {
    bot.getFileLink(video.file_id).then(fileUrl => {
      const message = { type: 'video', fileUrl, fromBot: true, uid: targetUid, adminId };
      sendToUser(targetUid, message, 'video');
      if (!replyUid) {
        TELEGRAM_CHAT_IDS.forEach(chatId => {
          bot.sendMessage(chatId, `Видео отправлено пользователю ${targetUid}`);
        });
      }
    }).catch(err => console.error('Ошибка получения ссылки на видео:', err));
  } else if (text) {
    const message = { text, fromBot: true, uid: targetUid, adminId };
    sendToUser(targetUid, message, 'message');
    if (!replyUid) {
      TELEGRAM_CHAT_IDS.forEach(chatId => {
        bot.sendMessage(chatId, `Сообщение отправлено пользователю ${targetUid}`);
      });
    }
  }
});

server.listen(port, () => console.log(`Server is running on port ${port}`));