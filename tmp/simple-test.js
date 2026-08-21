const http = require('http');
const fs = require('fs');
const path = require('path');

const distFile = path.join(__dirname, '../frontend/dist/index.html');

http.createServer((req, res) => {
  console.log('[HTTP] Received:', req.url);
  
  if (req.url === '/login') {
    res.writeHead(200, {'Content-Type': 'text/html'});
    fs.readFile(distFile, (err, data) => {
      if (err) {
        res.end('Error loading SPA');
      } else {
        res.end(data);
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
}).listen(3000, () => {
  console.log('[HTTP] Simple server started on port 3000');
});
