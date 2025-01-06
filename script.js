// Редирект если необходимо
if (window.location.href === 'https://rvskr.github.io/FAB_chat/') {
    window.location.href = 'https://your-service-name-v8vp.onrender.com/';
}

// Вспомогательные функции для работы с cookies
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

function generateShortUid() {
    return Math.random().toString(36).substr(2, 5);
}

// Функция debounce для предотвращения частых обновлений
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Функция для сравнения сообщений
function areMessagesEqual(msg1, msg2) {
    return msg1.text === msg2.text && msg1.fromBot === msg2.fromBot;
}

// Функция для создания элемента сообщения
function createMessageElement(message) {
    return $('<li>')
        .addClass('chat-message')
        .addClass(message.fromBot ? 'bot-message' : 'user-message')
        .text(`${message.fromBot ? 'Администратор: ' : 'Пользователь: '}${message.text}`);
}

// Функция для обновления списка сообщений
function updateMessages(newMessages) {
    const messagesList = $('#messages-list');
    const currentMessages = messagesList.children().map(function() {
        const el = $(this);
        const text = el.text();
        const isBot = el.hasClass('bot-message');
        const messageText = text.replace(isBot ? 'Администратор: ' : 'Пользователь: ', '');
        return {
            text: messageText,
            fromBot: isBot
        };
    }).get();

    // Проверяем, нужно ли обновлять сообщения
    if (currentMessages.length === newMessages.length &&
        newMessages.every((msg, idx) => areMessagesEqual(msg, currentMessages[idx]))) {
        return;
    }

    // Находим, сколько сообщений нужно добавить
    const startIdx = currentMessages.length;

    // Добавляем только новые сообщения
    for (let i = startIdx; i < newMessages.length; i++) {
        const messageElement = createMessageElement(newMessages[i]);
        messagesList.append(messageElement);
    }

    // Прокручиваем к последнему сообщению только если добавились новые
    if (startIdx < newMessages.length) {
        messagesList.scrollTop(messagesList[0].scrollHeight);
    }
}

// Функция получения сообщений с debounce
const debouncedFetch = debounce(() => {
    $.get('https://your-service-name-v8vp.onrender.com/get-messages', function(data) {
        updateMessages(data);
    });
}, 300);

function pollMessages() {
    debouncedFetch();
    setTimeout(pollMessages, 2000);
}

// Инициализация при загрузке страницы
$(document).ready(function() {
    const chatContainer = $('#chat-container');
    const openChatButton = $('#open-chat-button');
    const fullscreenButton = $('#fullscreen-button');
    let isFullscreen = false;

    // Убедимся, что чат изначально скрыт
    chatContainer.hide();
    openChatButton.show();

    // Обработка полноэкранного режима
    fullscreenButton.click(function() {
        isFullscreen = !isFullscreen;
        chatContainer.toggleClass('fullscreen');
        $(this).find('i').toggleClass('fa-expand fa-compress');
    });

    // Открытие чата
    openChatButton.click(function() {
        chatContainer.show();
        $(this).hide();
        debouncedFetch(); // Обновляем сообщения при открытии
    });

    // Закрытие чата
    $('#close-chat-button').click(function() {
        chatContainer.removeClass('fullscreen').hide();
        openChatButton.show();
        isFullscreen = false;
        fullscreenButton.find('i').removeClass('fa-compress').addClass('fa-expand');
    });

    // Инициализация uid
    let uid = getCookie('uid') || generateShortUid();
    document.cookie = `uid=${uid}; max-age=3600; path=/`;
    $('#uid-input').val(uid);

    // Обработка отправки сообщений
    $('#message-form').submit(function(event) {
        event.preventDefault();
        const messageInput = $('#message-input');
        const messageText = messageInput.val().trim();

        if (messageText) {
            $.post('https://your-service-name-v8vp.onrender.com/send-message', 
                { message: messageText, uid: uid },
                function(response) {
                    messageInput.val('');
                    debouncedFetch(); // Используем debounced версию при отправке
                }
            );
        }
    });

    // Запуск опроса сообщений
    pollMessages();
});
