require('dotenv').config();

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

const port = process.env.PORT || 3000;

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

app.set('view engine', 'ejs');

const botToken = process.env.BOT_TOKEN;
const bot = new TelegramBot(botToken, { polling: true });

let userMessages = new Map();

function sendTelegramMessage(chatId, messageText, uid, isFromBot) {
    console.log(`Sending message to chatId ${chatId}, uid: ${uid}, isFromBot: ${isFromBot}`);
    setTimeout(() => {
        if (isFromBot) {
            bot.sendMessage(chatId, messageText);
        } else {
            bot.sendMessage(chatId, `Пользователь ${uid}: ${messageText}`);
        }
    }, 1000); // задержка 1 секунда перед отправкой
}

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;
    const uid = uuidv4();

    console.log(`Received message from Telegram: ${messageText}, chatId: ${chatId}`);

    if (!userMessages.has(uid)) {
        userMessages.set(uid, []);
    }
    userMessages.get(uid).push({ text: messageText, fromBot: true, uid });
});

// Обработка цитирования сообщений от бота
bot.on('text', (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;

    if (msg.reply_to_message && msg.reply_to_message.text.startsWith('Пользователь')) {
        const quotedMessageText = msg.reply_to_message.text;
        console.log(`Detected reply to message: ${quotedMessageText}`);

        const regex = /^Пользователь ([a-zA-Z0-9-]+):/;
        const match = quotedMessageText.match(regex);

        if (match) {
            const uid = match[1];
            userMessages.get(uid).push({ text: messageText, fromBot: true, uid });
            console.log(`Reply message added to list for uid: ${uid}`);
        } else {
            console.log('Failed to extract uid from quoted message:', quotedMessageText);
        }
    }
});

app.post('/send-message', (req, res) => {
    const messageText = req.body.message;
    const uid = req.cookies.uid || uuidv4();

    if (!messageText) {
        return res.status(400).send('Сообщение не может быть пустым');
    }

    if (!userMessages.has(uid)) {
        userMessages.set(uid, []);
    }
    userMessages.get(uid).push({ text: messageText, fromBot: false, uid });

    sendTelegramMessage(process.env.TELEGRAM_CHAT_ID, messageText, uid, false);

    res.cookie('uid', uid, { maxAge: 900000, httpOnly: true });
    console.log(`Message from user ${uid} sent to Telegram: ${messageText}`);

    res.send('Сообщение успешно отправлено в Telegram и на сайт!');
});

app.get('/get-messages', (req, res) => {
    const uid = req.cookies.uid || uuidv4();


    if (!userMessages.has(uid)) {
        userMessages.set(uid, []);
    }

    res.json(userMessages.get(uid));
});

app.get('/', (req, res) => {
    const uid = req.cookies.uid || uuidv4();

    console.log(`Rendering index page for uid: ${uid}`);

    if (!userMessages.has(uid)) {
        userMessages.set(uid, []);
    }

    res.render('index', { messages: userMessages.get(uid), uid });
});

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
