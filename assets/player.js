// Playback for the BROKENSONG sample edition (runs entirely in the reader's browser).
// Verovio supplies every note's pitch, start and length from the MEI, at the encoders' own tempo (scoreDef@midi.bpm).
// Each note is sung by a recorded choir sound (FluidR3 GM "Choir Aahs", CC BY 3.0; one short file per pitch, loaded
// only for the pitches the piece uses) through the Web Audio API. The sounding notes are highlighted in the score.
const BSPlayer = (() => {
  const SOUND = 'assets/sound/choir/', LOW = 36, HIGH = 84, LOOKAHEAD = 1.2, TICK = 100, LEVEL = 0.55;
  let ac = null, master = null, tk = null, events = [], total = 0, voices = [], staffOf = new Map();
  const muted = new Set(), buffers = new Map(), live = new Set();
  let playing = false, pos = 0, rate = 1, t0 = 0, next = 0, timer = 0, raf = 0, lastMark = -1, marked = [];
  let ui = null, hooks = {};
  const fmt = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const fold = p => { while (p < LOW) p += 12; while (p > HIGH) p -= 12; return p; };
  const now = () => playing ? pos + (ac.currentTime - t0) * 1000 * rate : pos;

  // Read the notes of whatever the toolkit currently holds (transcription or original notation).
  function load(toolkit, voiceNames) {
    stop(); tk = toolkit; events = []; total = 0; staffOf = new Map();
    let tm = [];
    try { tm = tk.renderToTimemap({ includeMeasures: false, includeRests: false }); } catch (e) { tm = []; }
    const doc = new DOMParser().parseFromString(tk.getMEI(), 'application/xml');
    for (const n of doc.getElementsByTagName('note')) {
      const id = n.getAttribute('xml:id'), st = n.closest('staff');
      if (id && st) staffOf.set(id, +st.getAttribute('n'));
    }
    for (const e of tm) for (const id of e.on || []) {
      let v; try { v = tk.getMIDIValuesForElement(id); } catch (err) { continue; }
      if (!v || !(v.duration > 0) || !(v.pitch > 0)) continue;
      events.push({ id, t: v.time, d: v.duration, p: fold(v.pitch), s: staffOf.get(id) || 0 });
    }
    events.sort((a, b) => a.t - b.t);
    if (tm.length) total = tm[tm.length - 1].tstamp;
    for (const e of events) total = Math.max(total, e.t + e.d);
    const staves = [...new Set(events.map(e => e.s))].sort((a, b) => a - b), labels = new Map();
    for (const sd of doc.getElementsByTagName('staffDef')) {   // the encoding's own voice names win (an excerpt may skip a voice)
      const lab = sd.getAttribute('label') || [...sd.children].filter(x => x.localName === 'label').map(x => x.textContent.trim())[0];
      if (lab) labels.set(+sd.getAttribute('n'), lab);
    }
    voices = staves.map(n => ({ n, name: labels.get(n) || voiceNames[n - 1] || `voice ${n}` }));
    for (const n of [...muted]) if (!staves.includes(n)) muted.delete(n);
    render(true);
    return events.length > 0;
  }

  async function ensureAudio() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = ac.createGain(); master.gain.value = 1.6;
      master.connect(comp); comp.connect(ac.destination);
    }
    if (ac.state === 'suspended') await ac.resume();
    const need = [...new Set(events.map(e => e.p))].filter(p => !buffers.has(p));
    await Promise.all(need.map(async p => {
      const r = await fetch(`${SOUND}${p}.mp3`);
      if (!r.ok) throw new Error(`choir sound for MIDI note ${p}: HTTP ${r.status}`);
      buffers.set(p, await ac.decodeAudioData(await r.arrayBuffer()));
    }));
  }

  function sing(e, at, dur) {
    const buf = buffers.get(e.p); if (!buf) return;
    const src = ac.createBufferSource(), g = ac.createGain(), end = at + dur, rel = 0.12;
    src.buffer = buf;
    if (dur > buf.duration - 0.5) { src.loop = true; src.loopStart = 0.45; src.loopEnd = buf.duration - 0.35; } // long notes hold
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(LEVEL, at + 0.04);
    g.gain.setValueAtTime(LEVEL, Math.max(at + 0.04, end - 0.02));
    g.gain.linearRampToValueAtTime(0, end + rel);
    src.connect(g); g.connect(master);
    src.start(at); src.stop(end + rel + 0.02);
    const item = { src, g }; live.add(item); src.onended = () => live.delete(item);
  }

  function schedule() {
    const horizon = ac.currentTime + LOOKAHEAD;
    while (next < events.length) {
      const e = events[next], at = t0 + (e.t - pos) / 1000 / rate;
      if (at > horizon) break;
      next++;
      if (!muted.has(e.s)) sing(e, Math.max(at, ac.currentTime), e.d / 1000 / rate);
    }
    if (now() >= total + 250) { pause(); pos = 0; clearMarks(); render(); }
  }

  function silence() {
    const t = ac ? ac.currentTime : 0;
    for (const it of live) { try { it.g.gain.cancelScheduledValues(t); it.g.gain.setTargetAtTime(0, t, 0.03); it.src.stop(t + 0.2); } catch (e) { /* already stopped */ } }
    live.clear();
  }

  async function play() {
    if (playing || !events.length) return;
    ui.play.disabled = true; ui.play.innerHTML = 'Loading the choir…'; ui.msg.textContent = '';
    try { await ensureAudio(); } catch (e) { ui.play.disabled = false; ui.msg.textContent = `Sound could not be loaded (${e.message}).`; render(); return; }
    ui.play.disabled = false;
    if (pos >= total) pos = 0;
    playing = true; t0 = ac.currentTime + 0.06;
    next = events.findIndex(e => e.t >= pos); if (next < 0) next = events.length;
    for (const e of events) if (e.t < pos && e.t + e.d > pos && !muted.has(e.s)) sing(e, t0, (e.t + e.d - pos) / 1000 / rate);
    schedule(); timer = setInterval(schedule, TICK); lastMark = -1; raf = requestAnimationFrame(frame); render();
  }
  function pause() {
    if (!playing) return;
    pos = Math.min(now(), total); playing = false;
    clearInterval(timer); cancelAnimationFrame(raf); silence(); render();
  }
  function stop() { pause(); pos = 0; clearMarks(); render(); }
  function restart(change) { const was = playing; pause(); change(); if (was) play(); else render(); }

  function clearMarks() { for (const el of marked) el.classList.remove('playing'); marked = []; }
  function mark(t) {
    let at; try { at = tk.getElementsAtTime(Math.round(t)); } catch (e) { return; }
    if (hooks.page && at.page) hooks.page(at.page);
    clearMarks();
    for (const id of at.notes || []) {
      if (muted.has(staffOf.get(id))) continue;
      const el = document.getElementById(id); if (el) { el.classList.add('playing'); marked.push(el); }
    }
    if (marked.length && hooks.follow) hooks.follow(marked[0]);
  }
  function frame() {
    if (!playing) return;
    const t = now();
    ui.seek.value = Math.min(t, total); ui.time.textContent = `${fmt(t)} / ${fmt(total)}`;
    if (Math.abs(t - lastMark) > 40) { lastMark = t; mark(t); }
    raf = requestAnimationFrame(frame);
  }

  function render(rebuildVoices) {
    if (!ui) return;
    const ok = events.length > 0;
    ui.play.innerHTML = playing ? '<span aria-hidden="true">❚❚</span> Pause' : '<span aria-hidden="true">▶</span> Play';
    ui.play.disabled = !ok; ui.stop.disabled = !ok; ui.seek.disabled = !ok;
    ui.seek.max = Math.max(1, Math.round(total)); if (!playing) ui.seek.value = pos;
    ui.time.textContent = `${fmt(playing ? now() : pos)} / ${fmt(total)}`;
    if (!ok) ui.msg.textContent = 'Playback is available for the transcription.';
    else if (!/could not/.test(ui.msg.textContent)) ui.msg.textContent = '';
    if (rebuildVoices) {
      ui.voices.innerHTML = voices.length > 1 ? 'Voices: ' + voices.map(v => `<label><input type="checkbox" data-s="${v.n}" ${muted.has(v.n) ? '' : 'checked'}> ${BS.esc(v.name)}</label>`).join('') : '';
      ui.voices.querySelectorAll('input').forEach(i => i.onchange = () => restart(() => { const n = +i.dataset.s; i.checked ? muted.delete(n) : muted.add(n); }));
    }
  }

  // Build the controls inside `host`. hooks.page(n): show score page n; hooks.follow(el): keep el in view.
  function mount(host, h) {
    hooks = h || {};
    host.innerHTML = `<button class="play" type="button"></button><button class="stop" type="button" title="Back to the beginning" aria-label="Stop">■</button>
      <span class="time">0:00 / 0:00</span><input class="seek" type="range" min="0" max="1" value="0" step="10" aria-label="Position in the piece">
      <label class="rate">Speed <select aria-label="Speed"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></label>
      <span class="voices"></span><span class="msg" role="status"></span>`;
    ui = { play: host.querySelector('.play'), stop: host.querySelector('.stop'), time: host.querySelector('.time'), seek: host.querySelector('.seek'),
      rate: host.querySelector('select'), voices: host.querySelector('.voices'), msg: host.querySelector('.msg') };
    ui.play.onclick = () => playing ? pause() : play();
    ui.stop.onclick = stop;
    ui.seek.oninput = () => { const v = +ui.seek.value; restart(() => { pos = v; clearMarks(); }); };
    ui.rate.onchange = () => restart(() => { rate = +ui.rate.value; });
    addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); ui.play.click(); } });
    render(true);
  }

  return { mount, load, play, pause, stop, get playing() { return playing; }, get duration() { return total; }, get eventCount() { return events.length; } };
})();
