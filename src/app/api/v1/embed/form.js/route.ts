import { NextResponse } from "next/server";

const EMBED_SCRIPT = `
(function() {
  'use strict';
  var script = document.currentScript;
  if (!script) return;

  var token = script.getAttribute('data-token');
  var primaryColor = script.getAttribute('data-primary-color') || '#f97316';
  var host = script.src.replace(/\\/api\\/v1\\/embed\\/form\\.js$/, '');

  var container = document.createElement('div');
  container.id = 'pinggo-form-container';
  script.parentNode.insertBefore(container, script.nextSibling);

  var shadow = container.attachShadow({ mode: 'open' });

  var style = document.createElement('style');
  style.textContent = [
    ':host { display: block; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
    '.pinggo-form { max-width: 480px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }',
    '.pinggo-form h3 { margin: 0 0 16px; font-size: 18px; font-weight: 600; color: #1e293b; }',
    '.pinggo-field { margin-bottom: 12px; }',
    '.pinggo-field label { display: block; margin-bottom: 4px; font-size: 13px; font-weight: 500; color: #475569; }',
    '.pinggo-field input, .pinggo-field textarea { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; box-sizing: border-box; outline: none; transition: border-color 0.2s; }',
    '.pinggo-field input:focus, .pinggo-field textarea:focus { border-color: ' + primaryColor + '; }',
    '.pinggo-field textarea { resize: vertical; min-height: 60px; }',
    '.pinggo-btn { display: inline-block; padding: 10px 24px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #fff; cursor: pointer; transition: opacity 0.2s; background: ' + primaryColor + '; }',
    '.pinggo-btn:hover { opacity: 0.9; }',
    '.pinggo-btn:disabled { opacity: 0.5; cursor: not-allowed; }',
    '.pinggo-msg { margin-top: 12px; padding: 10px 14px; border-radius: 8px; font-size: 13px; }',
    '.pinggo-msg.success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }',
    '.pinggo-msg.error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }',
  ].join('\\n');
  shadow.appendChild(style);

  var form = document.createElement('form');
  form.className = 'pinggo-form';
  form.innerHTML = [
    '<h3>Contacteaza-ne</h3>',
    '<div class="pinggo-field"><label>Nume *</label><input type="text" name="name" required></div>',
    '<div class="pinggo-field"><label>Telefon</label><input type="tel" name="phone"></div>',
    '<div class="pinggo-field"><label>Email</label><input type="email" name="email"></div>',
    '<div class="pinggo-field"><label>Mesaj</label><textarea name="message"></textarea></div>',
    '<button type="submit" class="pinggo-btn">Trimite</button>',
    '<div class="pinggo-msg" style="display:none"></div>',
  ].join('');
  shadow.appendChild(form);

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var btn = form.querySelector('.pinggo-btn');
    var msg = form.querySelector('.pinggo-msg');
    btn.disabled = true;
    msg.style.display = 'none';

    var data = {
      source: 'FORM',
      identity: {
        name: form.querySelector('[name="name"]').value.trim() || undefined,
        phone: form.querySelector('[name="phone"]').value.trim() || undefined,
        email: form.querySelector('[name="email"]').value.trim() || undefined,
      },
      message: form.querySelector('[name="message"]').value.trim() || undefined,
    };

    fetch(host + '/api/v1/leads/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pinggo-token': token,
      },
      body: JSON.stringify(data),
    })
    .then(function(res) {
      if (!res.ok) throw new Error('Eroare la trimitere');
      msg.className = 'pinggo-msg success';
      msg.textContent = 'Multumim! Te vom contacta in curand.';
      msg.style.display = 'block';
      form.reset();
    })
    .catch(function(err) {
      msg.className = 'pinggo-msg error';
      msg.textContent = err.message || 'A aparut o eroare. Incearca din nou.';
      msg.style.display = 'block';
    })
    .finally(function() {
      btn.disabled = false;
    });
  });
})();
`;

export async function GET() {
  return new NextResponse(EMBED_SCRIPT.trim(), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
