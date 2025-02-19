require('dotenv').config();

const { TelegramBot, express, http, bodyParser, cookieParser, path, cors, session, WebSocket } = {
  TelegramBot: require('node-telegram-bot-api'),
  express: require('express'),
  http: require('http'),
  bodyParser: require('body-parser'),
  cookieParser: require('cookie-parser'),
  path: require('path'),
  cors: require('cors'),
  session: require('express-session'),
  WebSocket: require('ws')
};

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const port = process.env.PORT || 3000;
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const userMessages = new Map();
const bannedUsers = new Map();
const activeConnections = new Map(); // Map для хранения активных WebSocket-соединений
let lastRespondedUid = null; // Track the last user you responded to

// Разделяем строку идентификаторов чатов на массив
const telegramChatIds = process.env.TELEGRAM_CHAT_ID.split(',').map(id => id.trim());

// Используем CORS middleware для разрешения запросов с других источников
app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Настройка сессий
const sessionParser = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 3600000 // 1 час
  }
});

app.use(sessionParser);

// Функция для генерации короткого UID
const generateShortUid = () => Math.random().toString(36).substr(2, 5);

// Функция для отправки сообщений в Telegram
const sendTelegramMessage = (chatIds, messageText, uid, isFromBot) => {
  console.log(`Sending message to chatIds ${chatIds}, uid: ${uid}, isFromBot: ${isFromBot}`);
  setTimeout(() => {
    chatIds.forEach(chatId => {
      bot.sendMessage(chatId, isFromBot ? messageText : `Пользователь ${uid}: ${messageText}`);
    });
  }, 1000);
};

// Логика блокировки и разблокировки пользователей
const banUser = (uid, duration = 3600000) => {
  const banExpiry = Date.now() + duration;
  bannedUsers.set(uid, banExpiry);
  const banMessage = { text: `Вас забанили на ${duration / 60000} мин.`, fromBot: true, uid };
  
  if (userMessages.has(uid)) {
    userMessages.get(uid).push(banMessage);
  } else {
    userMessages.set(uid, [banMessage]);
  }
  
  // Уведомляем пользователя о бане через WebSocket
  const ws = activeConnections.get(uid);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'message',
      message: banMessage
    }));
  }
};

const unbanUser = (uid) => {
  bannedUsers.delete(uid);
  const unbanMessage = { text: `Вам сняли бан.`, fromBot: true, uid };
  
  if (userMessages.has(uid)) {
    userMessages.get(uid).push(unbanMessage);
  } else {
    userMessages.set(uid, [unbanMessage]);
  }
  
  // Уведомляем пользователя о снятии бана через WebSocket
  const ws = activeConnections.get(uid);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'message',
      message: unbanMessage
    }));
  }
};

const isUserBanned = (uid) => {
  const banExpiry = bannedUsers.get(uid);
  if (!banExpiry || banExpiry < Date.now()) {
    bannedUsers.delete(uid);
    return false;
  }
  return true;
};

// Обработчики команд /ban и /unban
bot.onText(/\/ban/, (msg, match) => {
  const { chat, reply_to_message: reply } = msg;
  if (!reply || !reply.text.startsWith('Пользователь')) return bot.sendMessage(chat.id, 'Используйте эту команду как ответ на сообщение пользователя.');

  const [, uid] = reply.text.match(/^Пользователь ([a-zA-Z0-9-]+):/) || [];
  if (!uid) return bot.sendMessage(chat.id, 'Не удалось извлечь UID пользователя из сообщения.');

  const [, time] = msg.text.split(' ');
  const banTime = parseInt(time) * 60000;
  if (isNaN(banTime) || banTime <= 0) return bot.sendMessage(chat.id, 'Время бана должно быть положительным числом в минутах.');

  banUser(uid, banTime);
  bot.sendMessage(chat.id, `Пользователь UID ${uid} заблокирован на ${time} минут.`);
});

bot.onText(/\/unban/, (msg, match) => {
  const { chat, reply_to_message: reply } = msg;
  if (!reply || !reply.text.startsWith('Пользователь')) return bot.sendMessage(chat.id, 'Используйте эту команду как ответ на сообщение пользователя.');

  const [, uid] = reply.text.match(/^Пользователь ([a-zA-Z0-9-]+):/) || [];
  if (!uid) return bot.sendMessage(chat.id, 'Не удалось извлечь UID пользователя из сообщения.');

  unbanUser(uid);
  bot.sendMessage(chat.id, `Пользователь с UID ${uid} разблокирован.`);
});

