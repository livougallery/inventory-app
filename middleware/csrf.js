const crypto = require('crypto');

module.exports = {
  generateToken: (req, res, next) => {
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;
    next();
  },
  validateToken: (req, res, next) => {
    const token = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
    if (token && token === req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
      return next();
    }
    res.status(403).send('CSRF token tidak valid');
  }
};
