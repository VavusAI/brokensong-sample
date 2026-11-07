// Editorial matter read from each piece's MEI header: the editors' method statement, their notes on the readings
// (each linked to the bar and voice it discusses) and who encoded and proofread the piece.
const BSEdition = {
  VOICE: { tr: 'triplum', mot: 'motetus', ten: 'tenor', t: 'tenor', ct: 'contratenor', q: 'quadruplum', qu: 'quadruplum', quad: 'quadruplum', du: 'duplum' },

  header(meiText) {
    const d = new DOMParser().parseFromString(meiText, 'application/xml');
    const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    const method = [...d.querySelectorAll('encodingDesc editorialDecl')].map(txt).filter(Boolean).join(' ');
    const annot = [...d.querySelectorAll('sourceDesc annot')].find(a => a.getAttribute('label') === 'commentary');
    const notes = txt(annot).split('/').map(s => s.trim().replace(/\s*[;,]$/, '')).filter(s => s && s !== '-');
    const roles = new Map();
    for (const p of d.querySelectorAll('fileDesc > titleStmt respStmt persName')) {
      const role = p.getAttribute('role') || 'contributor', name = txt(p), year = (p.getAttribute('isodate') || '').slice(0, 4);
      if (!name) continue;
      if (!roles.has(role)) roles.set(role, { names: [], years: new Set() });
      const r = roles.get(role); if (!r.names.includes(name)) r.names.push(name); if (year) r.years.add(year);
    }
    const editors = [...d.querySelectorAll('fileDesc > titleStmt > editor')].map(txt).filter(Boolean);
    const series = txt(d.querySelector('fileDesc seriesStmt > title'));
    return { method, notes, roles, editors, series };
  },

  creditsLine(h) {
    const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0];
    const part = (role, verb) => { const r = h.roles.get(role); return r ? `${verb} by ${list(r.names)}${r.years.size ? ' (' + [...r.years].sort().join(', ') + ')' : ''}` : ''; };
    const bits = [h.editors.length ? `Edited by ${list(h.editors)}` : '', part('encoder', 'encoded'), part('proofreader', 'proofread')].filter(Boolean);
    return bits.length ? bits.join('; ') + '.' : '';
  },

  // One note, e.g. "Ten 4, 17, 30: breve rest not in MS". Bar references at the start become links to those bars.
  noteHTML(raw, voices, state, links) {
    let rest = raw, out = '';
    const vm = rest.match(/^((?:(?:Tr|Mot|Ten|T|CT|Ct|Q|Qu|Quad|Du)(?=[\s,.:])[\s,.]*)+)/);
    if (vm) {
      const names = vm[1].split(/[\s,.]+/).filter(Boolean).map(a => this.VOICE[a.toLowerCase()]).filter(Boolean);
      state.staves = names.map(n => voices.indexOf(n) + 1).filter(n => n > 0);
      out += BS.esc(vm[1]); rest = rest.slice(vm[1].length);
    }
    const lm = rest.match(/^(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)*(?:\s*,\s*\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)*)*)(?![A-Za-z\d])/);
    if (lm && (vm || state.staves)) {
      out += lm[1].split(/(\s*,\s*)/).map(tok => {
        const bar = (tok.match(/^\d+/) || [])[0];
        return bar && links ? `<a href="#score" class="barref" data-bar="${bar}" data-staves="${(state.staves || []).join(',')}">${BS.esc(tok)}</a>` : BS.esc(tok);
      }).join('');
      rest = rest.slice(lm[1].length);
    }
    return out + BS.esc(rest);
  },

  commentaryHTML(h, c, links) {
    const state = {}, voices = (c.voices || []).map(v => v.toLowerCase());
    const breves = /refer to the breve units/i.test(h.notes.join(' '));   // these editors count breves, not bars: no bar links
    if (breves) links = false;
    let html = '';
    if (h.method) html += `<h3>Editorial method</h3><p>${BS.esc(h.method)}</p>`;
    if (h.notes.length) html += `<h3>Notes on the readings</h3><p class="hint">${breves ? 'As the editors note, numbers here count breves, not bars.' : (links ? 'Bar numbers are links: they open the bar in the edition.' : 'Bar numbers refer to the transcription.') + ' “4.2” is bar 4, second note.'} Tr = triplum, Mot = motetus, Ten/T = tenor.</p><ul class="readings">${h.notes.map(n => `<li>${this.noteHTML(n, voices, state, links)}</li>`).join('')}</ul>`;
    if (c.fragmentary) html += `<h3>Reconstruction</h3><p>In this sample, ${BS.esc(c.reconstructed_bars)} are encoded as an editorial reconstruction (MEI <code>&lt;supplied&gt;</code>) only to demonstrate how the edition shows reconstructed music; the marking is not an editorial claim about the source.</p>`;
    const credits = this.creditsLine(h);
    if (credits || h.series) html += `<p class="credit">${BS.esc(credits)}${h.series ? ` Encoding and commentary from <i>${BS.esc(h.series)}</i> (CC BY 3.0).` : ''}</p>`;
    return html;
  },
};
