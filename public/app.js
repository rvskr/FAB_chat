// Client-side WebSocket implementation
$(document).ready(function() {
    const chatContainer = $('#chat-container');
    const openChatButton = $('#open-chat-button');
    const fullscreenButton = $('#fullscreen-button');
    let isFullscreen = false;
    let socket;
    
    // Получение актуального URL сервера
    const serverUrl = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
        ? 'ws://127.0.0.1:3000' // Локальный WebSocket сервер
        : 'wss://fab-chat.onrender.com'; // Продакшн WebSocket сервер
    
    chatContainer.hide();
    openChatButton.show();
    
    // Функция для подключения к WebSocket
    function connectWebSocket(uid) {
        // Закрываем существующее соединение, если оно есть
        if (socket) {
            socket.close();
        }
        
        // Создаем новое WebSocket соединение с UID
        socket = new WebSocket(`${serverUrl}/ws?uid=${uid}`);
        
        socket.onopen = function() {
            console.log('WebSocket соединение установлено');
        };
        
        socket.onmessage = function(event) {
            const data = JSON.parse(event.data);
            if (data.type === 'messages') {
                updateMessages(data.messages);
            } else if (data.type === 'message') {
                // Добавление одного нового сообщения
                const messagesList = $('#messages-list');
                const messageElement = createMessageElement(data.message);
                messagesList.append(messageElement);
                messagesList.scrollTop(messagesList[0].scrollHeight);
            }
        };
        
        socket.onclose = function() {
            console.log('WebSocket соединение закрыто');
            // Попробуем восстановить соединение через 5 секунд
            setTimeout(() => connectWebSocket(uid), 5000);
        };
        
        socket.onerror = function(error) {
            console.error('WebSocket ошибка:', error);
        };
    }
    
    // Создание элемента для сообщения
    function createMessageElement(message) {
        return $('<li>')
            .addClass('chat-message')
            .addClass(message.fromBot ? 'bot-message' : 'user-message')
            .text(`${message.fromBot ? 'Администратор: ' : 'Пользователь: '}${message.text}`);
    }
    
    // Обновление списка сообщений
    function updateMessages(newMessages) {
        const messagesList = $('#messages-list');
        messagesList.empty();
        
        newMessages.forEach(message => {
            const messageElement = createMessageElement(message);
            messagesList.append(messageElement);
        });
        
        messagesList.scrollTop(messagesList[0].scrollHeight);
    }
    
    fullscreenButton.click(function() {
        isFullscreen = !isFullscreen;
        chatContainer.toggleClass('fullscreen');
        $(this).find('i').toggleClass('fa-expand fa-compress');
    });
    
    openChatButton.click(function() {
        chatContainer.show();
        $(this).hide();
        // Если UID уже есть, подключаемся к WebSocket
        const uid = $('#uid-input').val();
        if (uid) {
            connectWebSocket(uid);
        }
    });
    
    $('#close-chat-button').click(function() {
        chatContainer.removeClass('fullscreen').hide();
        openChatButton.show();
        isFullscreen = false;
        fullscreenButton.find('i').removeClass('fa-compress').addClass('fa-expand');
        // Закрываем WebSocket при закрытии чата
        if (socket) {
            socket.close();
        }
    });
    
    // Получение UID с сервера
    $.ajax({
        url: `${serverUrl.replace('ws', 'http').replace('wss', 'https')}/get-uid`,
        method: 'GET',
        xhrFields: {
            withCredentials: true
        },
        success: function(data) {
            const uid = data.uid;
            console.log(`ℹ️ Установленный UID: ${uid}`);
            $('#uid-input').val(uid);
            
            // Подключаемся к WebSocket если чат уже открыт
            if (chatContainer.is(':visible')) {
                connectWebSocket(uid);
            }
        },
        error: function(error) {
            console.error('Ошибка при получении UID:', error);
        }
    });
    
    // Отправка сообщения
    $('#message-form').submit(function(event) {
        event.preventDefault();
        const messageInput = $('#message-input');
        const messageText = messageInput.val().trim();
        const uid = $('#uid-input').val();
        
        if (messageText && uid && socket && socket.readyState === WebSocket.OPEN) {
            // Отправляем сообщение через WebSocket
            socket.send(JSON.stringify({
                type: 'message',
                message: messageText,
                uid: uid
            }));
            messageInput.val('');
        } else if (messageText && uid) {
            // Если WebSocket не подключен, используем AJAX как запасной вариант
            $.ajax({
                url: `${serverUrl.replace('ws', 'http').replace('wss', 'https')}/send-message`,
                method: 'POST',
                data: { message: messageText, uid: uid },
                xhrFields: {
                    withCredentials: true
                },
                success: function() {
                    messageInput.val('');
                    // Пробуем переподключиться к WebSocket
                    connectWebSocket(uid);
                }
            });
        }
    });
    
    // Проверка, открыт ли чат при загрузке страницы
    if (chatContainer.is(':visible')) {
        const uid = $('#uid-input').val();
        if (uid) {
            connectWebSocket(uid);
        }
    }
});
