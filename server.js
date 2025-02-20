require('dotenv').config();
const {
  TelegramBot,
  express,
  http,
  bodyParser,
  cookieParser,
  path,
  cors,
  session,
  WebSocket
} = {
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
const activeConnections = new Map();
let lastRespondedUid = null;

const telegramChatIds = process.env.TELEGRAM_CHAT_ID.split(',').map(id => id.trim());

// Настройка CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000', // Укажите точный URL фронтенда
  credentials: true // Разрешить передачу куки
}));

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Настройка сессий
const sessionParser = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production', // Secure только в продакшене
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // none для кросс-домена в продакшене
    maxAge: 3600000 // 1 час
  }
});

app.use(sessionParser);

const generateShortUid = () => Math.random().toString(36).substr(2, 5);

const sendTelegramMessage = (chatIds, messageText, uid, isFromBot) => {
  setTimeout(() => {
    chatIds.forEach(chatId => {
      bot.sendMessage(chatId, isFromBot ? messageText : `Пользователь ${uid}: ${messageText}`);
    });
  }, 1000);
};

const banUser = (uid, duration = 3600000) => {
  const banExpiry = Date.now() + duration;
  bannedUsers.set(uid, banExpiry);
  const banMessage = { text: `Вас забанили на ${duration / 60000} мин.`, fromBot: true, uid };
  if (userMessages.has(uid)) userMessages.get(uid).push(banMessage);
  else userMessages.set(uid, [banMessage]);

  const ws = activeConnections.get(uid);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'message', message: banMessage }));
  }
};

const unbanUser = (uid) => {
  bannedUsers.delete(uid);
  const unbanMessage = { text: `Вам сняли бан.`, fromBot: true, uid };
  if (userMessages.has(uid)) userMessages.get(uid).push(unbanMessage);
  else userMessages.set(uid, [unbanMessage]);

  const ws = activeConnections.get(uid);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'message', message: unbanMessage }));
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

// Telegram команды
bot.onText(/\/ban/, (msg, match) => {
  const { chat, reply_to_message: reply } = msg;
  if (!reply || !reply.text.startsWith('Пользователь')) return bot.sendMessage(chat.id, 'Ответьте на сообщение пользователя.');
  const [, uid] = reply.text.match(/^Пользователь ([a-zA-Z0-9-]+):/) || [];
  if (!uid) return bot.sendMessage(chat.id, 'Не удалось извлечь UID.');

  const [, time] = msg.text.split(' ');
  const banTime = parseInt(time) * 60000;
  if (isNaN(banTime) || banTime <= 0) return bot.sendMessage(chat.id, 'Укажите время в минутах.');

  banUser(uid, banTime);
  bot.sendMessage(chat.id, `Пользователь ${uid} заблокирован на ${time} минут.`);
});

bot.onText(/\/unban/, (msg, match) => {
  const { chat, reply_to_message: reply } = msg;
  if (!reply || !reply.text.startsWith('Пользователь')) return bot.sendMessage(chat.id, 'Ответьте на сообщение пользователя.');
  const [, uid] = reply.text.match(/^Пользователь ([a-zA-Z0-9-]+):/) || [];
  if (!uid) return bot.sendMessage(chat.id, 'Не удалось извлечь UID.');

  unbanUser(uid);
  bot.sendMessage(chat.id, `Пользователь ${uid} разблокирован.`);
});

bot.on('message', (msg) => {
  const { chat, text } = msg;
  if (text && text.startsWith('/')) return;

  if (!msg.reply_to_message && lastRespondedUid) {
    if (userMessages.has(lastRespondedUid)) {
      const newMessage = { text, fromBot: true, uid: lastRespondedUid };
      userMessages.get(lastRespondedUid).push(newMessage);
      const ws = activeConnections.get(lastRespondedUid);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'message', message: newMessage }));
      }
    }
  }

  if (msg.reply_to_message && msg.reply_to_message.text.startsWith('Пользователь')) {
    const [, uid] = msg.reply_to_message.text.match(/^Пользователь ([a-zA-Z0-9-]+):/) || [];
    if (uid && userMessages.has(uid)) {
      const newMessage = { text, fromBot: true, uid };
      userMessages.get(uid).push(newMessage);
      lastRespondedUid = uid;
      const ws = activeConnections.get(uid);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'message', message: newMessage }));
      }
    }
  }
});

// WebSocket соединение
wss.on('connection', (ws, req) => {
  sessionParser(req, {}, () => {
    const uid = req.session.uid || generateShortUid();
    if (!req.session.uid) {
      req.session.uid = uid;
      req.session.save(); // Сохраняем сессию явно
    }

    activeConnections.set(uid, ws);

    if (userMessages.has(uid)) {
      ws.send(JSON.stringify({
        type: 'messages',
        messages: userMessages.get(uid).filter(msg => !msg.text.startsWith('/'))
      }));
    }

    ws.on('message', (message) => {
      const data = JSON.parse(message);
      if (data.type === 'message') {
        if (isUserBanned(uid)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Вы заблокированы.' }));
          return;
        }
        const newMessage = { text: data.message, fromBot: false, uid };
        if (!userMessages.has(uid)) userMessages.set(uid, []);
        userMessages.get(uid).push(newMessage);
        sendTelegramMessage(telegramChatIds, data.message, uid, false);
        ws.send(JSON.stringify({ type: 'message', message: newMessage }));
      }
    });

    ws.on('close', () => {
      activeConnections.delete(uid);
    });
  });
});

// REST API
app.post('/send-message', (req, res) => {
  const { message } = req.body;
  const uid = req.session.uid || generateShortUid();
  if (!req.session.uid) {
    req.session.uid = uid;
    req.session.save();
  }

  if (!message) return res.status(400).send('Сообщение не может быть пустым');
  if (isUserBanned(uid)) return res.status(403).json({ error: 'Вы заблокированы.' });

  const newMessage = { text: message, fromBot: false, uid };
  if (!userMessages.has(uid)) userMessages.set(uid, []);
  userMessages.get(uid).push(newMessage);

  sendTelegramMessage(telegramChatIds, message, uid, false);
  res.send('Сообщение отправлено!');
});

app.get('/get-messages', (req, res) => {
  const uid = req.session.uid;
  if (!uid || !userMessages.has(uid)) return res.json([]);
  res.json(userMessages.get(uid).filter(msg => !msg.text.startsWith('/')));
});

app.get('/', (req, res) => {
  if (!req.session.uid) {
    req.session.uid = generateShortUid();
    req.session.save();
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/get-uid', (req, res) => {
  if (!req.session.uid) {
    req.session.uid = generateShortUid();
    req.session.save();
  }
  console.log('UID:', req.session.uid); // Логирование для отладки
  res.json({ success: true, uid: req.session.uid });
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});