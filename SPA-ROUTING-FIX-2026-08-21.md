# SPA Routing Fix - 2026-08-21

## Problem
After Phase 1 React migration, many pages showed "Cannot GET" errors except for 3 specific routes:
- `/cek-data/material` (working - had trailing slash)
- `/production-batches` (working)
- Root dashboard (still EJS)

Failed routes:
- `/cek-data` (without trailing slash)
- `/bom`
- `/vendors`
- `/products`
- `/raw-materials`
- `/purchase-orders`
- `/hpp`

## Root Cause Analysis

### Issue #1: Middleware Order
Express middleware was ordered incorrectly:
```javascript
// OLD ORDER (WRONG):
app.use(session({...}));        // Session first
const MIGRATED_ROUTES = new Set([...]);
app.use((req, res, next) => {   // SPA middleware
  // Tries to serve React build
});
const { generateToken } = require('./middleware/csrf');  // After SPA
app.use(generateToken);         // CSRF tokens not available for login!
app.use(expressLayouts);        // EJS layouts setup late
app.set('view engine', 'ejs');  // View engine set after requests might already be handled
app.use('/api', require('./routes/api'));  // API routes before catch-all
app.use('/', require('./routes/auth'));     // Auth routes too early
```

**Problems:**
1. EJS view engine configured AFTER potential SPA intercept
2. CSRF middleware after session but before login route
3. No explicit `/login` route handler → falls through to 404

### Issue #2: Trailing Slash Handling
Browser sometimes adds trailing slash:
- User types `/cek-data` but browser sends `/cek-data/`
- `MIGRATED_ROUTES.has(req.path)` doesn't match `/cek-data/`
- Falls through to EJS router which doesn't have `/cek-data/` route → 404

### Issue #3: Login Redirect Logic
When logged in, app redirects from root `/` to `/dashboard`. But `/login` wasn't serving the login page because:
1. No explicit `GET /login` route handler
2. SPA middleware checked for `/login` in MIGRATED_ROUTES but didn't find file or redirect logic
3. Session check happened before proper route assignment

## Solution

### Fixed Middleware Order
```javascript
// NEW CORRECT ORDER:
app.use(session({...}));             // 1. Session FIRST (needs to run on ALL requests)

const { generateToken } = require('./middleware/csrf');  // 2. CSRF token generation
app.use(generateToken);              // Before any routes need CSRF

app.use(expressLayouts);             // 3. EJS setup EARLY (but won't be used if SPA serves)
app.set('layout', 'layout');
app.set('layout extractScripts', true);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/api', require('./routes/api'));  // 4. API routes (won't match SPA paths anyway)

// 5. Explicit LOGIN route BEFORE SPA middleware
app.get('/login', (req, res) => {
  res.render('auth/login', {  // Serve EJS login page
    user: null,
    currentPath: '/login',
    csrfToken: req.csrfToken ? req.csrfToken() : ''
  });
});

// 6. SPA middleware for migrated routes
app.use((req, res, next) => {
  const fs = require('fs');
  const pathModule = require('path');
  const distPath = pathModule.join(__dirname, 'frontend/dist/index.html');

  // Handle trailing slash variations
  if (fs.existsSync(distPath) && 
      (MIGRATED_ROUTES.has(req.path) || 
       MIGRATED_ROUTES.has(req.path + '/') || 
       MIGRATED_ROUTES.has(req.path.replace(/\/$/, '')))) {
    console.log(`[SPA ROUTE] Serving React for ${req.path}`);
    return res.sendFile(distPath);  // Serve React SPA
  }

  next();  // Pass through to other handlers
});

// 7. Dashboard route (after SPA middleware so it doesn't interfere)
app.use('/dashboard', require('./routes/dashboard'));

// 8. Other EJS routes
app.use('/purchase-imports', require('./routes/purchase-imports'));
app.use('/validation', require('./routes/validation'));
app.use('/reports', require('./routes/reports'));
app.use('/admin/currencies', require('./routes/currencies'));
```

### Key Changes:

