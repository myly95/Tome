/* Tòme : Plume, traitement de texte.
 * Format natif .plm (JSON), import .docx (mammoth, BSD), export .docx (docx, MIT), PDF par impression.
 */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const STORE = 'tome_plume_v1';
  const LIB = {
    mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.13.0/mammoth.browser.min.js',
    docx: 'https://cdn.jsdelivr.net/npm/docx@9.8.1/dist/index.iife.js',
    marked: 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js'
  };
  const ed = $('#editor'), titleEl = $('#doc-title');
  let state = load() || { current: null, docs: {} };
  let doc = null;

  /* ---------------- Utilitaires ---------------- */
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; } }
  function persist() {
    if (!doc) return;
    doc.titre = titleEl.value || 'Document sans titre';
    doc.html = ed.innerHTML;
    doc.maj = Date.now();
    doc.dirty = true;
    state.docs[doc.id] = doc; state.current = doc.id;
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { toast('Mémoire du navigateur pleine : enregistrez ou supprimez des documents.', true); }
    counts();
  }
  let pt; const persistSoon = () => { clearTimeout(pt); pt = setTimeout(persist, 500); };
  const newId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const safe = n => (n || 'document').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'document';
  const toast = (msg, isErr) => {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
  };
  const saveAs = (name, data, type) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const loaded = {};
  function lib(name) {
    if (loaded[name]) return loaded[name];
    loaded[name] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = LIB[name];
      s.onload = res; s.onerror = () => { loaded[name] = null; rej(new Error('Module indisponible : vérifiez la connexion internet.')); };
      document.head.appendChild(s);
    });
    return loaded[name];
  }

  /* ---------------- Nettoyage du HTML (documents importés) ---------------- */
  const OK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'DEL', 'BR', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'HR', 'SPAN', 'DIV', 'SUB', 'SUP', 'CODE', 'PRE', 'MARK', 'FONT']);
  const OK_STYLE = ['text-align', 'color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'width'];
  function sanitize(html) {
    const d = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) return;
        if (n.nodeType !== 1) { n.remove(); return; }
        if (!OK_TAGS.has(n.tagName)) {
          if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TITLE', 'META', 'LINK'].includes(n.tagName)) { n.remove(); return; }
          walk(n); n.replaceWith(...n.childNodes); return;
        }
        [...n.attributes].forEach(a => {
          const k = a.name.toLowerCase();
          if (k === 'href' && n.tagName === 'A' && /^(https?:|mailto:|#)/i.test(a.value)) return;
          if (k === 'src' && n.tagName === 'IMG' && /^(data:image\/(png|jpe?g|gif|webp);|https:)/i.test(a.value)) return;
          if (k === 'class' && n.tagName === 'HR' && a.value === 'page-break') return;
          if ((k === 'colspan' || k === 'rowspan') && /^\d+$/.test(a.value)) return;
          if (k === 'alt' || k === 'width' || k === 'height') return;
          if (k === 'color' && n.tagName === 'FONT') return;
          if (k === 'style') { const keep = a.value.split(';').map(x => x.trim()).filter(x => OK_STYLE.includes(x.split(':')[0].trim().toLowerCase()) && !/url\(|expression/i.test(x)); if (keep.length) { n.setAttribute('style', keep.join('; ')); return; } }
          n.removeAttribute(a.name);
        });
        if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener'); }
        walk(n);
      });
    };
    walk(d.body.firstChild);
    return d.body.firstChild.innerHTML;
  }

  /* Un paragraphe ne doit pas contenir de liste, de tableau ou de titre : on le découpe. */
  const BLOCK = /^(UL|OL|TABLE|H[1-6]|BLOCKQUOTE|DIV|PRE|HR|P)$/;
  function normalize(root = ed) {
    let changed = false;
    $$('p', root).forEach(p => {
      if (![...p.children].some(c => BLOCK.test(c.tagName))) return;
      const parts = []; let cur = null;
      [...p.childNodes].forEach(n => {
        if (n.nodeType === 1 && BLOCK.test(n.tagName)) { cur = null; parts.push(n); }
        else { if (!cur) { cur = document.createElement('p'); parts.push(cur); } cur.appendChild(n); }
      });
      p.replaceWith(...parts.filter(x => x.tagName !== 'P' || x.textContent.trim() || x.querySelector('img,br')));
      changed = true;
    });
    return changed;
  }
  function currentBlock() {
    const s = getSelection();
    let n = s.rangeCount ? s.getRangeAt(0).startContainer : null;
    while (n && n.parentNode !== ed) n = n.parentNode;
    return n && n !== ed ? n : null;
  }
  function insertBlockAfter(el) {
    const b = currentBlock();
    const after = document.createElement('p'); after.innerHTML = '<br>';
    if (b) { b.after(el); el.after(after); } else { ed.append(el, after); }
    return after;
  }

  /* ---------------- Documents ---------------- */
  const BIENVENUE = `<h1>Bienvenue dans Plume</h1><p>Plume est le traitement de texte de Tòme. Écrivez vos devoirs, vos rapports et vos histoires, puis exportez-les en <strong>Word (.docx)</strong> ou en <strong>PDF</strong>.</p><h2>Pour commencer</h2><ul><li>Choisissez un style (Titre 1, Titre 2…) dans la barre d'outils.</li><li>Utilisez <strong>Ctrl B</strong>, <em>Ctrl I</em> et <u>Ctrl U</u> pour le gras, l'italique et le souligné.</li><li>Insérez des images, des tableaux et des sauts de page.</li></ul><blockquote>Votre document s'enregistre automatiquement sur cet appareil. Sauvegardez-le dans votre espace Tòme pour le retrouver partout.</blockquote><p>Effacez ce texte et commencez à écrire.</p>`;
  function openDoc(d) {
    if (doc) persist();
    doc = d;
    titleEl.value = d.titre || 'Document sans titre';
    ed.innerHTML = sanitize(d.html || '<p><br></p>');
    normalize();
    persist();
    doc.dirty = !!d.dirty;
    counts();
    ed.focus();
  }
  const fresh = (titre = 'Document sans titre', html = '<p><br></p>') => ({ id: newId(), titre, html, maj: Date.now() });

  /* ---------------- Commandes de mise en forme ---------------- */
  const cmd = (c, v = null) => { ed.focus(); document.execCommand(c, false, v); normalize(); syncTools(); persistSoon(); };
  $$('[data-cmd]').forEach(b => b.addEventListener('mousedown', e => { e.preventDefault(); cmd(b.dataset.cmd, b.dataset.val || null); }));
  $('#block-style').addEventListener('change', e => { cmd('formatBlock', e.target.value); });
  $('#fore-color').addEventListener('input', e => cmd('foreColor', e.target.value));
  $('#hilite-color').addEventListener('input', e => cmd('hiliteColor', e.target.value));
  $('#btn-link').addEventListener('mousedown', e => {
    e.preventDefault();
    const url = prompt('Adresse du lien (https://…) :', 'https://');
    if (url && /^(https?:|mailto:)/i.test(url)) cmd('createLink', url);
  });
  $('#btn-image').addEventListener('mousedown', e => { e.preventDefault(); saveRange(); $('#image-file').click(); });
  $('#image-file').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(f.type)) return toast('Format d’image non pris en charge.', true);
    const url = await shrinkImage(f, 1400);
    restoreRange();
    cmd('insertHTML', `<img src="${url}" alt="">`);
  });
  $('#btn-table').addEventListener('mousedown', e => {
    e.preventDefault();
    const s = prompt('Taille du tableau (colonnes × lignes) :', '3 x 3');
    if (!s) return;
    const m = /(\d+)\s*[x×*]\s*(\d+)/i.exec(s); if (!m) return;
    const c = Math.min(12, +m[1]), r = Math.min(60, +m[2]);
    const table = document.createElement('table'), tb = document.createElement('tbody');
    for (let i = 0; i < r; i++) { const tr = document.createElement('tr'); for (let j = 0; j < c; j++) { const cell = document.createElement(i === 0 ? 'th' : 'td'); cell.innerHTML = '<br>'; tr.appendChild(cell); } tb.appendChild(tr); }
    table.appendChild(tb);
    ed.focus();
    insertBlockAfter(table);
    const range = document.createRange(); range.setStart(table.querySelector('th,td'), 0); range.collapse(true);
    const sl = getSelection(); sl.removeAllRanges(); sl.addRange(range);
    persistSoon();
  });
  $('#btn-pagebreak').addEventListener('mousedown', e => {
    e.preventDefault(); ed.focus();
    const hr = document.createElement('hr'); hr.className = 'page-break';
    const after = insertBlockAfter(hr);
    const range = document.createRange(); range.setStart(after, 0); range.collapse(true);
    const sl = getSelection(); sl.removeAllRanges(); sl.addRange(range);
    persistSoon();
  });
  $('#btn-clear').addEventListener('mousedown', e => { e.preventDefault(); cmd('removeFormat'); cmd('formatBlock', 'p'); });
  let savedRange = null;
  const saveRange = () => { const s = getSelection(); savedRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null; };
  const restoreRange = () => { ed.focus(); if (savedRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); } };
  function shrinkImage(file, max) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
        URL.revokeObjectURL(img.src);
      };
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }
  function syncTools() {
    ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].forEach(c => {
      const b = $(`[data-cmd="${c}"]`); if (b) b.classList.toggle('on', document.queryCommandState(c));
    });
    const block = (document.queryCommandValue('formatBlock') || 'p').toLowerCase();
    const sel = $('#block-style');
    sel.value = ['h1', 'h2', 'h3', 'blockquote', 'p'].includes(block) ? block : 'p';
  }
  document.addEventListener('selectionchange', () => { if (ed.contains(getSelection().anchorNode)) syncTools(); });
  ed.addEventListener('input', () => { normalize(); persistSoon(); });
  titleEl.addEventListener('input', persistSoon);
  ed.addEventListener('paste', e => {
    const html = e.clipboardData.getData('text/html');
    if (html) { e.preventDefault(); document.execCommand('insertHTML', false, sanitize(html)); persistSoon(); }
  });
  ed.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); savePlm(); }
    if (e.key === 'Tab' && !e.shiftKey && document.queryCommandState('insertUnorderedList') + document.queryCommandState('insertOrderedList')) { e.preventDefault(); cmd('indent'); }
    if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); cmd('outdent'); }
  });

  function counts() {
    const t = ed.innerText.replace(/\s+/g, ' ').trim();
    const words = t ? t.split(' ').length : 0;
    $('#doc-count').textContent = `${words.toLocaleString('fr-FR')} mot${words > 1 ? 's' : ''} · ${t.length.toLocaleString('fr-FR')} caractères`;
  }

  /* ---------------- Fichiers ---------------- */
  const toPlm = () => ({ format: 'plume', version: 1, cree_avec: 'Tòme Plume', titre: titleEl.value, html: ed.innerHTML, maj: new Date().toISOString() });
  function savePlm() { persist(); saveAs(safe(titleEl.value) + '.plm', JSON.stringify(toPlm()), 'application/json'); toast('Document enregistré (.plm).'); }
  async function importFile(name, bytes) {
    const ext = (name.split('.').pop() || '').toLowerCase(), base = name.replace(/\.[^.]+$/, '');
    const text = () => new TextDecoder().decode(bytes);
    if (ext === 'plm') { const o = JSON.parse(text()); if (o.format !== 'plume') throw new Error('Ce fichier n’est pas un document Plume.'); openDoc({ ...fresh(o.titre || base), html: o.html }); return; }
    if (ext === 'docx') {
      await lib('mammoth');
      const r = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, { styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Quote'] => blockquote:fresh"] });
      openDoc({ ...fresh(base), html: r.value || '<p><br></p>' });
      if (r.messages.some(m => m.type === 'warning')) toast('Document ouvert. Certaines mises en forme Word avancées ont été simplifiées.');
      return;
    }
    if (ext === 'md') { await lib('marked'); openDoc({ ...fresh(base), html: marked.parse(text()) }); return; }
    if (ext === 'html' || ext === 'htm') { openDoc({ ...fresh(base), html: new DOMParser().parseFromString(text(), 'text/html').body.innerHTML }); return; }
    if (ext === 'txt') { openDoc({ ...fresh(base), html: text().split(/\n{2,}/).map(p => '<p>' + p.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/\n/g, '<br>') + '</p>').join('') }); return; }
    throw new Error('Format non pris en charge : .' + ext);
  }

  /* Export .docx : conversion du document en paragraphes Word */
  async function exportDocx() {
    await lib('docx');
    const D = window.docx;
    const ALIGN = { left: D.AlignmentType.LEFT, center: D.AlignmentType.CENTER, right: D.AlignmentType.RIGHT, justify: D.AlignmentType.JUSTIFIED };
    const hex = c => { if (!c) return undefined; const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); if (m) return [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join(''); const h = /^#?([0-9a-f]{6})$/i.exec(c.trim()); return h ? h[1] : undefined; };
    function runs(node, f = {}) {
      const out = [];
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) { if (n.textContent) out.push(new D.TextRun({ text: n.textContent.replace(/ /g, ' '), bold: f.b, italics: f.i, underline: f.u ? {} : undefined, strike: f.s, color: f.color, superScript: f.sup, subScript: f.sub, shading: f.bg ? { fill: f.bg, type: D.ShadingType.CLEAR, color: 'auto' } : undefined, font: f.code ? 'Consolas' : undefined })); return; }
        if (n.nodeType !== 1) return;
        const t = n.tagName, st = n.style || {};
        if (t === 'BR') { out.push(new D.TextRun({ break: 1 })); return; }
        if (t === 'IMG') { const im = imageRun(n); if (im) out.push(im); return; }
        const g = { ...f };
        if (t === 'B' || t === 'STRONG' || st.fontWeight === 'bold' || +st.fontWeight >= 600) g.b = true;
        if (t === 'I' || t === 'EM' || st.fontStyle === 'italic') g.i = true;
        if (t === 'U' || /underline/.test(st.textDecoration || '')) g.u = true;
        if (t === 'S' || t === 'STRIKE' || t === 'DEL' || /line-through/.test(st.textDecoration || '')) g.s = true;
        if (t === 'SUP') g.sup = true; if (t === 'SUB') g.sub = true; if (t === 'CODE') g.code = true;
        if (st.color || n.getAttribute('color')) g.color = hex(st.color || n.getAttribute('color'));
        if (st.backgroundColor || t === 'MARK') g.bg = hex(st.backgroundColor) || 'FFF3C4';
        if (t === 'A' && n.href) { out.push(new D.ExternalHyperlink({ link: n.href, children: [new D.TextRun({ text: n.textContent, style: 'Hyperlink' })] })); return; }
        out.push(...runs(n, g));
      });
      return out;
    }
    function imageRun(img) {
      const m = /^data:image\/(png|jpe?g|gif);base64,(.*)$/i.exec(img.src || '');
      if (!m) return null;
      const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const w0 = img.naturalWidth || 400, h0 = img.naturalHeight || 300, k = Math.min(1, 600 / w0);
      return new D.ImageRun({ type: m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase(), data: bytes, transformation: { width: Math.round(w0 * k), height: Math.round(h0 * k) } });
    }
    const para = (node, extra = {}) => new D.Paragraph({ children: runs(node), alignment: ALIGN[node.style && node.style.textAlign], ...extra });
    function blocks(container, level = 0) {
      const out = [];
      container.childNodes.forEach(n => {
        if (n.nodeType === 3) { if (n.textContent.trim()) out.push(new D.Paragraph({ children: [new D.TextRun(n.textContent)] })); return; }
        if (n.nodeType !== 1) return;
        const t = n.tagName;
        if (t === 'H1') out.push(para(n, { heading: D.HeadingLevel.HEADING_1 }));
        else if (t === 'H2') out.push(para(n, { heading: D.HeadingLevel.HEADING_2 }));
        else if (t === 'H3' || t === 'H4') out.push(para(n, { heading: D.HeadingLevel.HEADING_3 }));
        else if (t === 'BLOCKQUOTE') out.push(new D.Paragraph({ children: runs(n, { i: true }), indent: { left: 720 }, border: { left: { style: D.BorderStyle.SINGLE, size: 12, color: 'C8962E', space: 8 } } }));
        else if (t === 'UL' || t === 'OL') {
          [...n.children].forEach(li => {
            const inner = li.cloneNode(true); inner.querySelectorAll('ul,ol').forEach(x => x.remove());
            out.push(new D.Paragraph({ children: runs(inner), ...(t === 'UL' ? { bullet: { level } } : { numbering: { reference: 'num', level } }) }));
            li.querySelectorAll(':scope > ul, :scope > ol').forEach(sub => { const wrap = document.createElement('div'); wrap.appendChild(sub.cloneNode(true)); out.push(...blocks(wrap, level + 1)); });
          });
        } else if (t === 'TABLE') {
          const rows = [...n.querySelectorAll('tr')].map(tr => new D.TableRow({ children: [...tr.children].map(td => new D.TableCell({ children: (() => { const b = blocks(td); return b.length ? b : [para(td)]; })(), columnSpan: +td.getAttribute('colspan') || undefined, shading: td.tagName === 'TH' ? { fill: 'EFE7D6', type: D.ShadingType.CLEAR, color: 'auto' } : undefined })) }));
          if (rows.length) out.push(new D.Table({ rows, width: { size: 100, type: D.WidthType.PERCENTAGE } }), new D.Paragraph(''));
        } else if (t === 'HR') out.push(n.classList.contains('page-break') ? new D.Paragraph({ children: [new D.PageBreak()] }) : new D.Paragraph({ border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 } } }));
        else if (t === 'IMG') { const im = imageRun(n); if (im) out.push(new D.Paragraph({ children: [im] })); }
        else if ((t === 'DIV' || t === 'P') && [...n.children].some(c => /^(P|H\d|UL|OL|TABLE|BLOCKQUOTE|DIV|PRE|HR)$/.test(c.tagName))) out.push(...blocks(n, level));
        else if (t === 'PRE') out.push(new D.Paragraph({ children: runs(n, { code: true }) }));
        else out.push(para(n));
      });
      return out;
    }
    const d = new D.Document({
      creator: 'Tòme Plume', title: titleEl.value,
      styles: { default: { document: { run: { font: 'Calibri', size: 24 } } } },
      numbering: { config: [{ reference: 'num', levels: [0, 1, 2, 3].map(l => ({ level: l, format: [D.LevelFormat.DECIMAL, D.LevelFormat.LOWER_LETTER, D.LevelFormat.LOWER_ROMAN, D.LevelFormat.DECIMAL][l], text: `%${l + 1}.`, alignment: D.AlignmentType.START, style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } } })) }] },
      sections: [{ children: blocks(ed) }]
    });
    const blob = await D.Packer.toBlob(d);
    saveAs(safe(titleEl.value) + '.docx', blob);
    toast('Document exporté en Word (.docx).');
  }
  function exportHtml() {
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${titleEl.value.replace(/</g, '&lt;')}</title><style>body{font-family:Georgia,serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.6;color:#14213d}img{max-width:100%}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px}blockquote{border-left:3px solid #c8962e;margin-left:0;padding-left:16px;font-style:italic}</style></head><body>${ed.innerHTML}</body></html>`;
    saveAs(safe(titleEl.value) + '.html', html, 'text/html');
  }

  /* Espace Tòme */
  async function saveToEspace() {
    if (!(window.TomeEspace && TomeEspace.disponible())) return toast('Connectez-vous pour sauvegarder dans votre espace Tòme.', true);
    persist();
    try {
      const r = await TomeEspace.enregistrerFichier(doc.espace || safe(titleEl.value) + '.plm', new TextEncoder().encode(JSON.stringify(toPlm())));
      doc.espace = r.nom; doc.dirty = false; state.docs[doc.id] = doc; localStorage.setItem(STORE, JSON.stringify(state));
      toast('Document sauvegardé dans votre espace (' + r.nom + ').');
    } catch (e) { toast(e.message, true); }
  }

  /* Mes documents */
  async function showDocs() {
    persist();
    const local = $('#docs-local'), remote = $('#docs-espace');
    local.innerHTML = '';
    Object.values(state.docs).sort((a, b) => b.maj - a.maj).forEach(d => {
      const row = document.createElement('div'); row.className = 'nb-item' + (d.id === doc.id ? ' current' : '');
      row.innerHTML = '<div class="grow"><div class="t"></div><div class="s"></div></div><button data-a="o">Ouvrir</button><button data-a="d">Supprimer</button>';
      row.querySelector('.t').textContent = d.titre;
      row.querySelector('.s').textContent = new Date(d.maj).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      row.querySelector('[data-a=o]').addEventListener('click', () => { openDoc(state.docs[d.id]); $('#dlg-docs').close(); });
      row.querySelector('[data-a=d]').addEventListener('click', () => {
        if (!confirm('Supprimer « ' + d.titre + ' » de cet appareil ?')) return;
        delete state.docs[d.id];
        if (d.id === doc.id) { doc = null; openDoc(Object.values(state.docs)[0] || fresh()); }
        localStorage.setItem(STORE, JSON.stringify(state)); showDocs();
      });
      local.appendChild(row);
    });
    $('#dlg-docs').open || $('#dlg-docs').showModal();
    if (!(window.TomeEspace && TomeEspace.disponible())) { remote.innerHTML = '<p class="small">Connectez-vous pour retrouver vos documents sur tous vos appareils.</p>'; return; }
    remote.innerHTML = '<p class="small">Chargement…</p>';
    try {
      const d = await TomeEspace.liste();
      const items = d.fichiers.filter(f => /\.(plm|docx|txt|md|html?)$/i.test(f.nom));
      remote.innerHTML = items.length ? '' : '<p class="small">Aucun document dans votre espace.</p>';
      items.forEach(it => {
        const row = document.createElement('div'); row.className = 'nb-item';
        row.innerHTML = '<div class="grow"><div class="t"></div></div><button>Ouvrir</button>';
        row.querySelector('.t').textContent = it.nom;
        row.querySelector('button').addEventListener('click', async () => {
          try { await importFile(it.nom, await TomeEspace.lire('fichiers', it.nom)); if (/\.plm$/i.test(it.nom)) { doc.espace = it.nom; persist(); } $('#dlg-docs').close(); }
          catch (e) { toast(e.message, true); }
        });
        remote.appendChild(row);
      });
    } catch (e) { remote.innerHTML = ''; toast(e.message, true); }
  }

  /* ---------------- Menus et démarrage ---------------- */
  $$('.menu > button').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const m = b.parentElement, open = m.classList.contains('open');
    $$('.menu.open').forEach(x => x.classList.remove('open'));
    if (!open) m.classList.add('open');
  }));
  document.addEventListener('click', () => $$('.menu.open').forEach(x => x.classList.remove('open')));
  const ACTIONS = {
    nouveau: () => openDoc(fresh()),
    ouvrir: () => $('#open-file').click(),
    docs: showDocs,
    plm: savePlm,
    docx: () => exportDocx().catch(e => toast(e.message, true)),
    pdf: () => { persist(); window.print(); },
    html: exportHtml,
    espace: saveToEspace
  };
  $$('[data-action]').forEach(b => b.addEventListener('click', () => { $$('.menu.open').forEach(x => x.classList.remove('open')); ACTIONS[b.dataset.action](); }));
  $('#open-file').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { await importFile(f.name, new Uint8Array(await f.arrayBuffer())); toast('Document ouvert.'); } catch (er) { toast('Ouverture impossible : ' + er.message, true); }
  });
  $$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  setInterval(() => { if (doc && doc.espace && doc.dirty && window.TomeEspace && TomeEspace.disponible()) saveToEspace(); }, 5 * 60 * 1000);
  window.addEventListener('beforeunload', persist);

  document.addEventListener('DOMContentLoaded', () => {
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); document.execCommand('styleWithCSS', false, false); } catch (e) {}
    const first = state.docs[state.current] || Object.values(state.docs)[0];
    openDoc(first || fresh('Mon premier document', BIENVENUE));
  });
})();
