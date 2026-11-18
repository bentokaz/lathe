'use strict';
// Feedback and bug reports. With accounts set up (config.js) a report goes straight into the feedback table,
// which anyone can add to but only the owner of the Supabase project can read; no sign-in needed.
// Otherwise, or if that fails, it is handed to GitHub as a ready-filled issue, and it can always be copied.
L.feedback = (() => {
  const { $, esc } = L;
  const REPO = 'bentokaz/lathe', VERSION = '2026.11.18';
  const C = L.CLOUD || {}, direct = !!(C.url && C.key);
  const errors = [];

  // remember the last few things that went wrong, so a bug report can include them
  const note = msg => {
    errors.push(`${new Date().toISOString().slice(11, 19)} ${String(msg).slice(0, 400)}`);
    if (errors.length > 8) errors.shift();
    L.toast('Something went wrong. Click here to report it', 8000);
    $('#status').classList.add('report');
  };
  addEventListener('error', e => note(e.error && e.error.stack ? e.error.stack : e.message));
  addEventListener('unhandledrejection', e => note(e.reason && e.reason.stack ? e.reason.stack : e.reason));
  $('#status').addEventListener('click', () => { if ($('#status').classList.contains('report')) open('bug'); });

  const KINDS = {
    bug: { label: 'Something is broken', prompt: 'What happened, and what did you expect? If you can, list the steps that make it happen.' },
    idea: { label: 'An idea or request', prompt: 'What would you like Lathe to do?' },
    other: { label: 'Something else', prompt: 'Tell us anything.' },
  };
  let kind = 'bug', contact = '', sending = false;

  function details() {
    const p = L.project, n = navigator;
    return [
      `Lathe ${VERSION}`,
      `Browser: ${n.userAgent}`,
      `Screen: ${innerWidth}x${innerHeight} at ${devicePixelRatio}x`,
      `Project: ${p.tracks.length} tracks, ${p.tracks.reduce((a, t) => a + t.clips.length, 0)} clips, ${p.bpm} BPM${p.guide ? ', style ' + p.guide : ''}${p.video ? ', has video' : ''}`,
      `Sounds: ${[...new Set(p.tracks.map(t => t.inst && t.inst.preset).filter(Boolean))].join(', ') || 'none'}`,
      `Recent errors: ${errors.length ? '\n' + errors.join('\n') : 'none'}`,
    ].join('\n');
  }
  function report() {
    const d = dlg.querySelector('textarea').value.trim(), withInfo = dlg.querySelector('#fb-info').checked;
    return `${d}\n\n${withInfo ? '<details><summary>Technical details</summary>\n\n```\n' + details() + '\n```\n</details>\n' : ''}`;
  }
  const title = () => {
    const first = dlg.querySelector('textarea').value.trim().split('\n')[0].slice(0, 70);
    return `[${kind === 'bug' ? 'Bug' : kind === 'idea' ? 'Idea' : 'Feedback'}] ${first || KINDS[kind].label}`;
  };

  const dlg = document.createElement('dialog');
  dlg.id = 'fb';
  document.body.append(dlg);
  function draw() {
    const text = dlg.querySelector('textarea')?.value || '';
    contact = dlg.querySelector('.fb-contact')?.value || contact;
    dlg.innerHTML = `<h2>Send feedback</h2>
      <div class="fb-kinds">${Object.entries(KINDS).map(([k, v]) => `<button type="button" data-k="${k}" class="${k === kind ? 'on' : ''}">${v.label}</button>`).join('')}</div>
      <textarea rows="6" placeholder="${KINDS[kind].prompt}" spellcheck="true"></textarea>
      <label class="fb-check"><input type="checkbox" id="fb-info" checked> Include technical details <small>(browser, project size, recent errors; no audio, no song content)</small></label>
      <details class="fb-peek"><summary>See exactly what is included</summary><pre>${esc(details())}</pre></details>
      ${direct ? `<input class="fb-contact" maxlength="200" placeholder="Your name or email, only if you would like a reply (optional)" value="${esc(contact)}">
      <p class="fb-how">Goes straight to the maker of Lathe. No account needed. Or <button type="button" class="link" data-a="gh">post it on GitHub</button> instead.</p>`
      : '<p class="fb-how">Sending opens a ready-filled report on GitHub; press <b>Submit new issue</b> there to post it. Posting needs a free GitHub account. No account? Use <b>Copy report</b> and send it however suits you.</p>'}
      <div class="fb-foot"><button type="button" data-a="close">Cancel</button><button type="button" data-a="copy">Copy report</button><button type="button" data-a="${direct ? 'send' : 'gh'}" class="strong">${direct ? 'Send' : 'Send on GitHub'}</button></div>`;
    dlg.querySelector('textarea').value = text;
  }
  function open(k) {
    if (k) kind = k;
    $('#status').classList.remove('report');
    draw(); dlg.showModal(); dlg.querySelector('textarea').focus();
  }
  dlg.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.k) { kind = b.dataset.k; draw(); dlg.querySelector('textarea').focus(); return; }
    const a = b.dataset.a;
    if (a === 'close') return dlg.close();
    if (!dlg.querySelector('textarea').value.trim()) { dlg.querySelector('textarea').focus(); return L.toast('Write a line or two first'); }
    if (a === 'copy') {
      try { await navigator.clipboard.writeText(`${title()}\n\n${report()}`); L.toast('Report copied'); } catch { L.toast('Could not reach the clipboard; select the text and copy it instead'); }
      return;
    }
    if (a === 'send') {
      if (sending) return;
      sending = true; b.textContent = 'Sending…';
      contact = dlg.querySelector('.fb-contact').value.trim();
      try {
        const r = await fetch(C.url + '/rest/v1/feedback', {
          method: 'POST',
          headers: { apikey: C.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ kind, message: dlg.querySelector('textarea').value.trim().slice(0, 5000), contact: contact.slice(0, 200) || null, details: dlg.querySelector('#fb-info').checked ? details().slice(0, 4000) : null }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        dlg.querySelector('textarea').value = ''; contact = ''; dlg.close();
        L.toast('Thanks! Your feedback was sent', 6000);
      } catch (err) {
        L.toast('Could not send it just now (' + err.message + '). Try again, or post it on GitHub', 7000);
        b.textContent = 'Send';
      }
      sending = false;
      return;
    }
    // GitHub reads the title and body from the address; keep it well under its length limit
    const body = report().slice(0, 6000);
    window.open(`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title())}&body=${encodeURIComponent(body)}`, '_blank', 'noopener');
    dlg.querySelector('textarea').value = ''; dlg.close();
    L.toast('Thanks! Finish posting it in the GitHub tab that just opened', 7000);
  });

  $('#b-fb').onclick = () => open();
  $('#b-fb2').onclick = () => open();
  return { open, details };
})();
