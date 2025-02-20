const WebSocket = require('ws');
const { sendTelegramMessage, sendTelegramVoice, telegramChatIds } = require('./telegram');
const { userMessages, activeConnections, generateShortUid, isUserBanned } = require('./userManagement');

module.exports = (server, sessionParser) => {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    sessionParser(req, {}, () => {
      let uid = req.session.uid;
      if (!uid) {
        uid = generateShortUid();
        req.session.uid = uid;
        req.session.save((err) => {
          if (err) console.error('Session save error:', err);
        });
      }

      activeConnections.set(uid, ws);

      if (userMessages.has(uid)) {
        ws.send(JSON.stringify({
          type: 'messages',
          messages: userMessages.get(uid).filter(msg => !msg.text?.startsWith('/'))
        }));
      }

      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });

      ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (isUserBanned(uid)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Вы заблокированы.' }));
          return;
        }

        if (data.type === 'message') {
          const newMessage = { text: data.message, fromBot: false, uid };
          if (!userMessages.has(uid)) userMessages.set(uid, []);
          userMessages.get(uid).push(newMessage);
          sendTelegramMessage(telegramChatIds, data.message, uid, false);
          ws.send(JSON.stringify({ type: 'message', message: newMessage }));
        } else if (data.type === 'voice') {
          const voiceBuffer = Buffer.from(data.voice, 'base64');
          const newVoiceMessage = { type: 'voice', voice: data.voice, fromBot: false, uid };
          if (!userMessages.has(uid)) userMessages.set(uid, []);
          userMessages.get(uid).push(newVoiceMessage);
          sendTelegramVoice(telegramChatIds, voiceBuffer, uid, data.mimeType);
          ws.send(JSON.stringify({ type: 'voice', message: newVoiceMessage }));
        }
        // Обработка file, photo, video удалена, так как они теперь через HTTP
      });

      ws.on('close', () => {
        console.log(`WebSocket закрыт для UID: ${uid}`);
        activeConnections.delete(uid);
      });
    });
  });

  setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  return wss;
};