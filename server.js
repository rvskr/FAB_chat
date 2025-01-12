require('dotenv').config();

const { TelegramBot, express, http, bodyParser, cookieParser, path } = {
  TelegramBot: require('node-telegram-bot-api'),
  express: require('express'),
  http: require('http'),
  bodyParser: require('body-parser'),
  cookieParser: require('cookie-parser'),
  path: require('path')
};

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const userMessages = new Map();
const bannedUsers = new Map();
let lastRespondedUid = null; // Track the last user you responded to

// Разделяем строку идентификаторов чатов на массив
const telegramChatIds = process.env.TELEGRAM_CHAT_ID.split(',').map(id => id.trim());

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

const generateShortUid = () => Math.random().toString(36).substr(2, 5);

const sendTelegramMessage = (chatIds, messageText, uid, isFromBot) => {
  console.log(`Sending message to chatIds ${chatIds}, uid: ${uid}, isFromBot: ${isFromBot}`);
  setTimeout(() => {
    chatIds.forEach(chatId => {
      bot.sendMessage(chatId, isFromBot ? messageText : `Пользователь ${uid}: ${messageText}`);
    });
  }, 1000);
};

const banUser = (uid, duration = 3600000) => {
  const banExpiry = Date.now() + duration;
  bannedUsers.set(uid, banExpiry);
  if (userMessages.has(uid)) userMessages.get(uid).push({ text: `Вас забанили на ${duration / 60000} мин.`, fromBot: true, uid });
};

const unbanUser = (uid) => {
  bannedUsers.delete(uid);
  if (userMessages.has(uid)) userMessages.get(uid).push({ text: `Вам сняли бан.`, fromBot: true, uid });
};

const isUserBanned = (uid) => {
  const banExpiry = bannedUsers.get(uid);
  if (!banExpiry || banExpiry < Date.now()) {
    bannedUsers.delete(uid);
    return false;
  }
  return true;
};

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

// Modified message handler to automatically reply to the last user
bot.on('message', (msg) => {
  const { chat, text } = msg;
  
  // Skip if it's a command
  if (text.startsWith('/')) return;
  
  // If there's no explicit reply, use the last responded user
  if (!msg.reply_to_message && lastRespondedUid) {
    if (userMessages.has(lastRespondedUid)) {
      userMessages.get(lastRespondedUid).push({ text, fromBot: true, uid: lastRespondedUid });
      console.log(`Auto-reply message sent to last user: ${lastRespondedUid}`);
      return;
    }
  }
  
  // If it's a reply to a specific user, handle it normally and update lastRespondedUid
  if (msg.reply_to_message && msg.reply_to_message.text.startsWith('Пользователь')) {
    const [, uid] = msg.reply_to_message.text.match(/^Пользователь ([a-zA-Z0-9-]+):/) || [];
    if (uid && userMessages.has(uid)) {
      userMessages.get(uid).push({ text, fromBot: true, uid });
      lastRespondedUid = uid; // Update the last responded user
      console.log(`Reply message added to list for uid: ${uid}`);
    }
  }
});

app.post('/send-message', (req, res) => {
  const { message } = req.body;
  let uid = req.cookies.uid || (req.cookies.uid = generateShortUid());

  if (!message) return res.status(400).send('Сообщение не может быть пустым');
  if (isUserBanned(uid)) return res.status(403).json({ error: 'Вы заблокированы и не можете отправлять сообщения.' });

  if (!userMessages.has(uid)) userMessages.set(uid, []);
  userMessages.get(uid).push({ text: message, fromBot: false, uid });

  sendTelegramMessage(telegramChatIds, message, uid, false);
  console.log(`Message from user ${uid} sent to Telegram: ${message}`);
  res.send('Сообщение успешно отправлено в Telegram и на сайт!');
});

app.get('/get-messages', (req, res) => {
  const uid = req.cookies.uid;
  if (!uid || !userMessages.has(uid)) return res.json([]);
  res.json(userMessages.get(uid).filter(msg => !msg.text.startsWith('/')));
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);

  const interval = 15 * 60 * 1000;
  const makeRequest = (url) => {
    const protocol = url.startsWith('https') ? require('https') : require('http');
    protocol.get(url, () => console.log(`Scheduled task executed successfully at ${new Date().toLocaleString()}`))
      .on('error', (err) => console.error('Error executing scheduled task:', err));
  };

  const PUBLIC_URL = process.env.RENDER ? 'https://fab-chat.onrender.com/' : `http://localhost:${port}/`;
  setInterval(() => makeRequest(PUBLIC_URL), interval);
});