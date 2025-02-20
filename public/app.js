$(document).ready(function() {
    const $chatContainer = $('#chat-container'),
          $openChatButton = $('#open-chat-button'),
          $fullscreenButton = $('#fullscreen-button'),
          $recordButton = $('#record-button'),
          $stopButton = $('#stop-button'),
          $mediaButton = $('#media-button'),
          $recordStatus = $('#record-status'),
          $previewContainer = $('#preview-container'),
          $previewAudio = $('#preview-audio'),
          $sendVoiceButton = $('#send-voice-button'),
          $deleteVoiceButton = $('#delete-voice-button'),
          $messagesList = $('#messages-list'),
          $messageForm = $('#message-form'),
          $messageInput = $('#message-input'),
          $mediaInput = $('#media-input'),
          $uidInput = $('#uid-input'),
          serverWsUrl = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' ? 'ws://127.0.0.1:3000' : 'wss://fab-chat.onrender.com',
          serverHttpUrl = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' ? 'http://127.0.0.1:3000' : 'https://fab-chat.onrender.com/',
          supportedMimeTypes = ['audio/ogg; codecs=opus', 'audio/webm; codecs=opus', 'audio/webm', 'audio/mp4'],
          recordingMimeType = supportedMimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';

    let isFullscreen = false,
        socket,
        mediaRecorder,
        audioChunks = [],
        recordTimer,
        recordSeconds = 0,
        reconnectAttempts = 0,
        pendingUploads = new Map(),
        maxReconnectAttempts = 5,
        reconnectDelay = 5000;

    console.log('Выбранный MIME-тип для записи:', recordingMimeType);

    $chatContainer.addClass('hidden');
    $openChatButton.show();

    function connectWebSocket() {
        if (socket && socket.readyState === WebSocket.OPEN) return;
        socket = new WebSocket(serverWsUrl);

        socket.onopen = () => {
            console.log('WebSocket соединение установлено');
            reconnectAttempts = 0;
            fetchMessages();
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'messages') updateMessages(data.messages);
            else appendMessage(data.type, data.message);
        };

        socket.onclose = (event) => {
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

        socket.onerror = (error) => console.error('WebSocket ошибка:', error);
    }

    function fetchMessages() {
        $.ajax({
            url: `${serverHttpUrl}/get-messages`,
            method: 'GET',
            xhrFields: { withCredentials: true },
            success: updateMessages,
            error: (err) => console.error('Ошибка получения сообщений:', err)
        });
    }

    function createDownloadLink(url, filename, label) {
        return $('<a>')
            .addClass('download-link')
            .text(label || 'Скачать')
            .click((e) => {
                e.preventDefault();
                if (confirm(`Скачать ${filename || 'файл'}?`)) {
                    $(e.target).addClass('downloading');
                    downloadFile(url, filename);
                    setTimeout(() => $(e.target).removeClass('downloading'), 1000);
                }
            });
    }

    function addProfileIcon(header, message) {
        if (message.fromBot && message.photoUrl) {
            header.append($('<img>').attr('src', message.photoUrl).css({ width: '30px', height: '30px', borderRadius: '50%' }));
        } else {
            header.append($('<span>').addClass(`profile-placeholder ${message.fromBot ? 'admin' : 'user'}`).text(message.fromBot ? 'A' : 'U'));
        }
    }

    function createMessage(type, message, isPending = false) {
        const li = $('<li>').addClass('chat-message').addClass(message.fromBot ? 'bot-message' : 'user-message').addClass(type),
              header = $('<div>').addClass('message-header'),
              content = $('<div>').addClass('message-content');

        addProfileIcon(header, message);
        header.append(message.fromBot ? 'Администратор' : 'Пользователь');
        li.append(header);

        if (isPending) {
            content.append(`<span class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></span> ${message.filename || 'Голосовое сообщение'}`);
        } else {
            switch (type) {
                case 'message':
                    content.text(message.text);
                    break;
                case 'voice':
                    content.empty()
                           .append($('<audio controls>').attr('src', message.voiceUrl || `data:audio/ogg;base64,${message.voice}`))
                           .append(' ')
                           .append(createDownloadLink(message.voiceUrl || `data:audio/ogg;base64,${message.voice}`, message.filename || 'voice.ogg'));
                    break;
                case 'file':
                    content.append(createDownloadLink(message.fileUrl || `data:application/octet-stream;base64,${message.file}`, message.filename || 'file', message.filename));
                    break;
                case 'photo':
                    content.append($('<img>').attr('src', message.fileUrl || `data:image/jpeg;base64,${message.file}`))
                           .append(' ')
                           .append(createDownloadLink(message.fileUrl || `data:image/jpeg;base64,${message.file}`, message.filename || 'photo.jpg'));
                    break;
                case 'video':
                    content.append($('<video controls>').attr('src', message.fileUrl || `data:video/mp4;base64,${message.file}`))
                           .append(' ')
                           .append(createDownloadLink(message.fileUrl || `data:video/mp4;base64,${message.file}`, message.filename || 'video.mp4'));
                    break;
            }
        }
        return li.append(content);
    }

    function appendMessage(type, message) {
        if (type === 'voice' && message.fromBot === false) {
            const pending = Array.from(pendingUploads.values()).reverse().find(li => 
                li.hasClass('voice') && li.hasClass('user-message')
            );
            if (pending) {
                const key = Array.from(pendingUploads.entries()).find(([k, v]) => v === pending)[0];
                pending.find('.message-content').empty().append(
                    $('<audio controls>').attr('src', message.voiceUrl || `data:audio/ogg;base64,${message.voice}`),
                    ' ',
                    createDownloadLink(message.voiceUrl || `data:audio/ogg;base64,${message.voice}`, message.filename || 'voice.ogg')
                );
                pendingUploads.delete(key);
                $messagesList.scrollTop($messagesList[0].scrollHeight);
                return;
            }
        }
        const key = `${type}-${message.filename || message.file || Date.now()}`,
              pending = pendingUploads.get(key);
        if (pending) {
            const newContent = createMessage(type, message).find('.message-content');
            pending.find('.message-content').empty().append(newContent.contents());
            pendingUploads.delete(key);
        } else {
            $messagesList.append(createMessage(type, message)).scrollTop($messagesList[0].scrollHeight);
        }
    }

    function updateMessages(messages) {
        $messagesList.empty().append(messages.map(msg => createMessage(msg.type, msg))).scrollTop($messagesList[0].scrollHeight);
    }

    function downloadFile(url, filename) {
        const a = $('<a>').attr({ href: url, download: filename }).appendTo('body');
        a[0].click();
        a.remove();
    }

    $fullscreenButton.click(() => {
        isFullscreen = !isFullscreen;
        $chatContainer.toggleClass('fullscreen');
        $fullscreenButton.find('i').toggleClass('fa-expand fa-compress');
        if (!isFullscreen) $chatContainer.removeClass('hidden');
    });

    $openChatButton.click(() => {
        $chatContainer.removeClass('hidden');
        $openChatButton.hide();
        connectWebSocket();
    });

    $('#close-chat-button').click(() => {
        if (isFullscreen) {
            isFullscreen = false;
            $chatContainer.removeClass('fullscreen');
        }
        $chatContainer.addClass('hidden');
        $openChatButton.show();
        if (socket) socket.close();
    });

    $recordButton.click(() => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') startRecording();
    });

    $stopButton.click(stopRecording);

    function startRecording() {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                mediaRecorder = new MediaRecorder(stream, { mimeType: recordingMimeType });
                audioChunks = [];
                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: recordingMimeType });
                    $previewAudio.attr('src', URL.createObjectURL(audioBlob));
                    $previewContainer.show();
                    stream.getTracks().forEach(track => track.stop());
                };
                mediaRecorder.start();
                $recordButton.addClass('recording');
                $stopButton.show();
                recordSeconds = 0;
                $recordStatus.text('00:00').addClass('active');
                recordTimer = setInterval(() => {
                    recordSeconds++;
                    const minutes = Math.floor(recordSeconds / 60).toString().padStart(2, '0');
                    const seconds = (recordSeconds % 60).toString().padStart(2, '0');
                    $recordStatus.text(`${minutes}:${seconds}`);
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
            $recordButton.removeClass('recording');
            $stopButton.hide();
            $recordStatus.text('').removeClass('active');
            clearInterval(recordTimer);
        }
    }

    $sendVoiceButton.click(() => {
        const audioBlob = new Blob(audioChunks, { type: recordingMimeType });
        const key = `voice-user-${Date.now()}`,
              tempLi = createMessage('voice', { filename: 'voice.ogg' }, true);
        $messagesList.append(tempLi).scrollTop($messagesList[0].scrollHeight);
        pendingUploads.set(key, tempLi);

        const formData = new FormData();
        formData.append('type', 'voice');
        formData.append('file', audioBlob, 'voice.ogg');
        formData.append('mimeType', recordingMimeType);

        $.ajax({
            url: `${serverHttpUrl}/upload`,
            method: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            xhrFields: { withCredentials: true },
            success: () => console.log('Голосовое сообщение загружено'),
            error: (err) => console.error('Ошибка загрузки голосового сообщения:', err)
        });

        $previewContainer.hide();
        URL.revokeObjectURL($previewAudio.attr('src'));
    });

    $deleteVoiceButton.click(() => {
        $previewContainer.hide();
        URL.revokeObjectURL($previewAudio.attr('src'));
        audioChunks = [];
    });

    $mediaButton.click(() => $mediaInput.click());

    $mediaInput.change(function() {
        const file = this.files[0];
        if (!file) return;
        const type = file.type.startsWith('image/') ? 'photo' : file.type.startsWith('video/') ? 'video' : 'file',
              key = `${type}-${file.name}`,
              tempLi = createMessage(type, { filename: file.name }, true);
        $messagesList.append(tempLi).scrollTop($messagesList[0].scrollHeight);
        pendingUploads.set(key, tempLi);

        const formData = new FormData();
        formData.append('type', type);
        formData.append('file', file);
        formData.append('filename', file.name);

        $.ajax({
            url: `${serverHttpUrl}/upload`,
            method: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            xhrFields: { withCredentials: true },
            success: () => console.log(`Медиафайл загружен: ${file.name}`),
            error: (err) => console.error('Ошибка загрузки медиафайла:', err)
        });

        this.value = '';
    });

    $messageForm.submit((event) => {
        event.preventDefault();
        const messageText = $messageInput.val().trim();
        if (messageText && socket && socket.readyState === WebSocket.OPEN) {
            console.log('Отправка текстового сообщения:', messageText);
            socket.send(JSON.stringify({ type: 'message', message: messageText }));
            $messageInput.val('');
        }
    });

    $.ajax({
        url: `${serverHttpUrl}/get-uid`,
        method: 'GET',
        xhrFields: { withCredentials: true },
        success: (response) => {
            $uidInput.val(response.uid);
            console.log('UID получен:', response.uid);
            if (!$chatContainer.hasClass('hidden')) connectWebSocket();
        }
    });
});