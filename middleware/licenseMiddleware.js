const { checkLicense } = require('../utils/licenseCheck');

async function licenseMiddleware(req, res, next) {
  // Only protect admin and API admin routes
  if (req.path.startsWith('/admin') || req.path.startsWith('/api/admin')) {
    // Skip the error page itself to avoid loops
    if (req.path === '/admin/license-error.html') return next();

    const isValid = await checkLicense();
    if (!isValid) {
      if (req.path.startsWith('/api')) {
        return res.status(403).json({ error: 'License invalid or disabled. Please contact the vendor.' });
      } else {
        return res.redirect('/admin/license-error.html');
      }
    }
  }
  next();
}

module.exports = licenseMiddleware;
