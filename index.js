// index.js

require('dotenv').config();

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid'); // Для генерации уникальных идентификаторов

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const port = process.env.PORT || 3000;

app.use(cookieParser()); // Используем cookie-parser для работы с cookies
app.use(bodyParser.urlencoded({ extended: true }));

// Установка шаблонизатора EJS
app.set('view engine', 'ejs');

// Инициализация Telegram бота
const botToken = process.env.BOT_TOKEN;
const bot = new TelegramBot(botToken, { polling: true });

// Хранилище сообщений
let messages = [];

// Функция для отправки сообщения в Telegram с указанием UID
function sendTelegramMessage(chatId, messageText, uid, isFromBot) {
    if (isFromBot) {
        bot.sendMessage(chatId, messageText);
    } else {
        bot.sendMessage(chatId, `Пользователь ${uid}: ${messageText}`);
    }
}

// Обработчик сообщений от Telegram бота
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;

    const uid = uuidv4(); // Генерируем уникальный идентификатор

    messages.push({ text: messageText, fromBot: true, uid });

    io.emit('updateMessages', messages); // Отправляем обновленные данные на клиент через Socket.io

    sendTelegramMessage(chatId, messageText, uid, true); // Отправляем сообщение в Telegram с UID
});

// Обработчик отправки сообщения с сайта в Telegram
app.post('/send-message', (req, res) => {
    const messageText = req.body.message;

    const uid = req.cookies.uid || uuidv4(); // Если у пользователя нет UID, генерируем новый

    bot.sendMessage(process.env.TELEGRAM_CHAT_ID, `Пользователь ${uid}: ${messageText}`);

    messages.push({ text: messageText, fromBot: false, uid });

    io.emit('updateMessages', messages);

    // Устанавливаем cookie с UID
    res.cookie('uid', uid, { maxAge: 900000, httpOnly: true }); // Время жизни 15 минут (900000 мс)

    res.send('Сообщение успешно отправлено в Telegram и на сайт!');
});

// Отображение главной страницы
app.get('/', (req, res) => {
    const uid = req.cookies.uid || uuidv4(); // Если у пользователя нет UID, генерируем новый

    res.render('index', { messages, uid });
});

// Настройка Socket.io
io.on('connection', (socket) => {
    console.log('Пользователь подключился к сокету');
    socket.emit('updateMessages', messages);
});

// Запуск сервера
server.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});
