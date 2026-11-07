// Shared helpers for the BROKENSONG sample edition (static site: no server-side code).
const BS = {
  async json(p) { const r = await fetch(p); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); },
  q(name) { return new URLSearchParams(location.search).get(name); },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  fold(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/v/g, 'u').replace(/j/g, 'i'); }, // u/v and i/j are one letter in medieval spelling
  chrome(active) {
    const logo = `<svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true"><rect x="1" y="1" width="36" height="36" rx="7" fill="#9e2b25"/>
      <g stroke="#f7f3ea" stroke-width="1.6"><path d="M7 12h10M21 12h10M7 17h7M18 17h13M7 22h12M23 22h8M7 27h5M16 27h15"/></g>
      <rect x="15" y="14.5" width="4" height="5" fill="#f7f3ea" transform="rotate(45 17 17)"/></svg>`;
    const nav = [['index.html','Home'],['browse.html','Compositions'],['browse.html?tab=sources','Sources'],['about.html','About the edition']]
      .map(([h,t]) => `<a href="${h}" class="${active===t?'on':''}">${t}</a>`).join('');
    document.body.insertAdjacentHTML('afterbegin', `<header class="site"><div class="in">
      <a class="brand" href="index.html">${logo}<span><span class="word">BROKEN<b>SONG</b></span><small>Polyphony in Britain and Ireland, c.1150–1350 · online edition</small></span></a>
      <nav class="main">${nav}</nav>
      <form class="searchbox" action="browse.html"><input name="q" type="search" placeholder="Search titles and texts" aria-label="Search"></form></div></header>`);
    document.body.insertAdjacentHTML('beforeend', `<footer class="site"><div class="in">
      Working sample prepared by DCI Brands LLC for Maynooth University tender PCO 543 (not the project's site). Music encodings: <i>Measuring Polyphony</i>, ed. Karen Desmond (CC BY 3.0);
      one passage marked as reconstructed for demonstration. Source data: DIAMM public API. Manuscript images remain with their holding libraries; home picture: British Library (CC0). Choir sound: FluidR3 GM (CC BY 3.0).</div></footer>`);
  },
  badgeRow(c) {
    return `${c.fragmentary ? '<span class="badge frag">Fragmentary · reconstruction shown</span>' : ''}${c.iiif ? '<span class="badge img">Manuscript images</span>' : ''}<span class="badge">${c.nvoices} voices</span>${c.language ? `<span class="badge">${BS.esc(c.language)}</span>` : ''}`;
  },
  incipit(c) { const v = Object.values(c.texts || {})[0] || ''; return v.split(' ').slice(0, 9).join(' ') + (v.split(' ').length > 9 ? ' …' : ''); },
};
