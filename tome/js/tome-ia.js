/* Tòme : discussion avec l'agent Tòme IA, et gestion de ses connaissances par l'équipe. */
document.addEventListener('DOMContentLoaded', () => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const Auth = window.TomeAuth;
  const thread = $('#ia-thread'), form = $('#ia-form'), input = $('#ia-input');
  const KEY = 'tome_ia_v1';
  let history = [];
  try { history = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) {}
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = s => window.marked ? marked.parse(esc(s)) : '<p>' + esc(s).replace(/\n/g, '<br>') + '</p>';
  const demo = Auth.isDemo();

  function bubble(m) {
    const el = document.createElement('div');
    el.className = 'ia-msg ' + (m.role === 'user' ? 'me' : 'bot');
    el.innerHTML = m.role === 'user' ? `<p>${esc(m.content).replace(/\n/g, '<br>')}</p>` : `<div class="ia-md">${md(m.content)}</div>${m.sources && m.sources.length ? `<div class="ia-src">Sources : ${m.sources.map(esc).join(', ')}</div>` : ''}${m.id ? '<div class="ia-fb"><button data-v="bien" title="Bonne réponse">👍</button><button data-v="pas_bien" title="Réponse à améliorer">👎</button></div>' : ''}`;
    $$('.ia-fb button', el).forEach(b => b.addEventListener('click', async () => {
      const q = history[history.indexOf(m) - 1]?.content || '';
      let com = '';
      if (b.dataset.v === 'pas_bien') com = prompt('Qu’est-ce qui n’allait pas ? (facultatif)') || '';
      try { await Auth.api('/api/agent/avis', { method: 'POST', body: { avis: b.dataset.v, question: q, commentaire: com } }); b.parentElement.innerHTML = '<span class="small">Merci pour votre avis !</span>'; } catch (e) {}
    }));
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
    return el;
  }
  function render() {
    thread.innerHTML = '';
    if (!history.length) thread.innerHTML = `<div class="ia-hello"><div class="ia-logo">{{icon}}</div><h2>Bonjour, je suis Tòme IA.</h2><p>Je peux vous expliquer une leçon, vous aider à réviser, ou vous guider dans Tòme (Abaque, Mesure, Plume…).</p><div class="chips">${['Explique-moi la photosynthèse', 'Comment calculer une moyenne dans Abaque ?', 'Quel test statistique choisir pour comparer deux classes ?', 'Pourquoi la Citadelle a-t-elle été construite ?'].map(s => `<button class="chip" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`.replace('{{icon}}', '✦');
    $$('[data-q]', thread).forEach(b => b.addEventListener('click', () => { input.value = b.dataset.q; form.requestSubmit(); }));
    history.forEach(bubble);
  }
  render();
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(history.slice(-30))); } catch (e) {} };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    if (!history.length) thread.innerHTML = '';
    const um = { role: 'user', content: q };
    history.push(um); bubble(um); input.value = ''; input.style.height = 'auto';
    const wait = document.createElement('div'); wait.className = 'ia-msg bot wait'; wait.innerHTML = '<span></span><span></span><span></span>'; thread.appendChild(wait); thread.scrollTop = thread.scrollHeight;
    $('#ia-send').disabled = true;
    try {
      if (demo) throw new Error('Tòme IA sera disponible quand le site sera relié au serveur Tòme (mode démo actuellement).');
      const r = await Auth.api('/api/agent/discuter', { method: 'POST', body: { messages: history.map(m => ({ role: m.role, content: m.content })) } });
      const bm = { role: 'assistant', content: r.reponse, sources: r.sources, id: r.id };
      history.push(bm); wait.remove(); bubble(bm); save();
    } catch (er) {
      wait.remove(); history.pop();
      const el = document.createElement('div'); el.className = 'ia-msg bot err'; el.textContent = er.message; thread.appendChild(el);
      input.value = q;
    } finally { $('#ia-send').disabled = false; input.focus(); }
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; });
  $('#ia-new').addEventListener('click', () => { history = []; save(); render(); input.focus(); });
  if (window.marked === undefined) { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js'; s.onload = render; document.head.appendChild(s); }

  /* ---------- Équipe : connaissances de l'agent ---------- */
  const me = Auth.user();
  if (!me || !me.admin || demo) return;
  $('#ia-admin').hidden = false;
  const list = $('#kb-list'), name = $('#kb-name'), text = $('#kb-text');
  async function loadKb() {
    try {
      const d = await Auth.api('/api/agent/connaissances');
      $('#kb-meta').textContent = `${d.fiches.length} fiche(s) · modèle ${d.modele} · ${d.limite_jour} questions par élève et par jour`;
      $('#kb-instr').value = d.instructions;
      list.innerHTML = d.fiches.map(f => `<button class="nb-item kb-item" data-n="${esc(f.nom)}"><div class="grow"><div class="t">${esc(f.nom)}</div><div class="s">${Math.round(f.taille / 100) / 10} Ko</div></div></button>`).join('') || '<p class="small">Aucune fiche pour l’instant.</p>';
      $$('.kb-item', list).forEach(b => b.addEventListener('click', async () => { const r = await Auth.api('/api/agent/connaissances/' + encodeURIComponent(b.dataset.n)); name.value = r.nom; text.value = r.contenu; }));
      const j = await Auth.api('/api/agent/journal');
      $('#kb-journal').innerHTML = `<p class="small">${j.total} question(s) ce mois-ci.</p>` + (j.sans_reponse.length ? '<h3>Questions sans fiche correspondante</h3>' + j.sans_reponse.map(r => `<div class="nb-item"><div class="grow"><div class="t">${esc(r.question)}</div><div class="s">${new Date(r.date).toLocaleDateString('fr-FR')}</div></div><button data-new="${esc(r.question)}">Créer une fiche</button></div>`).join('') : '') +
        (j.avis_negatifs.length ? '<h3 style="margin-top:12px;">Avis négatifs</h3>' + j.avis_negatifs.map(r => `<div class="nb-item"><div class="grow"><div class="t">${esc(r.question || '(question non précisée)')}</div><div class="s">${esc(r.avis)}</div></div></div>`).join('') : '');
      $$('[data-new]').forEach(b => b.addEventListener('click', () => { name.value = ''; text.value = '# ' + b.dataset.new + '\n\n'; text.focus(); }));
    } catch (e) { $('#kb-meta').textContent = e.message; }
  }
  $('#kb-save').addEventListener('click', async () => {
    if (!name.value.trim()) return alert('Donnez un nom à la fiche (par exemple : revolution-haitienne).');
    try { await Auth.api('/api/agent/connaissances/' + encodeURIComponent(name.value.trim()), { method: 'PUT', body: { contenu: text.value } }); loadKb(); alert('Fiche enregistrée. L’agent l’utilisera dès la prochaine question.'); } catch (e) { alert(e.message); }
  });
  $('#kb-del').addEventListener('click', async () => {
    if (!name.value.trim() || !confirm('Supprimer la fiche ' + name.value + ' ?')) return;
    try { await Auth.api('/api/agent/connaissances/' + encodeURIComponent(name.value.trim()), { method: 'DELETE' }); name.value = ''; text.value = ''; loadKb(); } catch (e) { alert(e.message); }
  });
  $('#kb-new').addEventListener('click', () => { name.value = ''; text.value = '# Titre de la fiche\n\n'; text.focus(); });
  $('#kb-instr-save').addEventListener('click', async () => { try { await Auth.api('/api/agent/instructions', { method: 'PUT', body: { contenu: $('#kb-instr').value } }); alert('Instructions enregistrées.'); } catch (e) { alert(e.message); } });
  loadKb();
});
