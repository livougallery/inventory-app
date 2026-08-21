const express = require('express');
const app = express();

// Add debug logging to all routes
app.use((req, res, next) => {
  console.log('[MIDDLEWARE] Request:', req.method, req.path);
  
  if (req.path === '/login') {
    console.log('[MIDDLEWARE] /login detected, checking path');
    // Return SPA instead of next()
    const fs = require('fs');
    const path = require('path');
    const distPath = path.join(__dirname, '../inventory-app/frontend/dist/index.html');
    
    if (fs.existsSync(distPath)) {
      console.log('[MIDDLEWARE] Serving SPA from', distPath);
      return res.sendFile(distPath);
    } else {
      console.log('[MIDDLEWARE] SPA not found at', distPath);
      res.send('SPA file missing');
    }
  }
  
  next();
});

app.listen(3000, () => {
  console.log('[DEBUG] Debug server started on port 3000');
});
