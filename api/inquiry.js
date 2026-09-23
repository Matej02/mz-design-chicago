// M&Z Design Chicago — inquiry form endpoint
// Sends the contact form through Resend. No SDK dependency: the Resend
// REST API is a single fetch call, which keeps this a zero-build, zero
// node_modules deploy like the rest of the site.

const TO_EMAIL = 'mzdesign14@yahoo.com';
const FROM_EMAIL = 'M&Z Design Chicago <inquiries@mzdesignchicago.com>';
const SITE_ORIGIN = 'https://test.mzdesignchicago.com';
const LOGO_URL = SITE_ORIGIN + '/assets/icons/icon-192.png';

// Humans take at least a couple of seconds to fill this form out; a bot
// that fills and submits instantly trips this. The client stamps `ts`
// with Date.now() when the page loads.
const MIN_FILL_TIME_MS = 2500;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// Strip CR/LF so nothing here can smuggle extra header-like lines into
// anything downstream that ever parses these values as headers.
function cleanLine(str, max) {
  return String(str || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin requests, and most non-browser tools, send no Origin header
  try {
    return new URL(origin).host === req.headers.host;
  } catch (e) {
    return false;
  }
}

function renderEmail(fields, message) {
  const ROW_LABEL = 'font:12px Georgia,serif;letter-spacing:.06em;text-transform:uppercase;color:#8a7a5f;padding:10px 16px 2px;';
  const ROW_VALUE = 'font:16px Georgia,serif;color:#241B12;padding:0 16px 12px;';

  const rows = fields.map(function (r) {
    return (
      '<tr><td style="' + ROW_LABEL + '">' + escapeHtml(r[0]) + '</td></tr>' +
      '<tr><td style="' + ROW_VALUE + '">' + escapeHtml(r[1]) + '</td></tr>'
    );
  }).join('');

  const html = [
    '<!doctype html><html><body style="margin:0;padding:0;background:#EBE1CC;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EBE1CC;padding:32px 16px;">',
    '<tr><td align="center">',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#F6F0E3;border-radius:6px;overflow:hidden;">',

    // header band
    '<tr><td style="background:#1B140D;padding:28px 32px;text-align:center;">',
    '<img src="' + LOGO_URL + '" width="56" height="56" alt="M&amp;Z Design Chicago" style="display:block;margin:0 auto 12px;">',
    '<div style="font:12px Georgia,serif;letter-spacing:.22em;text-transform:uppercase;color:#D9BD8B;">New Design Inquiry</div>',
    '</td></tr>',

    // intro line
    '<tr><td style="padding:28px 32px 4px;">',
    '<p style="margin:0;font:15px Georgia,serif;color:#5B4E3E;">Someone just submitted the contact form on the website:</p>',
    '</td></tr>',

    // field rows
    '<tr><td style="padding:8px 16px 8px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + rows + '</table>',
    '</td></tr>',

    // project notes
    '<tr><td style="padding:8px 32px 4px;">',
    '<div style="font:12px Georgia,serif;letter-spacing:.06em;text-transform:uppercase;color:#8a7a5f;margin-bottom:6px;">Project notes</div>',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>',
    '<td width="3" style="background:#AD8749;"></td>',
    '<td style="padding:2px 0 2px 16px;font:16px/1.6 Georgia,serif;color:#241B12;white-space:pre-wrap;">' + escapeHtml(message) + '</td>',
    '</tr></table>',
    '</td></tr>',

    '<tr><td style="padding:28px 32px 32px;">',
    '<div style="border-top:1px solid rgba(36,27,18,.12);"></div>',
    '</td></tr>',

    // footer
    '<tr><td style="padding:0 32px 28px;text-align:center;">',
    '<p style="margin:0;font:12px Georgia,serif;color:#a3937a;">Sent automatically from the contact form at mzdesignchicago.com</p>',
    '</td></tr>',

    '</table></td></tr></table></body></html>'
  ].join('');

  return html;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!sameOrigin(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  const body = req.body || {};

  // Honeypot + timing check: a hidden field real visitors never fill in,
  // and a fill time no human could hit. Both report success so bots don't
  // learn to adapt.
  const filledTooFast = Number(body.ts) && (Date.now() - Number(body.ts)) < MIN_FILL_TIME_MS;
  if (body.company || filledTooFast) {
    return res.status(200).json({ ok: true });
  }

  const name = cleanLine(body.name, 200);
  const contact = cleanLine(body.contact, 200);
  const message = String(body.message || '').trim().slice(0, 5000);
  const projectType = cleanLine(body.projectType, 100);
  const rooms = cleanLine(body.rooms, 200);
  const budget = cleanLine(body.budget, 100);
  const timeline = cleanLine(body.timeline, 100);

  if (!name || !contact || !message) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set');
    return res.status(500).json({ ok: false, error: 'Email is not configured' });
  }

  const subject = 'Design inquiry — ' + name + (projectType ? ' (' + projectType + ')' : '');

  const fields = [
    ['Name', name],
    ['Best way to reach them', contact],
    ['Project type', projectType],
    ['Rooms / areas', rooms],
    ['Approximate budget', budget],
    ['Timeline', timeline]
  ].filter(function (r) { return r[1]; });

  const html = renderEmail(fields, message);
  const text = fields.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') +
    '\n\nProject notes:\n' + message;

  // A reply-typed contact value (looks like an email) lets the studio hit
  // "reply" and land in the visitor's inbox directly.
  const replyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact : undefined;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        reply_to: replyTo,
        subject: subject,
        html: html,
        text: text
      })
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(function () { return ''; });
      console.error('Resend error', resp.status, detail);
      return res.status(502).json({ ok: false, error: 'Could not send email' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Resend request failed', err);
    return res.status(502).json({ ok: false, error: 'Could not send email' });
  }
};
