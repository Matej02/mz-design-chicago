// M&Z Design Chicago — Render web service
//
// Serves the static site from /public and the inquiry endpoint from
// /api/inquiry. api/inquiry.js is untouched from the Vercel deploy: its
// (req, res) handler signature is already Express-compatible, so the
// exact same file runs unchanged on both platforms.

const express = require('express');
const path = require('path');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // Render sits behind a proxy; needed for req.headers.host / protocol to be accurate

const PUBLIC_DIR = path.join(__dirname, 'public');

// Security headers — mirrors vercel.json so behavior stays identical
// across platforms.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://www.googletagmanager.com https://www.google-analytics.com; " +
    "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com; form-action 'self'; " +
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests"
  );
  next();
});

app.use(express.json());

// Clean URLs: /contact.html -> 308 -> /contact (mirrors vercel.json's cleanUrls)
app.get(/^\/(.+)\.html$/, (req, res, next) => {
  if (req.path === '/index.html') return res.redirect(308, '/');
  res.redirect(308, req.path.slice(0, -5));
});

// A year of immutable caching sounds right for "assets", but these files
// get overwritten in place under the same name (icons.svg, the sharpened
// photos) rather than getting content-hashed filenames — an immutable
// cache silently keeps serving stale bytes after an edit like that, which
// is exactly what happened on the Vercel deploy with icons.svg. Short
// max-age with revalidation instead; the HTML/CSS/JS already carry their
// own ?v= cache-busting query string.
app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), {
  maxAge: '1h'
}));

// app.all (not app.post): api/inquiry.js does its own method check and
// returns 405 with an Allow header for anything but POST — matching that
// exactly, rather than letting Express 404 non-POST requests, keeps
// behavior identical to the Vercel deploy.
app.all('/api/inquiry', require('./api/inquiry'));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Not found' });
  next();
});

app.use(express.static(PUBLIC_DIR, {
  extensions: ['html'],
  index: 'index.html'
}));

app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('M&Z Design Chicago listening on :' + port);
});
