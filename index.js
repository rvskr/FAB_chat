// index.js

require('dotenv').config();

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const port = process.env.PORT || 3000;

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

app.set('view engine', 'ejs');

const botToken = process.env.BOT_TOKEN;
const bot = new TelegramBot(botToken, { polling: true });

let userMessages = new Map();

function sendTelegramMessage(chatId, messageText, uid, isFromBot) {
    if (isFromBot) {
        bot.sendMessage(chatId, messageText);
    } else {
        bot.sendMessage(chatId, `Пользователь ${uid}: ${messageText}`);
    }
}

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;
    const uid = uuidv4();

    if (!userMessages.has(uid)) {
        userMessages.set(uid, []);
    }
    userMessages.get(uid).push({ text: messageText, fromBot: true, uid });

    io.to(uid).emit('updateMessages', userMessages.get(uid));
});

// Обработка цитирования сообщений от бота
bot.on('text', (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;

    // Проверяем, содержит ли сообщение указание на цитирование
    if (msg.reply_to_message && msg.reply_to_message.text.startsWith('Пользователь')) {
        const quotedMessageText = msg.reply_to_message.text;

        // Используем регулярное выражение для извлечения uid из текста
        const regex = /^Пользователь ([a-zA-Z0-9-]+):/;
        const match = quotedMessageText.match(regex);

        if (match) {
            const uid = match[1]; // Получаем uid из регулярного выражения
            userMessages.get(uid).push({ text: messageText, fromBot: true, uid });
            io.to(uid).emit('updateMessages', userMessages.get(uid));


            console.log(`Ответ отправлен пользователю ${uid}: ${messageText}`);
        } else {
            console.log('Не удалось извлечь uid из цитированного сообщения:', quotedMessageText);
        }
    }
});

app.post('/send-message', (req, res) => {
    const messageText = req.body.message;
    const uid = req.cookies.uid || uuidv4();

    if (!userMessages.has(uid)) {
        userMessages.set(uid, []);
    }
    userMessages.get(uid).push({ text: messageText, fromBot: false, uid });

    bot.sendMessage(process.env.TELEGRAM_CHAT_ID, `Пользователь ${uid}: ${messageText}`);

    io.to(uid).emit('updateMessages', userMessages.get(uid));

    res.cookie('uid', uid, { maxAge: 900000, httpOnly: true });

    res.send('Сообщение успешно отправлено в Telegram и на сайт!');

    console.log(`Сообщение от пользователя ${uid} отправлено в Telegram: ${messageText}`);
});

app.get('/', (req, res) => {
    const uid = req.cookies.uid || uuidv4();

    if (!userMessages.has(uid)) {
        userMessages.set(uid, []);
    }

    res.render('index', { messages: userMessages.get(uid), uid });
});

io.on('connection', (socket) => {
    console.log('Пользователь подключился к сокету');
    const uid = socket.handshake.query.uid;

    if (uid) {
        socket.join(uid);
        socket.emit('updateMessages', userMessages.get(uid) || []);
    }
});

server.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});
