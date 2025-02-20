const express = require('express');
const path = require('path');
const { sendTelegramMessage, sendTelegramVoice, sendTelegramFile, telegramChatIds } = require('../services/telegram');
const { userMessages, generateShortUid, isUserBanned } = require('../services/userManagement');

const router = express.Router();

router.post('/send-message', (req, res) => {
  const { message } = req.body;
  let uid = req.session.uid;
  if (!uid) {
    uid = generateShortUid();
    req.session.uid = uid;
    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
    });
  }

  if (!message) return res.status(400).send('Сообщение не может быть пустым');
  if (isUserBanned(uid)) return res.status(403).json({ error: 'Вы заблокированы.' });

  const newMessage = { text: message, fromBot: false, uid };
  if (!userMessages.has(uid)) userMessages.set(uid, []);
  userMessages.get(uid).push(newMessage);

  sendTelegramMessage(telegramChatIds, message, uid, false);
  res.send('Сообщение отправлено!');
});

router.post('/send-voice', (req, res) => {
  const { voice, mimeType } = req.body;
  let uid = req.session.uid;
  if (!uid) {
    uid = generateShortUid();
    req.session.uid = uid;
    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
    });
  }

  if (!voice) return res.status(400).send('Голосовое сообщение не может быть пустым');
  if (isUserBanned(uid)) return res.status(403).json({ error: 'Вы заблокированы.' });

  const voiceBuffer = Buffer.from(voice, 'base64');
  const newVoiceMessage = { type: 'voice', voice, fromBot: false, uid };
  if (!userMessages.has(uid)) userMessages.set(uid, []);
  userMessages.get(uid).push(newVoiceMessage);

  sendTelegramVoice(telegramChatIds, voiceBuffer, uid, mimeType);
  res.send('Голосовое сообщение отправлено!');
});

router.post('/send-file', (req, res) => {
  const { file, filename } = req.body;
  let uid = req.session.uid;
  if (!uid) {
    uid = generateShortUid();
    req.session.uid = uid;
    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
    });
  }

  if (!file || !filename) return res.status(400).send('Файл и имя файла обязательны');
  if (isUserBanned(uid)) return res.status(403).json({ error: 'Вы заблокированы.' });

  const fileBuffer = Buffer.from(file, 'base64');
  const newFileMessage = { type: 'file', file, filename, fromBot: false, uid };
  if (!userMessages.has(uid)) userMessages.set(uid, []);
  userMessages.get(uid).push(newFileMessage);

  sendTelegramFile(telegramChatIds, fileBuffer, filename, uid);
  res.send('Файл отправлен!');
});

router.get('/get-messages', (req, res) => {
  const uid = req.session.uid;
  if (!uid || !userMessages.has(uid)) return res.json([]);
  res.json(userMessages.get(uid).filter(msg => !msg.text?.startsWith('/')));
});

router.get('/', (req, res) => {
  let uid = req.session.uid;
  if (!uid) {
    uid = generateShortUid();
    req.session.uid = uid;
    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
    });
  }
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

router.get('/get-uid', (req, res) => {
  let uid = req.session.uid;
  if (!uid) {
    uid = generateShortUid();
    req.session.uid = uid;
    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
    });
  }
  console.log('UID on Render:', uid);
  res.json({ success: true, uid });
});

module.exports = router;