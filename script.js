const telegramBotToken = "6923582894:AAHuYGsJuKLsKCcVccnN8kbsdRzC8vTiFVE";
const chatId = "558625598"; 
class FirebaseManager {
    constructor() {
        // Инициализация Firebase
        firebase.initializeApp({
            apiKey: "AIzaSyC04K2xwoat05QTXxJeb9f-hYXcjUBae0A",
            authDomain: "simple-blog-ayojxo.firebaseapp.com",
            projectId: "simple-blog-ayojxo",
            storageBucket: "simple-blog-ayojxo.appspot.com",
            messagingSenderId: "504207144426",
            appId: "1:504207144426:web:e9be92cff23c73b5056e93",
            databaseURL: "https://simple-blog-ayojxo-default-rtdb.europe-west1.firebasedatabase.app" 
        });

        this.auth = firebase.auth();
        this.database = firebase.database();
        this.lastMessageSentFromSite = ''; // Переменная для хранения последнего сообщения, отправленного с сайта
    }

    async registerAnonymousUser() {
        try {
            const currentUser = this.auth.currentUser;

            if (!currentUser || !currentUser.isAnonymous) {
                await this.auth.signInAnonymously();
                return true;
            }

            return false; // Пользователь уже анонимно аутентифицирован
        } catch (error) {
            console.error('Ошибка регистрации анонимного пользователя:', error);
            return false;
        }
    }

    isUserRegistered() {
        const currentUser = this.auth.currentUser;
        return currentUser && currentUser.isAnonymous;
    }

    async sendMessage(message, repliedMessageUID, recipientUID) {
        try {
            const currentUser = this.auth.currentUser;
    
            if (!currentUser) {
                console.error('Пользователь не аутентифицирован.');
                return;
            }
    
            // Формируем путь к сообщениям текущего пользователя
            const userMessagesRef = this.database.ref('users').child(currentUser.uid).child('messages');
    
            // Записываем сообщение в Realtime Database
            const messageData = {
                uid: currentUser.uid, // Добавляем UID пользователя в сообщение
                message: message,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };
    
            // Если есть цитируемое сообщение, добавляем его UID
            if (repliedMessageUID) {
                messageData.repliedMessageUID = repliedMessageUID;
            }
    
            await userMessagesRef.push(messageData);
    
            console.log('Сообщение успешно отправлено в Realtime Database.');
    
            // Отправляем сообщение в Telegram
            await this.sendTelegramMessage(`UID: ${currentUser.uid}\n${message}`);
    
            // Обновляем сообщения на странице, только если это сообщение адресовано конкретному пользователю
            if (recipientUID) {
                console.log('Отмечаем сообщение как отправленное');
                this.updateMessagesOnPage(message, recipientUID, true); // Помечаем сообщение как отправленное
            }
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
        }
    }

    async sendTelegramMessage(message) {
        try {
            const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message
                })
            });

            const responseData = await response.json();
            if (!responseData.ok) {
                throw new Error(responseData.description);
            }

            console.log('Сообщение успешно отправлено в Telegram.');
        } catch (error) {
            console.error('Ошибка отправки сообщения в Telegram:', error);
        }
    }

    async getOffset(uid) {
        try {
            const offsetSnapshot = await this.database.ref(`users/${uid}/offset`).once('value');
            return offsetSnapshot.val() || 0; // Возвращаем значение offset или 0, если его нет
        } catch (error) {
            console.error('Ошибка получения сдвига для пользователя с UID', uid, ':', error);
            return 0; // Возвращаем 0 в случае ошибки
        }
    }

    async setOffset(uid, offset) {
        try {
            await this.database.ref(`users/${uid}`).update({ offset });
            console.log('Сдвиг для пользователя с UID', uid, 'успешно обновлен:', offset);
        } catch (error) {
            console.error('Ошибка обновления сдвига для пользователя с UID', uid, ':', error);
        }
    }
}

const firebaseManager = new FirebaseManager();

window.addEventListener('load', async () => {
    if (!firebaseManager.isUserRegistered()) {
        await firebaseManager.registerAnonymousUser();
    }
});

