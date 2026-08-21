const express = require('express');
const app = express();
const path = require('path');

// Simple test without any complex middleware
app.get('/login', (req, res) => {
  console.log('[TEST] /login route hit');
  const distPath = path.join(__dirname, '../frontend/dist/index.html');
  return res.sendFile(distPath);
});

app.listen(3000, () => {
  console.log('[TEST] Server started on port 3000 (override)');
});
