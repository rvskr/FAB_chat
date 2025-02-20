const userMessages = new Map();
const bannedUsers = new Map();
const activeConnections = new Map();
let lastRespondedUid = null;

const generateShortUid = () => Math.random().toString(36).substr(2, 5);

const banUser = (uid, duration = 3600000) => {
  const banExpiry = Date.now() + duration;
  bannedUsers.set(uid, banExpiry);
  const banMessage = { text: `Вас забанили на ${duration / 60000} мин.`, fromBot: true, uid };
  if (userMessages.has(uid)) userMessages.get(uid).push(banMessage);
  else userMessages.set(uid, [banMessage]);

  const ws = activeConnections.get(uid);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'message', message: banMessage }));
  }
};

const unbanUser = (uid) => {
  bannedUsers.delete(uid);
  const unbanMessage = { text: `Вам сняли бан.`, fromBot: true, uid };
  if (userMessages.has(uid)) userMessages.get(uid).push(unbanMessage);
  else userMessages.set(uid, [unbanMessage]);

  const ws = activeConnections.get(uid);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'message', message: unbanMessage }));
  }
};

const isUserBanned = (uid) => {
  const banExpiry = bannedUsers.get(uid);
  if (!banExpiry || banExpiry < Date.now()) {
    bannedUsers.delete(uid);
    return false;
  }
  return true;
};

module.exports = {
  userMessages,
  bannedUsers,
  activeConnections,
  lastRespondedUid,
  generateShortUid,
  banUser,
  unbanUser,
  isUserBanned,
  setLastRespondedUid: (uid) => { lastRespondedUid = uid; },
  getLastRespondedUid: () => lastRespondedUid, // Добавляем геттер
};