const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

let messages = [];

// Endpoint для обработки вебхуков от Телеграм
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
    const chatId = req.body.message.chat.id;
    const text = req.body.message.text;

    // Сохраняем сообщение
    messages.push({ chatId, text });

    // Отправляем ответ Телеграм
    axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: 'Сообщение получено!',
    });

    res.sendStatus(200);
});

// Endpoint для получения сообщений на сайте
app.get('/messages', (req, res) => {
    res.json(messages);
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    setTelegramWebhook();
});

// Устанавливаем вебхук для Телеграм
const setTelegramWebhook = async () => {
    try {
        const url = `https://your-service-name-v8vp.onrender.com/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
        await axios.get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${url}`);
        console.log('Вебхук установлен');
    } catch (error) {
        console.error('Ошибка при установке вебхука:', error);
    }
};
