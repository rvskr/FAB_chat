require('dotenv').config();

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();

const port = process.env.PORT || 3000;

app.use(cookieParser());
app.use(bodyParser.json()); // Используем json парсер для обработки вебхуков

const botToken = process.env.BOT_TOKEN;
const bot = new TelegramBot(botToken);

let userMessages = new Map();

// Функция для генерации короткого UID
function generateShortUid() {
    return Math.random().toString(36).substr(2, 5); // генерируем строку из 5 символов
}

// Функция для отправки сообщения в Telegram
function sendTelegramMessage(chatId, messageText, uid, isFromBot) {
    console.log(`Sending message to chatId ${chatId}, uid: ${uid}, isFromBot: ${isFromBot}`);
    setTimeout(() => {
        if (isFromBot) {
            bot.sendMessage(chatId, messageText);
        } else {
            bot.sendMessage(chatId, `Пользователь ${uid}: ${messageText}`);
        }
    }, 1000);
}

// Маршрут для обработки вебхуков от Telegram
app.post(`/bot${botToken}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Маршрут для отправки сообщения от пользователя
app.post('/send-message', (req, res) => {
    const messageText = req.body.message;
    let uid = req.cookies.uid;

    if (!uid) {
        uid = generateShortUid();
        res.cookie('uid', uid, { maxAge: 900000, httpOnly: true });
    }

    if (!messageText) {
        return res.status(400).send('Сообщение не может быть пустым');
    }

    if (!userMessages.has(uid)) {
        userMessages.set(uid, []);
    }
    userMessages.get(uid).push({ text: messageText, fromBot: false, uid });

    // Отправляем сообщение в Telegram
    sendTelegramMessage(process.env.TELEGRAM_CHAT_ID, messageText, uid, false);

    console.log(`Message from user ${uid} sent to Telegram: ${messageText}`);
    res.send('Сообщение успешно отправлено в Telegram и на сайт!');
});

// Маршрут для получения сообщений пользователя
app.get('/get-messages', (req, res) => {
    const uid = req.cookies.uid;

    if (!uid || !userMessages.has(uid)) {
        return res.json([]);
    }

    res.json(userMessages.get(uid));
});

// Маршрут для отображения index.html из корня проекта
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Устанавливаем вебхуки
const webhookUrl = `https://your-service-name-v8vp.onrender.com/bot${botToken}`; // Замените на ваш реальный URL
bot.setWebHook(webhookUrl);

// Запускаем сервер
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
