const WebSocket = require('ws');
const { sendTelegramMessage, sendTelegramVoice, sendTelegramFile, telegramChatIds } = require('./telegram');
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

      ws.on('message', async (message) => {
        const data = JSON.parse(message);
        if (isUserBanned(uid)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Вы заблокированы.' }));
          return;
        }

        if (!userMessages.has(uid)) userMessages.set(uid, []);

        let newMessage;
        switch (data.type) {
          case 'message':
            newMessage = { text: data.message, fromBot: false, uid };
            userMessages.get(uid).push(newMessage);
            sendTelegramMessage(telegramChatIds, data.message, uid, false);
            ws.send(JSON.stringify({ type: 'message', message: newMessage }));
            break;
          case 'voice':
            newMessage = { type: 'voice', voice: data.voice, fromBot: false, uid };
            userMessages.get(uid).push(newMessage);
            ws.send(JSON.stringify({ type: 'voice', message: newMessage }));
            setTimeout(async () => {
              const voiceBuffer = Buffer.from(data.voice, 'base64');
              await sendTelegramVoice(telegramChatIds, voiceBuffer, uid, data.mimeType);
            }, 0);
            break;
          case 'photo':
            newMessage = { type: 'photo', file: data.photo, filename: data.filename, fromBot: false, uid };
            userMessages.get(uid).push(newMessage);
            ws.send(JSON.stringify({ type: 'photo', message: newMessage }));
            setTimeout(async () => {
              const photoBuffer = Buffer.from(data.photo, 'base64');
              await sendTelegramFile(telegramChatIds, photoBuffer, data.filename, uid);
            }, 0);
            break;
          case 'video':
            newMessage = { type: 'video', file: data.video, filename: data.filename, fromBot: false, uid };
            userMessages.get(uid).push(newMessage);
            ws.send(JSON.stringify({ type: 'video', message: newMessage }));
            setTimeout(async () => {
              const videoBuffer = Buffer.from(data.video, 'base64');
              await sendTelegramFile(telegramChatIds, videoBuffer, data.filename, uid);
            }, 0);
            break;
          case 'file':
            newMessage = { type: 'file', file: data.file, filename: data.filename, fromBot: false, uid };
            userMessages.get(uid).push(newMessage);
            ws.send(JSON.stringify({ type: 'file', message: newMessage }));
            setTimeout(async () => {
              const fileBuffer = Buffer.from(data.file, 'base64');
              await sendTelegramFile(telegramChatIds, fileBuffer, data.filename, uid);
            }, 0);
            break;
        }
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