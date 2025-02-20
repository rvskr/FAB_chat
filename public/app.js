$(document).ready(function() {
    const chatContainer = $('#chat-container');
    const openChatButton = $('#open-chat-button');
    const fullscreenButton = $('#fullscreen-button');
    const recordButton = $('#record-button');
    const stopButton = $('#stop-button');
    const mediaButton = $('#media-button');
    const recordStatus = $('#record-status');
    const previewContainer = $('#preview-container');
    const previewAudio = $('#preview-audio');
    const sendVoiceButton = $('#send-voice-button');
    const deleteVoiceButton = $('#delete-voice-button');
    let isFullscreen = false;
    let socket;
    let mediaRecorder;
    let audioChunks = [];
    let recordTimer;
    let recordSeconds = 0;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 5000;

    const serverUrl = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
        ? 'ws://127.0.0.1:3000'
        : 'wss://1abc-178-136-106-132.ngrok-free.app';

    chatContainer.hide();
    openChatButton.show();
    previewContainer.hide();

    const supportedMimeTypes = ['audio/ogg; codecs=opus', 'audio/webm; codecs=opus', 'audio/webm', 'audio/mp4'];
    const recordingMimeType = supportedMimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
    console.log('Выбранный MIME-тип для записи:', recordingMimeType);

    function connectWebSocket() {
        if (socket && socket.readyState === WebSocket.OPEN) return;
        socket = new WebSocket(serverUrl);

        socket.onopen = function() {
            console.log('WebSocket соединение установлено');
            reconnectAttempts = 0;
            fetchMessages();
        };

        socket.onmessage = function(event) {
            const data = JSON.parse(event.data);
            if (data.type === 'messages') updateMessages(data.messages);
            else if (data.type === 'message') appendMessage(data.message);
            else if (data.type === 'voice') appendVoice(data.message);
            else if (data.type === 'file') appendFile(data.message);
            else if (data.type === 'photo') appendPhoto(data.message);
            else if (data.type === 'video') appendVideo(data.message);
            else if (data.type === 'error') alert(data.message);
        };

        socket.onclose = function(event) {
            console.log('WebSocket соединение закрыто', { code: event.code, reason: event.reason });
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                console.log(`Попытка переподключения ${reconnectAttempts}/${maxReconnectAttempts} через ${reconnectDelay} мс...`);
                setTimeout(connectWebSocket, reconnectDelay);
            } else {
                console.error('Превышено максимальное количество попыток переподключения');
                alert('Потеряно соединение с сервером. Пожалуйста, обновите страницу.');
            }
        };

        socket.onerror = function(error) {
            console.error('WebSocket ошибка:', error);
        };
    }

    function fetchMessages() {
        $.ajax({
            url: `${serverUrl.replace('ws', 'http').replace('wss', 'https')}/get-messages`,
            method: 'GET',
            xhrFields: { withCredentials: true },
            success: function(messages) { updateMessages(messages); },
            error: function(err) { console.error('Ошибка получения сообщений:', err); }
        });
    }

    function createMessageElement(message) {
        return $('<li>')
            .addClass('chat-message')
            .addClass(message.fromBot ? 'bot-message' : 'user-message')
            .text(`${message.fromBot ? 'Администратор: ' : 'Пользователь: '}${message.text}`);
    }

    function createVoiceElement(message) {
        const li = $('<li>').addClass('chat-message').addClass(message.fromBot ? 'bot-message' : 'user-message');
        const audio = $('<audio controls>').attr('src', message.voiceUrl || `data:audio/ogg;base64,${message.voice}`);
        li.append(`${message.fromBot ? 'Администратор: ' : 'Пользователь: '}`).append(audio);
        return li;
    }

    function createFileElement(message) {
        const li = $('<li>').addClass('chat-message').addClass(message.fromBot ? 'bot-message' : 'user-message');
        const link = $('<a>').attr('href', message.fileUrl || `data:application/octet-stream;base64,${message.file}`).attr('download', message.filename).text(message.filename);
        li.append(`${message.fromBot ? 'Администратор: ' : 'Пользователь: '}`).append(link);
        return li;
    }

    function createPhotoElement(message) {
        const li = $('<li>').addClass('chat-message').addClass(message.fromBot ? 'bot-message' : 'user-message');
        const img = $('<img>').attr('src', message.fileUrl || `data:image/jpeg;base64,${message.file}`);
        li.append(`${message.fromBot ? 'Администратор: ' : 'Пользователь: '}`).append(img);
        return li;
    }

    function createVideoElement(message) {
        const li = $('<li>').addClass('chat-message').addClass(message.fromBot ? 'bot-message' : 'user-message');
        const video = $('<video controls>').attr('src', message.fileUrl || `data:video/mp4;base64,${message.file}`);
        li.append(`${message.fromBot ? 'Администратор: ' : 'Пользователь: '}`).append(video);
        return li;
    }

    function appendMessage(message) { $('#messages-list').append(createMessageElement(message)).scrollTop($('#messages-list')[0].scrollHeight); }
    function appendVoice(message) { $('#messages-list').append(createVoiceElement(message)).scrollTop($('#messages-list')[0].scrollHeight); }
    function appendFile(message) { $('#messages-list').append(createFileElement(message)).scrollTop($('#messages-list')[0].scrollHeight); }
    function appendPhoto(message) { $('#messages-list').append(createPhotoElement(message)).scrollTop($('#messages-list')[0].scrollHeight); }
    function appendVideo(message) { $('#messages-list').append(createVideoElement(message)).scrollTop($('#messages-list')[0].scrollHeight); }

    function updateMessages(newMessages) {
        const messagesList = $('#messages-list');
        messagesList.empty();
        newMessages.forEach(message => {
            if (message.type === 'voice') messagesList.append(createVoiceElement(message));
            else if (message.type === 'file') messagesList.append(createFileElement(message));
            else if (message.type === 'photo') messagesList.append(createPhotoElement(message));
            else if (message.type === 'video') messagesList.append(createVideoElement(message));
            else messagesList.append(createMessageElement(message));
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
        connectWebSocket();
    });

    $('#close-chat-button').click(function() {
        chatContainer.removeClass('fullscreen').hide();
        openChatButton.show();
        isFullscreen = false;
        fullscreenButton.find('i').removeClass('fa-compress').addClass('fa-expand');
        if (socket) socket.close();
    });

    recordButton.click(function() {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') startRecording();
    });

    stopButton.click(function() { stopRecording(); });

    function startRecording() {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                mediaRecorder = new MediaRecorder(stream, { mimeType: recordingMimeType });
                audioChunks = [];
                mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: recordingMimeType });
                    const audioUrl = URL.createObjectURL(audioBlob);
                    previewAudio.attr('src', audioUrl);
                    previewContainer.show();
                    console.log('Формат записи:', audioBlob.type, 'Размер:', audioBlob.size);
                    stream.getTracks().forEach(track => track.stop());
                };
                mediaRecorder.start();
                recordButton.addClass('recording');
                stopButton.show();
                recordSeconds = 0;
                recordStatus.text('00:00').addClass('active');
                recordTimer = setInterval(() => {
                    recordSeconds++;
                    const minutes = Math.floor(recordSeconds / 60).toString().padStart(2, '0');
                    const seconds = (recordSeconds % 60).toString().padStart(2, '0');
                    recordStatus.text(`${minutes}:${seconds}`);
                }, 1000);
            })
            .catch(err => {
                console.error('Ошибка доступа к микрофону:', err);
                alert('Не удалось получить доступ к микрофону. Проверьте разрешения.');
            });
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            recordButton.removeClass('recording');
            stopButton.hide();
            recordStatus.text('').removeClass('active');
            clearInterval(recordTimer);
        }
    }

    sendVoiceButton.click(function() {
        const audioBlob = new Blob(audioChunks, { type: recordingMimeType });
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'voice', voice: base64, mimeType: recordingMimeType }));
            }
            previewContainer.hide();
            URL.revokeObjectURL(previewAudio.attr('src'));
        };
        reader.readAsDataURL(audioBlob);
    });

    deleteVoiceButton.click(function() {
        previewContainer.hide();
        URL.revokeObjectURL(previewAudio.attr('src'));
        audioChunks = [];
    });

    mediaButton.click(function() { $('#media-input').click(); });

    $('#media-input').change(function() {
        const file = this.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                let type = 'file';
                if (file.type.startsWith('image/')) type = 'photo';
                else if (file.type.startsWith('video/')) type = 'video';
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type, [type]: base64, filename: file.name }));
                }
                this.value = '';
            };
            reader.readAsDataURL(file);
        }
    });

    $('#message-form').submit(function(event) {
        event.preventDefault();
        const messageInput = $('#message-input');
        const messageText = messageInput.val().trim();
        if (messageText && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'message', message: messageText }));
            messageInput.val('');
        }
    });

    $.ajax({
        url: `${serverUrl.replace('ws', 'http').replace('wss', 'https')}/get-uid`,
        method: 'GET',
        xhrFields: { withCredentials: true },
        success: function(response) {
            $('#uid-input').val(response.uid);
            console.log('UID получен:', response.uid);
            if (chatContainer.is(':visible')) connectWebSocket();
        }
    });
});

const recordButton = document.getElementById("record-button");
const stopButton = document.getElementById("stop-button");
const chatContainer = document.getElementById("chat-container");

recordButton.addEventListener("click", () => {
    chatContainer.classList.add("recording"); // Скрываем текстовое поле
    stopButton.style.display = "block";
    recordButton.style.display = "none";
});

stopButton.addEventListener("click", () => {
    chatContainer.classList.remove("recording"); // Показываем обратно
    stopButton.style.display = "none";
    recordButton.style.display = "block";
});
