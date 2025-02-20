const TelegramBot = require('node-telegram-bot-api');
const { botToken, telegramChatIds } = require('../config/config');
const ffmpeg = require('ffmpeg-static');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Отключаем все deprecation warnings
process.env.NTBA_FIX_350 = '1'; // Для content-type предупреждений

const bot = new TelegramBot(botToken, { 
  polling: true,
  filepath: false,
});

const sendTelegramMessage = (chatIds, messageText, uid, isFromBot) => {
  setTimeout(() => {
    chatIds.forEach(chatId => {
      bot.sendMessage(chatId, isFromBot ? messageText : `Пользователь ${uid}: ${messageText}`).catch(err => {
        console.error(`Ошибка отправки сообщения в Telegram (${chatId}):`, err);
      });
    });
  }, 1000);
};

const sendTelegramVoice = (chatIds, voiceBuffer, uid, mimeType) => {
  console.log('Получено голосовое сообщение:', { bufferLength: voiceBuffer.length, mimeType });
  
  const inputFile = path.join(__dirname, `temp_${uid}.webm`);
  const outputFile = path.join(__dirname, `voice_${uid}.ogg`);
  
  fs.writeFileSync(inputFile, voiceBuffer);

  const ffmpegCommand = `${ffmpeg} -i ${inputFile} -c:a libopus -b:a 32k ${outputFile} -y`;
  exec(ffmpegCommand, (error) => {
    if (error) {
      console.error('Ошибка конвертации аудио:', error);
      if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
      return;
    }

    const fileOptions = {
      filename: `voice_${uid}.ogg`,
      contentType: 'audio/ogg',
    };

    const sendPromises = chatIds.map(chatId =>
      bot.sendVoice(chatId, fs.readFileSync(outputFile), { caption: `Голосовое сообщение от ${uid}` }, fileOptions)
        .then(() => console.log(`Голосовое сообщение отправлено в ${chatId}`))
        .catch(err => console.error(`Ошибка отправки голосового сообщения в Telegram (${chatId}):`, err))
    );

    Promise.all(sendPromises).then(() => {
      if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    });
  });
};

const sendTelegramFile = (chatIds, fileBuffer, filename, uid) => {
  setTimeout(() => {
    chatIds.forEach(chatId => {
      const fileOptions = {
        filename: filename || 'file',
        contentType: getMimeType(filename),
      };
      bot.sendDocument(chatId, fileBuffer, { caption: `Файл от ${uid}` }, fileOptions).catch(err => {
        console.error(`Ошибка отправки файла в Telegram (${chatId}):`, err);
      });
    });
  }, 1000);
};

function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain',
    'mp3': 'audio/mpeg',
    'ogg': 'audio/ogg',
    'wav': 'audio/wav',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

module.exports = { 
  bot, 
  sendTelegramMessage, 
  sendTelegramVoice, 
  sendTelegramFile, 
  telegramChatIds 
};