const session = require('express-session');

module.exports = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true, // Обязательно для HTTPS на Render
    sameSite: 'none', // Для кросс-доменных запросов
    maxAge: 3600000, // 1 час
    path: '/'
  },
  rolling: true
});