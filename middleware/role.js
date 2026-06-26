module.exports = (...roles) => {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.role)) {
      return res.status(403).render('error', { message: 'Akses ditolak.' });
    }
    next();
  };
};
