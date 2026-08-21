const express = require('express');
const app = express();
const path = require('path');

app.get('/login', (req, res) => {
  console.log('[DEBUG] /login route hit!');
  const distPath = path.join(__dirname, '../frontend/dist/index.html');
  return res.sendFile(distPath);
});

app.listen(3001, () => {
  console.log('[DEBUG] Server started on port 3001');
});
