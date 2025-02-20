$(document).ready(function() {
    const elements = {
        chatContainer: $('#chat-container'),
        openChatButton: $('#open-chat-button'),
        fullscreenButton: $('#fullscreen-button'),
        recordButton: $('#record-button'),
        stopButton: $('#stop-button'),
        mediaButton: $('#media-button'),
        recordStatus: $('#record-status'),
        previewContainer: $('#preview-container'),
        previewAudio: $('#preview-audio'),
        sendVoiceButton: $('#send-voice-button'),
        deleteVoiceButton: $('#delete-voice-button'),
        messagesList: $('#messages-list')
    };
    
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
        : 'wss://wigtlfdkpc.loclx.io';
    const httpServerUrl = serverUrl.replace('ws', 'http').replace('wss', 'https');

    elements.chatContainer.hide();
    elements.openChatButton.show();
    elements.previewContainer.hide();

    const supportedMimeTypes = ['audio/ogg; codecs=opus', 'audio/webm; codecs=opus', 'audio/webm', 'audio/mp4'];
    const recordingMimeType = supportedMimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';

    function connectWebSocket() {
        if (socket && socket.readyState === WebSocket.OPEN) return;
        socket = new WebSocket(serverUrl);

        socket.onopen = function() {
            reconnectAttempts = 0;
            fetchMessages();
        };

        socket.onmessage = function(event) {
            const data = JSON.parse(event.data);
            if (data.type === 'messages') updateMessages(data.messages);
            else if (['message', 'voice', 'file', 'photo', 'video'].includes(data.type)) {
                appendContent(data.type, data.message);
            }
            else if (data.type === 'error') alert(data.message);
        };

        socket.onclose = function(event) {
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                setTimeout(connectWebSocket, reconnectDelay);
            } else {
                alert('Потеряно соединение с сервером. Пожалуйста, обновите страницу.');
            }
        };
    }

    function fetchMessages() {
        $.ajax({
            url: `${httpServerUrl}/get-messages`,
            method: 'GET',
            xhrFields: { withCredentials: true },
            success: updateMessages,
            error: function(err) { console.error('Ошибка получения сообщений:', err); }
        });
    }

    // Создание элементов сообщений унифицировано
    function createMessageElement(message, contentCreator) {
        const li = $('<li>').addClass('chat-message').addClass(message.fromBot ? 'bot-message' : 'user-message');
        const header = $('<div>').addClass('message-header');
        const content = $('<div>').addClass('message-content');
        
        if (contentCreator) contentCreator(content, message);
        
        if (message.fromBot) {
            const avatar = message.adminAvatar ? 
                $('<img>').addClass('profile-avatar').attr('src', message.adminAvatar) :
                $('<div>').addClass('profile-placeholder admin').text('A');
            header.append(avatar).append('Администратор');
        } else {
            header.append($('<div>').addClass('profile-placeholder user').text('U')).append('Пользователь');
        }
        
        li.append(header).append(content);
        return li;
    }

    // Создатели контента для разных типов сообщений
    const contentCreators = {
        message: (content, message) => content.text(message.text),
        voice: (content, message) => {
            content.append($('<audio controls>').attr('src', message.voiceUrl || `data:audio/ogg;base64,${message.voice}`));
        },
        file: (content, message) => {
            const link = $('<a>')
                .addClass('download-link')
                .text(message.filename)
                .data('url', message.fileUrl || `data:application/octet-stream;base64,${message.file}`)
                .data('filename', message.filename);
            const spinner = $('<span>').addClass('loading-spinner').hide();
            content.append(link).append(spinner);
        },
        photo: (content, message) => {
            content.append($('<img>').attr('src', message.fileUrl || `data:image/jpeg;base64,${message.photo || ''}`));
        },
        video: (content, message) => {
            content.append($('<video controls>').attr('src', message.fileUrl || `data:video/mp4;base64,${message.video || ''}`));
        }
    };

    // Обобщенная функция добавления контента
    function appendContent(type, message) {
        const $element = createMessageElement(message, contentCreators[type]);
        elements.messagesList.append($element);
        
        if (type === 'file') {
            setupDownloadLink($element.find('.download-link'));
        }
        
        elements.messagesList.scrollTop(elements.messagesList[0].scrollHeight);
    }

    function updateMessages(messages) {
        elements.messagesList.empty();
        messages.forEach(message => {
            appendContent(message.type || 'message', message);
        });
        elements.messagesList.scrollTop(elements.messagesList[0].scrollHeight);
    }

    function setupDownloadLink($link) {
        $link.click(function(e) {
            e.preventDefault();
            const url = $(this).data('url');
            const filename = $(this).data('filename');
            const $spinner = $(this).siblings('.loading-spinner');

            $('#download-filename').text(filename);
            $('#download-modal').show();

            $('#confirm-download').off('click').on('click', function() {
                $link.addClass('downloading');
                $spinner.show();
                $('#download-modal').hide();

                fetch(url)
                    .then(response => response.blob())
                    .then(blob => {
                        const downloadUrl = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = downloadUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(downloadUrl);
                    })
                    .finally(() => {
                        $link.removeClass('downloading');
                        $spinner.hide();
                    });
            });

            $('#cancel-download').off('click').on('click', function() {
                $('#download-modal').hide();
            });
        });
    }

    function startRecording() {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                mediaRecorder = new MediaRecorder(stream, { mimeType: recordingMimeType });
                audioChunks = [];
                mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: recordingMimeType });
                    const audioUrl = URL.createObjectURL(audioBlob);
                    elements.previewAudio.attr('src', audioUrl);
                    elements.previewContainer.show();
                    stream.getTracks().forEach(track => track.stop());
                };
                mediaRecorder.start();
                elements.recordButton.addClass('recording');
                elements.stopButton.show();
                $('#send-button, #media-button').hide();
                recordSeconds = 0;
                elements.recordStatus.text('00:00').addClass('active');
                recordTimer = setInterval(() => {
                    recordSeconds++;
                    const minutes = Math.floor(recordSeconds / 60).toString().padStart(2, '0');
                    const seconds = (recordSeconds % 60).toString().padStart(2, '0');
                    elements.recordStatus.text(`${minutes}:${seconds}`);
                }, 1000);
            })
            .catch(err => {
                alert('Не удалось получить доступ к микрофону. Проверьте разрешения.');
            });
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            elements.recordButton.removeClass('recording');
            elements.stopButton.hide();
            $('#send-button, #media-button').show();
            elements.recordStatus.text('').removeClass('active');
            clearInterval(recordTimer);
        }
    }

    // Настройка обработчиков событий
    elements.fullscreenButton.click(function() {
        isFullscreen = !isFullscreen;
        elements.chatContainer.toggleClass('fullscreen');
        $(this).find('i').toggleClass('fa-expand fa-compress');
    });

    elements.openChatButton.click(function() {
        elements.chatContainer.show();
        $(this).hide();
        connectWebSocket();
    });

    $('#close-chat-button').click(function() {
        elements.chatContainer.removeClass('fullscreen').hide();
        elements.openChatButton.show();
        isFullscreen = false;
        elements.fullscreenButton.find('i').removeClass('fa-compress').addClass('fa-expand');
        if (socket) socket.close();
    });

    elements.recordButton.click(() => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') startRecording();
    });

    elements.stopButton.click(stopRecording);

    elements.sendVoiceButton.click(function() {
        const audioBlob = new Blob(audioChunks, { type: recordingMimeType });
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'voice', voice: base64, mimeType: recordingMimeType }));
            }
            elements.previewContainer.hide();
            URL.revokeObjectURL(elements.previewAudio.attr('src'));
        };
        reader.readAsDataURL(audioBlob);
    });

    elements.deleteVoiceButton.click(function() {
        elements.previewContainer.hide();
        URL.revokeObjectURL(elements.previewAudio.attr('src'));
        audioChunks = [];
    });

    elements.mediaButton.click(() => $('#media-input').click());

    $('#media-input').change(function() {
        const file = this.files[0];
        if (file) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('uid', $('#uid-input').val());
            formData.append('type', file.type.startsWith('image/') ? 'photo' : file.type.startsWith('video/') ? 'video' : 'file');
    
            $('#upload-progress').show();
            $.ajax({
                url: `${httpServerUrl}/upload`,
                method: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                xhr: function() {
                    const xhr = new window.XMLHttpRequest();
                    xhr.upload.addEventListener('progress', function(e) {
                        if (e.lengthComputable) {
                            const percent = (e.loaded / e.total) * 100;
                            $('#progress-bar').css('width', percent + '%');
                        }
                    }, false);
                    return xhr;
                },
                success: function() {
                    $('#upload-progress').hide();
                    $('#progress-bar').css('width', '0%');
                },
                error: function() {
                    $('#upload-progress').hide();
                    $('#progress-bar').css('width', '0%');
                    alert('Ошибка при загрузке файла');
                }
            });
            this.value = '';
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
        url: `${httpServerUrl}/get-uid`,
        method: 'GET',
        xhrFields: { withCredentials: true },
        success: function(response) {
            $('#uid-input').val(response.uid);
            if (elements.chatContainer.is(':visible')) connectWebSocket();
        }
    });
});