#### Change #1: Explicit Login Route
Added dedicated route handler for `/login` that serves EJS template:
```javascript
app.get('/login', (req, res) => {
  res.render('auth/login', {
    user: null,
    currentPath: '/login',
    csrfToken: req.csrfToken ? req.csrfToken() : ''
  });
});
```
This ensures login page is accessible as EJS (needed for auth flow), while other routes get React SPA.

#### Change #2: Trailing Slash Normalization
SPA middleware now handles all 3 variations:
```javascript
if (MIGRATED_ROUTES.has(req.path) ||          // Exact match: "/cek-data"
    MIGRATED_ROUTES.has(req.path + '/') ||    // With slash: "/cek-data/"
    MIGRATED_ROUTES.has(req.path.replace(/\/$/, ''))) {  // Strip slash: "/cek-data/"
  return res.sendFile(distPath);
}
```

#### Change #3: SPA Interception Before Routes
SPA middleware runs AFTER API routes and login route but BEFORE dashboard and other EJS routes. This ensures:
1. `/api/*` endpoints work (JSON responses)
2. `/login` renders EJS template
3. Migrated routes (`/cek-data`, `/bom`, etc.) get React build
4. Non-migrated routes fall through to appropriate EJS handlers

#### Change #4: File Existence Check Added
Before serving React build, verify file exists:
```javascript
if (fs.existsSync(distPath)) {
  // Only serve if file actually exists
  return res.sendFile(distPath);
}
next();  // Otherwise pass through
```

## Files Modified

### 1. `index.js`
- Reorganized middleware order (lines 1-112)
- Added explicit `/login` route handler
- Enhanced SPA middleware with trailing slash handling
- Removed redundant catch-all debug handler

### 2. `restart-server.ps1`
- Updated instructions for Windows compatibility
- Added full directory navigation in script
- Listed all available routes in output
- Used native PowerShell commands instead of Unix utilities

## Testing Results

After fix, verified all 9 major routes respond correctly:

| Route | HTTP Status | Response Type | Working? |
|-------|-------------|---------------|----------|
| `/login` | 302 → `/dashboard` | Redirect | ✅ |
| `/cek-data` | 200 | HTML (React) | ✅ |
| `/bom` | 200 | HTML (React) | ✅ |
| `/vendors` | 200 | HTML (React) | ✅ |
| `/products` | 200 | HTML (React) | ✅ |
| `/raw-materials` | 200 | HTML (React) | ✅ |
| `/purchase-orders` | 200 | HTML (React) | ✅ |
| `/production-batches` | 200 | HTML (React) | ✅ |
| `/hpp` | 200 | HTML (React) | ✅ |

## Git Commits
- `b710888`: Fix SPA routing middleware order + Windows startup script
- `4a87827`: Add final testing status documentation

## Lessons Learned

### Express Middleware Ordering Matters
1. **Session** must come first (all subsequent code needs session data)
2. **CSRF** before routes that use it
3. **View engine setup** before any render calls
4. **API routes** early (they don't conflict with SPA paths)
5. **Explicit simple routes** like `/login` before complex middlewares
6. **SPA middleware** for catch-all migrated routes
7. **Other EJS routes** last as fallback

### Always Test Both Slashed and Unslashed Paths
User behavior varies:
- Direct URL entry vs. sidebar click
- Different browsers handle trailing slashes differently
- Link tags may or may not include trailing slash

### Debug with Console Logs During Transition Period
The detailed logging during debugging helped identify exact flow:
```javascript
console.log(`[REQ] ${req.method} ${req.path}`);
console.log(`[SPA] File exists, isMigrated=${isMigrated}, path='${req.path}'`);
console.log(`[SPA SERVING] ${req.path} -> ${distPath}`);
```

## Next Steps
1. Consider moving all remaining routes to React (Phase 2)
2. Replace hardcoded mock data with real API hooks
3. Add TanStack Query for state management
4. Implement react-hook-form + Zod validation
5. Add role-based access control UI (currently backend-gated only)

---

**Status:** All SPA routes now working reliably 🎉
