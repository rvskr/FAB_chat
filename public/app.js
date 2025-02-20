$(document).ready(function() {
    const chatContainer = $('#chat-container');
    const openChatButton = $('#open-chat-button');
    const fullscreenButton = $('#fullscreen-button');
    let isFullscreen = false;
    let socket;
  
    const serverUrl = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      ? 'ws://127.0.0.1:3000'
      : 'wss://fab-chat.onrender.com';
  
    chatContainer.hide();
    openChatButton.show();
  
    function connectWebSocket() {
      if (socket) socket.close();
      socket = new WebSocket(`${serverUrl}/ws`);
  
      socket.onopen = function() {
        console.log('WebSocket соединение установлено');
      };
  
      socket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.type === 'messages') {
          updateMessages(data.messages);
        } else if (data.type === 'message') {
          const messagesList = $('#messages-list');
          const messageElement = createMessageElement(data.message);
          messagesList.append(messageElement);
          messagesList.scrollTop(messagesList[0].scrollHeight);
        }
      };
  
      socket.onclose = function() {
        console.log('WebSocket соединение закрыто');
        setTimeout(connectWebSocket, 5000);
      };
  
      socket.onerror = function(error) {
        console.error('WebSocket ошибка:', error);
      };
    }
  
    function createMessageElement(message) {
      return $('<li>')
        .addClass('chat-message')
        .addClass(message.fromBot ? 'bot-message' : 'user-message')
        .text(`${message.fromBot ? 'Администратор: ' : 'Пользователь: '}${message.text}`);
    }
  
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
      connectWebSocket();
    });
  
    $('#close-chat-button').click(function() {
      chatContainer.removeClass('fullscreen').hide();
      openChatButton.show();
      isFullscreen = false;
      fullscreenButton.find('i').removeClass('fa-compress').addClass('fa-expand');
      if (socket) socket.close();
    });
  
    $.ajax({
      url: `${serverUrl.replace('ws', 'http').replace('wss', 'https')}/get-uid`,
      method: 'GET',
      xhrFields: { withCredentials: true },
      success: function() {
        console.log('Сессия активна');
        if (chatContainer.is(':visible')) {
          connectWebSocket();
        }
      }
    });
  
    $('#message-form').submit(function(event) {
      event.preventDefault();
      const messageInput = $('#message-input');
      const messageText = messageInput.val().trim();
  
      if (messageText && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'message',
          message: messageText
        }));
        messageInput.val('');
      } else if (messageText) {
        $.ajax({
          url: `${serverUrl.replace('ws', 'http').replace('wss', 'https')}/send-message`,
          method: 'POST',
          data: { message: messageText },
          xhrFields: { withCredentials: true },
          success: function() {
            messageInput.val('');
            connectWebSocket();
          }
        });
      }
    });
  
    if (chatContainer.is(':visible')) {
      connectWebSocket();
    }
  });