// M&Z Design Chicago — inquiry form endpoint
// Sends the contact form through Resend. No SDK dependency: the Resend
// REST API is a single fetch call, which keeps this a zero-build, zero
// node_modules deploy like the rest of the site.

const TO_EMAIL = 'mzdesign14@yahoo.com';
const FROM_EMAIL = 'M&Z Design Chicago <inquiries@mzdesignchicago.com>';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = req.body || {};

  // Honeypot: a hidden field real visitors never fill in. Bots that fill
  // every field trip this; we report success so they don't retry.
  if (body.company) {
    return res.status(200).json({ ok: true });
  }

  const name = (body.name || '').toString().trim();
  const contact = (body.contact || '').toString().trim();
  const message = (body.message || '').toString().trim();
  const projectType = (body.projectType || '').toString().trim();
  const rooms = (body.rooms || '').toString().trim();
  const budget = (body.budget || '').toString().trim();
  const timeline = (body.timeline || '').toString().trim();

  if (!name || !contact || !message) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }
  if (name.length > 200 || contact.length > 200 || message.length > 5000) {
    return res.status(400).json({ ok: false, error: 'Field too long' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set');
    return res.status(500).json({ ok: false, error: 'Email is not configured' });
  }

  const subject = 'Design inquiry — ' + name + (projectType ? ' (' + projectType + ')' : '');

  const rows = [
    ['Name', name],
    ['Best way to reach them', contact],
    ['Project type', projectType],
    ['Rooms / areas', rooms],
    ['Approximate budget', budget],
    ['Timeline', timeline]
  ].filter(function (r) { return r[1]; });

  const html =
    '<div style="font-family:Georgia,serif;font-size:15px;line-height:1.6;color:#241B12;">' +
    '<h2 style="margin:0 0 16px;">New design inquiry</h2>' +
    '<table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">' +
    rows.map(function (r) {
      return '<tr><td style="padding:2px 12px 2px 0;color:#5B4E3E;">' + escapeHtml(r[0]) + '</td>' +
             '<td style="padding:2px 0;"><strong>' + escapeHtml(r[1]) + '</strong></td></tr>';
    }).join('') +
    '</table>' +
    '<p style="color:#5B4E3E;margin:0 0 4px;">Project notes:</p>' +
    '<p style="white-space:pre-wrap;margin:0;">' + escapeHtml(message) + '</p>' +
    '</div>';

  const text = rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') +
    '\n\nProject notes:\n' + message;

  // A reply-typed contact value (looks like an email) lets the studio hit
  // "reply" and land in the visitor's inbox directly.
  const replyTo = /.+@.+\..+/.test(contact) ? contact : undefined;

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
