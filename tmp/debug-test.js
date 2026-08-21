const express = require('express');
const app = express();

// Early check
app.use((req, res, next) => {
  if (req.path === '/login') {
    console.log('[DEBUG] /login request detected, serving SPA');
    return res.sendFile(__dirname + '/frontend/dist/index.html');
  }
  next();
});

app.get('/login', (req, res) => {
  console.log('[DEBUG] EJS route hit!');
  res.send('EJS Login Page');
});

app.listen(3001, () => {
  console.log('Debug server on port 3001');
});
