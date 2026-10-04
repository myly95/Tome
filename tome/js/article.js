/* Tòme : page d'article de l'Encyclopédie (sommaire et articles voisins) */
document.addEventListener('DOMContentLoaded', () => {
  const art = document.querySelector('.article');
  const body = document.getElementById('article-body');
  if (!art || !body) return;

  /* Sommaire à partir des titres h2 */
  const toc = document.getElementById('toc');
  const slugify = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const heads = [...body.querySelectorAll('h2')];
  if (heads.length > 1) {
    const title = document.createElement('div');
    title.className = 'toc-title';
    title.textContent = 'Sommaire';
    const ol = document.createElement('ol');
    heads.forEach(h => {
      if (!h.id) h.id = slugify(h.textContent);
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#' + h.id; a.textContent = h.textContent;
      li.appendChild(a); ol.appendChild(li);
    });
    toc.append(title, ol);
    if ('IntersectionObserver' in window) {
      const links = new Map([...ol.querySelectorAll('a')].map(a => [a.getAttribute('href').slice(1), a]));
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            links.forEach(a => a.classList.remove('on'));
            links.get(e.target.id)?.classList.add('on');
          }
        });
      }, { rootMargin: '0px 0px -70% 0px' });
      heads.forEach(h => io.observe(h));
    }
  } else {
    toc.remove();
    art.classList.add('no-toc');
  }

  /* Articles précédent et suivant */
  const list = (window.TOME_ENCYCLOPEDIE || []).filter(e => e.publie);
  const i = list.findIndex(e => e.slug === art.dataset.slug);
  const nav = document.getElementById('article-nav');
  const card = (e, label, cls) => {
    const a = document.createElement('a');
    a.className = 'card ' + cls;
    a.href = e.slug + '.html';
    a.innerHTML = '<div class="meta" style="margin:0 0 6px;"></div><h3></h3>';
    a.querySelector('.meta').textContent = label + ' · ' + e.matiere;
    a.querySelector('h3').textContent = e.titre;
    return a;
  };
  if (i > 0) nav.appendChild(card(list[i - 1], 'Article précédent', 'prev'));
  if (i >= 0 && i < list.length - 1) nav.appendChild(card(list[i + 1], 'Article suivant', 'next'));
  if (!nav.children.length) nav.remove();
});