document.getElementById('messageForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const messageInput = document.getElementById('messageInput').value.trim();
    if (messageInput !== '') {
        const newMessageElement = document.createElement('div');
        newMessageElement.textContent = `Вы отправили: ${messageInput}`;
        newMessageElement.classList.add('message', 'sent-message'); // Добавляем классы сообщению
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.appendChild(newMessageElement);

        document.getElementById('messageInput').value = '';
        
        // Отправляем сообщение через FirebaseManager
        await firebaseManager.sendMessage(messageInput);
    }
});

document.getElementById('messageInput').addEventListener('keypress', async (event) => {
    if (event.key === 'Enter') {
        event.preventDefault(); // Предотвращаем стандартное поведение формы (отправку по Enter)
        const messageInput = document.getElementById('messageInput').value.trim();
        if (messageInput !== '') {
            const newMessageElement = document.createElement('div');
            newMessageElement.textContent = `Вы отправили: ${messageInput}`;
            newMessageElement.classList.add('message', 'sent-message'); // Добавляем классы сообщению
            const messagesContainer = document.getElementById('messagesContainer');
            messagesContainer.appendChild(newMessageElement);

            document.getElementById('messageInput').value = '';

            // Отправляем сообщение через FirebaseManager
            await firebaseManager.sendMessage(messageInput);
        }
    }
});

function scrollToBottom() {
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

const messagesObserver = new MutationObserver((mutationsList, observer) => {
    mutationsList.forEach((mutation) => {
        if (mutation.type === 'childList') {
            scrollToBottom(); // Прокручиваем вниз при добавлении нового элемента
        }
    });
});

const messagesContainer = document.getElementById('messagesContainer');
messagesObserver.observe(messagesContainer, { childList: true });

const openChatButton = document.getElementById('openChatButton');
const closeChatButton = document.getElementById('closeChatButton');
const chatContainer = document.querySelector('.chat-container');

openChatButton.addEventListener('click', () => {
    chatContainer.style.display = 'block';
});

closeChatButton.addEventListener('click', () => {
    chatContainer.style.display = 'none';
});

class TelegramBot {
    constructor(token, uid) {
        this.token = token;
        this.uid = uid;
        this.offset = 0;
        this.isPolling = false; // Флаг, указывающий, выполняется ли процесс получения обновлений
    }

    async startPolling() {
        // Проверяем, выполняется ли уже процесс получения обновлений
        if (this.isPolling) {
            console.log('Процесс получения обновлений уже запущен.');
            return;
        }

        // Устанавливаем флаг, что процесс получения обновлений начался
        this.isPolling = true;

        try {
            // Начинаем получение обновлений
            await this.fetchUpdates();
        } catch (error) {
            console.error('Ошибка при запуске Long Polling для пользователя с UID', this.uid, ':', error);
        } finally {
            // Сбрасываем флаг после завершения процесса получения обновлений
            this.isPolling = false;
        }
    }
    async fetchUpdates() {
        try {
            const response = await fetch(`https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.offset}&timeout=30`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
    
            if (response.status === 409) {
                console.log('Конфликт при получении обновлений. Попробуйте снова позже.');
                return;
            }
    
            const responseData = await response.json(); // Прочитать ответ только один раз
            if (responseData.ok) {
                const updates = responseData.result;
                if (updates.length > 0) {
                    updates.forEach(update => {
                        // Обработка обновлений
                    });
    
                    // Обновляем оффсет
                    this.offset = updates[updates.length - 1].update_id + 1;
                }
            }
        } catch (error) {
            console.error('Ошибка при выполнении Long Polling для пользователя с UID', this.uid, ':', error);
        } finally {
            // Повторно запускаем получение обновлений
            if (this.isPolling) {
                setTimeout(() => this.fetchUpdates(), 500); // Повторный запрос с небольшой задержкой
            }
        }
    }
    
    async updateOffset() {
        // Реализуйте обновление сдвига (offset) в базе данных Firebase или другом механизме управления сдвигом
    }

    // Добавьте методы для обновления сообщений на странице, если это необходимо
}

// Создаем экземпляр класса TelegramBot и запускаем процесс получения обновлений
const telegramBot = new TelegramBot(telegramBotToken, chatId);
telegramBot.startPolling();