// Обработчик сообщений от администраторов через Telegram
bot.on('message', (msg) => {
  const { chat, text } = msg;

  // Пропускаем команды
  if (text && text.startsWith('/')) return;

  // Автоматический ответ последнему пользователю, если нет явного ответа
  if (!msg.reply_to_message && lastRespondedUid) {
    if (userMessages.has(lastRespondedUid)) {
      const newMessage = { text, fromBot: true, uid: lastRespondedUid };
      userMessages.get(lastRespondedUid).push(newMessage);
      console.log(`Auto-reply message sent to last user: ${lastRespondedUid}`);
      
      // Отправляем сообщение через WebSocket, если пользователь в сети
      const ws = activeConnections.get(lastRespondedUid);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'message',
          message: newMessage
        }));
      }
      return;
    }
  }

  // Обработка ответа на конкретного пользователя
  if (msg.reply_to_message && msg.reply_to_message.text && msg.reply_to_message.text.startsWith('Пользователь')) {
    const [, uid] = msg.reply_to_message.text.match(/^Пользователь ([a-zA-Z0-9-]+):/) || [];
    if (uid && userMessages.has(uid)) {
      const newMessage = { text, fromBot: true, uid };
      userMessages.get(uid).push(newMessage);
      lastRespondedUid = uid; // Обновляем последний ответственный UID
      console.log(`Reply message added to list for uid: ${uid}`);
      
      // Отправляем сообщение через WebSocket, если пользователь в сети
      const ws = activeConnections.get(uid);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'message',
          message: newMessage
        }));
      }
    }
  }
});

// WebSocket обработчик подключений
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const uid = url.searchParams.get('uid');
  
  if (!uid) {
    ws.close(1008, 'UID is required');
    return;
  }
  
  console.log(`WebSocket connection established for UID: ${uid}`);
  activeConnections.set(uid, ws);
  
  // Отправляем текущие сообщения пользователю
  if (userMessages.has(uid)) {
    ws.send(JSON.stringify({
      type: 'messages',
      messages: userMessages.get(uid).filter(msg => !msg.text.startsWith('/'))
    }));
  }
  
  // Обработка сообщений от клиента
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'message') {
        if (isUserBanned(uid)) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Вы заблокированы и не можете отправлять сообщения.'
          }));
          return;
        }
        
        const newMessage = { text: data.message, fromBot: false, uid };
        
        if (!userMessages.has(uid)) {
          userMessages.set(uid, []);
        }
        userMessages.get(uid).push(newMessage);
        
        // Отправляем сообщение в Telegram
        sendTelegramMessage(telegramChatIds, data.message, uid, false);
        console.log(`Message from user ${uid} sent to Telegram: ${data.message}`);
        
        // Подтверждаем получение сообщения
        ws.send(JSON.stringify({
          type: 'message',
          message: newMessage
        }));
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });
  
  // Обработка закрытия соединения
  ws.on('close', () => {
    console.log(`WebSocket connection closed for UID: ${uid}`);
    activeConnections.delete(uid);
  });
});

// Обработчик для отправки сообщений от пользователей через HTTP (запасной вариант)
app.post('/send-message', (req, res) => {
  const { message } = req.body;
  const uid = req.session.uid || req.body.uid;

  if (!message) return res.status(400).send('Сообщение не может быть пустым');
  if (!uid) return res.status(400).send('UID не найден');
  if (isUserBanned(uid)) return res.status(403).json({ error: 'Вы заблокированы и не можете отправлять сообщения.' });

  const newMessage = { text: message, fromBot: false, uid };
  
  if (!userMessages.has(uid)) userMessages.set(uid, []);
  userMessages.get(uid).push(newMessage);

  sendTelegramMessage(telegramChatIds, message, uid, false);
  console.log(`Message from user ${uid} sent to Telegram: ${message}`);
  res.send('Сообщение успешно отправлено в Telegram и на сайт!');
});

// Получение сообщений (запасной HTTP метод)
app.get('/get-messages', (req, res) => {
  const uid = req.session.uid;
  if (!uid || !userMessages.has(uid)) return res.json([]);
  res.json(userMessages.get(uid).filter(msg => !msg.text.startsWith('/')));
});

// Главная страница
app.get('/', (req, res) => {
  // Если uid уже существует в сессии, не генерируем новый
  if (!req.session.uid) {
    req.session.uid = generateShortUid();  // Генерация нового uid только при первом посещении
  }
  console.log(`Session UID: ${req.session.uid}`);
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Получение UID из сессии
app.get('/get-uid', (req, res) => {
  if (req.session.uid) {
    return res.json({ uid: req.session.uid });
  }
  req.session.uid = generateShortUid(); // Генерация uid только если его нет
  return res.json({ uid: req.session.uid });
});

// Запуск сервера
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});