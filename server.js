require('dotenv').config(); // Подключаем dotenv для загрузки переменных окружения из файла .env (локально)

const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

app.post('/send-message', async (req, res) => {
    const message = req.body.message;

    if (!message) {
        return res.status(400).send('Сообщение не может быть пустым');
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message
            })
        });

        if (response.ok) {
            res.status(200).send('Сообщение отправлено');
        } else {
            res.status(500).send('Ошибка отправки сообщения');
        }
    } catch (error) {
        res.status(500).send('Ошибка отправки сообщения');
    }
});

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});
