require('dotenv').config();

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid'); // Для генерации уникальных идентификаторов

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');

const botToken = process.env.BOT_TOKEN;
const bot = new TelegramBot(botToken, { polling: true });

let messages = {}; // Используем объект для хранения сообщений с uid

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;
    const uid = uuidv4(); // Генерируем уникальный идентификатор

    messages[uid] = { text: messageText, fromBot: true, uid }; // Добавляем сообщение с uid

    io.emit('updateMessages', Object.values(messages)); // Отправляем обновленные данные на клиент через Socket.io

    bot.sendMessage(chatId, `Вы сказали: ${messageText}`);
});

app.use(bodyParser.urlencoded({ extended: true }));
app.post('/send-message', (req, res) => {
    const messageText = req.body.message;
    const uid = uuidv4(); // Генерируем уникальный идентификатор

    bot.sendMessage(process.env.TELEGRAM_CHAT_ID, messageText);

    messages[uid] = { text: messageText, fromBot: false, uid }; // Добавляем сообщение с uid

    io.emit('updateMessages', Object.values(messages));

    res.send('Сообщение успешно отправлено в Telegram и на сайт!');
});

app.get('/', (req, res) => {
    res.render('index', { messages: Object.values(messages) }); // Передаем массив значений сообщений на клиент
});

io.on('connection', (socket) => {
    console.log('Пользователь подключился к сокету');
    socket.emit('updateMessages', Object.values(messages)); // Отправляем начальные данные при подключении
});

server.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});
