require('dotenv').config();

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser'); // Для обработки POST запросов

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const port = process.env.PORT || 3000;

// Указываем Express использовать EJS
app.set('view engine', 'ejs');

// Токен вашего телеграм-бота
const botToken = process.env.BOT_TOKEN;

// Создаем экземпляр бота
const bot = new TelegramBot(botToken, { polling: true });

// Массив для хранения сообщений
let messages = [];

// Обработка входящих сообщений от бота
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;

    // Сохраняем сообщение в массиве
    messages.push({ text: messageText, fromBot: true });

    // Отправляем обновленные данные на клиент через Socket.io
    io.emit('updateMessages', messages);

    // Для примера, отправляем эхо-ответ обратно в чат
    bot.sendMessage(chatId, `Вы сказали: ${messageText}`);
});

// Обработка отправки сообщения от пользователя на сайте
app.use(bodyParser.urlencoded({ extended: true }));
app.post('/send-message', (req, res) => {
    const messageText = req.body.message;

    // Отправляем сообщение в Telegram бота
    bot.sendMessage(process.env.TELEGRAM_CHAT_ID, messageText);

    // Добавляем сообщение в массив для отображения на сайте
    messages.push({ text: messageText, fromBot: false });

    // Отправляем обновленные данные на клиент через Socket.io
    io.emit('updateMessages', messages);

    // Отправляем подтверждение клиенту
    res.send('Сообщение успешно отправлено в Telegram и на сайт!');
});

// Настройка маршрута для вашего сайта
app.get('/', (req, res) => {
    res.render('index', { messages: messages });
});

// Настройка сокета для обновления данных на клиенте
io.on('connection', (socket) => {
    console.log('Пользователь подключился к сокету');
    
    // Отправляем начальные данные при подключении
    socket.emit('updateMessages', messages);
});

// Запуск сервера
server.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});
