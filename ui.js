/* Moonward - interface. Draws the state kept by core.js and turns taps into actions.
   Screens are plain template strings; the fight board keeps its DOM so creatures can glide between tiles. */
(function () {
  'use strict';

  const C = window.MW, W = C.W, H = C.H, N = C.N;
  const KEY = 'moonward.v1';
  const app = document.getElementById('app'), modal = document.getElementById('modal');
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ic = (id, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 64 64" aria-hidden="true"><use href="#' + id + '"/></svg>';
  const SPR = { spiderling: 's-spider' };
  const spr = k => SPR[k] || 's-' + k;
  const ABIC = { flit: 'i-wing', gust: 'i-gust', bomb: 'i-dust', beam: 'i-beam', click: 'i-click' };

  let S = load();
  const ui = { mode: null, sel: -1, busy: false, undo: [], tab: 'lineage', pick: null, slot: null, gift: -1, msg: '', fc: null, mp: 0 };
  let tiles = [], uel = {}, mothEl = null, boardEl = null, unitsEl = null, fxEl = null, linesEl = null;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.meta && s.meta.v === 1) {
        // the save is only text someone could have edited: keep nothing the rules do not know
        const okB = b => typeof b === 'string' && Object.prototype.hasOwnProperty.call(C.BOON, b);
        const okS = k => typeof k === 'string' && Object.prototype.hasOwnProperty.call(C.SPECIES, k);
        const m = Object.assign(C.newMeta(), s.meta);
        m.scales = (Array.isArray(m.scales) ? m.scales : []).filter(okB);
        if (!okS(m.species)) m.species = 'luna';
        m.dust = Math.max(0, +m.dust || 0);
        m.opt = Object.assign(C.newMeta().opt, m.opt);
        s.meta = m;
        const r = s.run;
        if (r && (!Array.isArray(r.boons) || !okS(r.species) || !r.boons.every(okB))) { s.run = null; s.sum = null; }
        if (m.last && m.last.boons) m.last.boons = (Array.isArray(m.last.boons) ? m.last.boons : []).filter(okB);
        return s;
      }
    } catch (e) { /* fresh brood */ }
    return { meta: C.newMeta(), run: null, sum: null, orig: null };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode: play on without saving */ } }
  const opt = () => S.meta.opt;
  const wait = ms => new Promise(r => setTimeout(r, ms * (opt().fast ? 0.4 : 1)));

  /* ---------- sound: a few synthesised blips, nothing to download ---------- */

  let actx = null;
  function tone(f, d, type, v, slide) {
    if (!opt().sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + d);
      g.gain.setValueAtTime(v || 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + d + 0.02);
    } catch (e) { /* no audio, no matter */ }
  }
  function hiss(d, v) {
    if (!opt().sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const n = Math.floor(actx.sampleRate * d), buf = actx.createBuffer(1, n, actx.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = actx.createBufferSource(), g = actx.createGain(), f = actx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1400; g.gain.value = v || 0.06;
      src.buffer = buf; src.connect(f); f.connect(g); g.connect(actx.destination); src.start();
    } catch (e) { /* no audio */ }
  }
  const SFX = {
    step: () => tone(560, 0.05, 'triangle', 0.025, 80), flit: () => tone(380, 0.18, 'sine', 0.045, 520), spark: () => tone(980, 0.07, 'square', 0.02, 500),
    burn: n => hiss(0.22 + 0.03 * Math.min(10, n), 0.07), hit: () => tone(170, 0.13, 'sawtooth', 0.05, -90), hurt: () => tone(120, 0.26, 'sawtooth', 0.08, -70),
    die: () => tone(320, 0.12, 'triangle', 0.04, -210), tap: () => tone(700, 0.05, 'sine', 0.03, 160),
    win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'sine', 0.05), i * 110)),
    lose: () => [330, 262, 196, 147].forEach((f, i) => setTimeout(() => tone(f, 0.4, 'sine', 0.06), i * 170)),
  };

  /* ---------- small view helpers ---------- */

  const zoneOf = R => C.ZONES[Math.min(R.zone, C.ZONES.length - 1)];
  function pips(n, max, cls) {
    let h = '<span class="pips">';
    for (let i = 0; i < max; i++) h += '<i class="pip' + (i < n ? '' : ' off') + '"></i>';
    return h + '</span>';
  }
  function hpStat(hp, mhp) { return '<div class="stat hp" id="hud-hp" aria-label="Health ' + hp + ' of ' + mhp + '">' + (mhp <= 14 ? pips(hp, mhp) : '') + '<span>' + hp + '/' + mhp + '</span></div>'; }
  function byWhom(c) {
    if (!c) return 'the dark';
    if (c === 'stall') return 'exhaustion';
    if (/^The /.test(c)) return 'the ' + c.slice(4);
    if (/^(a|an|the) /.test(c)) return c;
    return (/^[AEIOU]/.test(c) ? 'an ' : 'a ') + c.toLowerCase();
  }
  function moonSvg(lit) {
    const r = 44, c = 50, rx = Math.abs(1 - 2 * lit) * r;
    const d = 'M' + c + ' ' + (c - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + c + ' ' + (c + r) + 'A' + rx.toFixed(2) + ' ' + r + ' 0 0 ' + (lit < 0.5 ? 0 : 1) + ' ' + c + ' ' + (c - r) + 'z';
    return '<svg class="moon" viewBox="0 0 100 100" role="img" aria-label="The Moon, ' + Math.round(lit * 8) + ' of 8 slivers lit"><circle class="dark" cx="50" cy="50" r="44"/>' +
      (lit > 0 ? '<path class="lit" d="' + d + '"/>' : '') + '<circle class="rim" cx="50" cy="50" r="44"/></svg>';
  }
  function trail(R) {
    let h = '<div class="trail" aria-label="Zone ' + (R.zone + 1) + ' of 3, step ' + (R.step + 1) + ' of 4">';
    for (let z = 0; z < 3; z++) {
      for (let s = 0; s < 4; s++) { const k = z * 4 + s, cur = R.zone * 4 + R.step; h += '<i class="' + (k < cur ? 'done' : k === cur ? 'here' : '') + (s === 3 ? ' boss' : '') + '"></i>'; }
      if (z < 2) h += '<span class="gap"></span>';
    }
    return h + '</div>';
  }
  function giftChips(R) {
    if (!R.boons.length) return '';
    return '<div class="gifts-row">' + R.boons.map(b => '<button class="chip" data-act="boon" data-id="' + b + '">' + ic('i-' + C.BOON[b].ic) + esc(C.BOON[b].n) + '</button>').join('') + '</div>';
  }
  function runTop(R) {
    const z = zoneOf(R);
    return '<div class="runbar"><div class="where"><span class="zname">' + esc(z.n) + '</span><span class="zstep">' + esc(R.name) + ', ' + C.ordinal(R.gen) + ' of the line</span></div>' +
      '<button class="icon-btn" data-act="menu" aria-label="Menu">' + ic('i-menu') + '</button></div>' +
      '<div class="vitals">' + hpStat(R.hp, R.mhp) + '<span class="md">' + ic('i-moon') + R.md + '</span>' + trail(R) + '</div>' + giftChips(R);
  }
  const plate = inner => '<svg class="edge" aria-hidden="true"><rect width="100%" height="100%"/></svg><div class="in">' + inner + '</div>';

  /* ---------- modal ---------- */

  function openModal(html) { modal.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>'; modal.hidden = false; }
  function closeModal() { modal.hidden = true; modal.innerHTML = ''; }
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  function showIntro() {
    openModal('<h2>The Moon went out</h2>' +
      '<p class="lore">It happened on a night no one remembers. Without her, moths fly in circles until they fall.</p>' +
      '<p class="lore">But the brood keeps one ember, stolen from the last lamp. Each generation, one moth carries a spark of it upward: through the hedgerow, past the false moons of the lane, into the high dark.</p>' +
      '<p class="lore">None has come home. Every one of them left her dust, and the brood remembers.</p>' +
      '<button class="btn primary wide" data-act="close">Begin</button>');
  }
  function showHow() {
    openModal('<h2>How a moth fights</h2><ul class="rules">' +
      '<li>' + ic('i-dust') + '<span><b>You shed dust.</b> Tap a ringed tile to fly one step. Every tile you leave is dusted behind you.</span></li>' +
      '<li>' + ic('i-flame') + '<span><b>Dust burns.</b> Tap Spark, then a fuel tile beside you. Fire runs the whole connected trail and burns every enemy standing on it. Leaf litter and web are fuel too.</span></li>' +
      '<li>' + ic('s-ant') + '<span><b>You cannot strike them any other way.</b> So make them walk where you have been. Pale dotted lines show where each enemy will step next.</span></li>' +
      '<li>' + ic('i-shield') + '<span><b>Enemies beside you</b> strike if you end your turn there, and bite if you step away. The End turn button always says what it will cost.</span></li>' +
      '<li>' + ic('i-wing') + '<span><b>Flit</b> leaps up to 4 tiles in a line, over anything, never provoking a bite, and dusts every tile beneath, even under enemies.</span></li>' +
      '</ul><button class="btn primary wide" data-act="close">Understood</button>');
  }
  function showMenu() {
    const o = opt(), inRun = !!S.run && S.run.phase !== 'dead' && S.run.phase !== 'won', atHome = !!$('.hollow');
    const tg = (k, label) => '<button class="toggle" data-act="toggle" data-k="' + k + '" aria-pressed="' + (o[k] ? 'true' : 'false') + '"><span>' + label + '</span><span class="sw"></span></button>';
    openModal('<h2>Moonward</h2>' +
      '<button class="btn wide" data-act="how">How a moth fights</button>' +
      tg('foresight', 'Show where enemies will step') + tg('fast', 'Faster animation') + tg('sound', 'Sound') +
      (inRun && !atHome ? '<button class="btn wide" data-act="hollow">Pause and visit the hollow</button>' : '') +
      (inRun ? '<button class="btn quiet" data-act="abandon">Turn back and end this flight</button>' : '') +
      (atHome && !inRun ? '<button class="btn quiet" data-act="wipe">Forget this whole brood and start over</button>' : '') +
      '<button class="btn primary wide" data-act="close">Close</button>');
  }
  function showBoons() {
    const R = S.run;
    openModal('<h2>What she carries</h2>' + (R.boons.length ? R.boons.map(b => {
      const d = C.BOON[b];
      return '<div class="scale-slot"><span class="spot">' + ic('i-' + d.ic) + '</span><h3>' + esc(d.n) + '</h3><p>' + esc(d.d) + (R.inherited.indexOf(b) >= 0 ? ' Inherited.' : '') + '</p></div>';
    }).join('') : '<p>Nothing yet but the ember.</p>') +
      '<p>Health ' + R.hp + '/' + R.mhp + '. Energy ' + R.emax + ' a turn. Dust capacity ' + R.cap + '.</p>' +
      '<button class="btn primary wide" data-act="close">Close</button>');
  }

  /* ---------- the hollow ---------- */

  function showHollow() {
    const M = S.meta, wins = Math.min(8, M.stats.wins);
    const line = wins === 0 ? 'Generation ' + M.gen + '. The Moon is dark.' : wins >= 8 ? 'Generation ' + M.gen + '. The Moon is whole again.' : 'Generation ' + M.gen + '. ' + wins + ' of 8 slivers relit.';
    const tabs = [['lineage', 'Lineage'], ['comb', 'The comb'], ['brood', 'Brood'], ['annals', 'Annals']];
    app.className = 'scr';
    app.innerHTML = '<div class="screen hollow">' +
      '<div class="hol-top"><span class="md">' + ic('i-moon') + M.dust + ' moondust</span><button class="icon-btn" data-act="menu" aria-label="Menu">' + ic('i-menu') + '</button></div>' +
      '<div class="hero">' + moonSvg(wins / 8) + '<h1 class="title">Moonward</h1><p class="lede">' + line + '</p></div>' +
      ic('s-moth', 'specimen sp-' + M.species) +
      '<button class="btn primary wide" data-act="fly">' + (S.run ? 'Resume flight' : 'Take flight') + '</button>' +
      '<div class="tabs" role="tablist">' + tabs.map(t => '<button class="tab" role="tab" data-act="tab" data-tab="' + t[0] + '" aria-selected="' + (ui.tab === t[0]) + '">' + t[1] + '</button>').join('') + '</div>' +
      '<div class="tabbody">' + tabBody(M) + '</div></div>';
    if (!M.seen.intro) { M.seen.intro = 1; save(); showIntro(); }
  }
  function scaleRow(id, extra) {
    const b = id && C.BOON[id];
    if (!b) return '<div class="scale-slot empty"><span class="spot"></span><h3>An empty scale</h3><p>A fallen moth may leave one gift here.</p></div>';
    return '<div class="scale-slot"><span class="spot">' + ic('i-' + b.ic) + '</span><h3>' + esc(b.n) + '</h3><p>' + esc(b.d) + (extra || '') + '</p></div>';
  }
  function tabBody(M) {
    let h = '';
    if (ui.tab === 'lineage') {
      const n = C.slots(M);
      h += '<p class="note">When a flight ends, the moth presses one of her gifts into the line as a scale. Every daughter hatches already carrying it.</p>';
      for (let i = 0; i < n; i++) h += scaleRow(M.scales[i]);
      if (n < 3) h += '<p class="note">Widen the wings in the comb to carry ' + (n === 1 ? 'a second' : 'a third') + ' scale.</p>';
      if (M.last) h += '<p class="note warm">' + esc(M.last.name) + ' fell in ' + esc(C.ZONES[M.last.zone].n) + '. Her dust still lies there, if you pass that way.</p>';
    } else if (ui.tab === 'comb') {
      h += '<p class="note">Moondust feeds the whole brood. What you build here stays built.</p>';
      for (const id in C.UPG) {
        const u = C.UPG[id], r = C.rank(M, id), max = r >= u.cost.length;
        let rk = '<span class="ranks">';
        for (let i = 0; i < u.cost.length; i++) rk += '<i class="' + (i < r ? 'on' : '') + '"></i>';
        rk += '</span>';
        h += '<div class="row"><h3>' + esc(u.n) + '</h3><p>' + esc(u.d) + '</p><div class="side">' + rk +
          (max ? '<span class="muted">Built</span>' : '<button class="pill ' + (C.canBuy(M, id) ? 'can' : '') + '" data-act="buy" data-id="' + id + '" aria-disabled="' + !C.canBuy(M, id) + '" aria-label="Build ' + esc(u.n) + ' for ' + u.cost[r] + ' moondust">' + ic('i-moon') + u.cost[r] + '</button>') + '</div></div>';
      }
    } else if (ui.tab === 'brood') {
      h += '<p class="note">Which egg hatches next.</p>';
      for (const id in C.SPECIES) {
        const s = C.SPECIES[id], open = !!M.unlocked[id];
        h += '<div class="row' + (open ? '' : ' locked') + '"><h3>' + esc(s.n) + '</h3><p>' + (open ? esc(s.d) + ' Health ' + s.hp + ', energy ' + s.e + ', dust ' + s.cap + '.' : 'Not yet hatched. ' + esc(s.lock)) + '</p><div class="side">' +
          (open ? '<button class="pill ' + (M.species === id ? 'sel' : '') + '" data-act="species" data-id="' + id + '">' + (M.species === id ? 'Chosen' : 'Choose') + '</button>' : '') + '</div></div>';
      }
      if (M.maxEcl > 0) {
        h += '<p class="note">Eclipse deepens the dark: more enemies, sturdier guardians, a fifth more moondust per level.</p><div class="row"><h3>Eclipse ' + (M.ecl || 0) + '</h3><p>Deepest unlocked: ' + M.maxEcl + '.</p><div class="side"><span style="display:flex;gap:6px">' +
          '<button class="pill" data-act="ecl" data-d="-1" aria-disabled="' + ((M.ecl || 0) <= 0) + '">Less</button><button class="pill" data-act="ecl" data-d="1" aria-disabled="' + ((M.ecl || 0) >= M.maxEcl) + '">More</button></span></div></div>';
      }
    } else {
      const st = M.stats, kills = Object.keys(st.kills).reduce((a, k) => a + st.kills[k], 0);
      h += '<p class="note">' + (st.runs ? st.runs + (st.runs === 1 ? ' flight' : ' flights') + ', ' + st.wins + ' reached the Moon. ' + kills + ' enemies burned.' : 'No one has flown yet.') + '</p>';
      for (const a of M.annals) {
        h += '<div class="row"><h3>' + esc(a.name) + ', ' + C.ordinal(a.gen) + ' of the line</h3><p>' + esc(C.SPECIES[a.species].n) + '. ' +
          (a.won ? 'Reached the Moon.' : 'Fell to ' + esc(byWhom(a.cause)) + ' in ' + esc(a.zone) + '.') + '</p><div class="side"><span class="md">' + ic('i-moon') + a.md + '</span></div></div>';
      }
    }
    return h;
  }

  /* ---------- path, gifts, events ---------- */

  function showPath() {
    const R = S.run, ch = R.choices;
    const head = R.step === 3 ? 'Something waits ahead' : ch.length > 1 ? 'The way forks' : R.zone === 0 ? 'Out of the hollow' : 'Onward and up';
    const kin = c => '<div class="kin">' + c.comp.slice().sort().map(k => ic(spr(k))).join('') + '</div>';
    const cards = ch.map((c, i) => {
      let t, p, g;
      if (c.type === 'fight') { t = c.hard ? 'A crawling thicket' : 'A clearing'; p = kin(c); g = c.hard ? 'A better gift, 5 moondust' : 'A gift, 3 moondust'; }
      else if (c.type === 'elite') { t = "A hunter's ground"; p = kin(c); g = 'A better gift, 6 moondust'; }
      else if (c.type === 'boss') { const d = C.DEF[c.comp[0]]; t = d.n; p = kin(c) + '<p>' + esc(d.d) + '</p>'; g = 'A rare gift, 10 moondust, and rest'; }
      else if (c.type === 'rest') { t = C.EVENTS.rest.n; p = '<p>A safe place. Heal 5, or widen your dust.</p>'; g = ''; }
      else { t = C.EVENTS[c.id].n; p = '<p>No one is fighting here.</p>'; g = ''; }
      return '<button class="choice plate" data-act="choose" data-i="' + i + '">' + plate('<h3>' + esc(t) + '</h3>' + p + (g ? '<span class="gain">' + g + '</span>' : '')) + '</button>';
    }).join('');
    app.className = 'scr';
    app.innerHTML = '<div class="screen path">' + runTop(R) + '<div><h2 class="heading">' + head + '</h2></div><div class="choices">' + cards + '</div></div>';
  }

  function showReward() {
    const R = S.run, rw = R.reward;
    const head = rw.kind === 'sendoff' ? "The elders' send-off" : rw.kind === 'event' ? 'Something to carry' : rw.kind === 'boss' ? 'The guardian is ash' : 'The clearing falls quiet';
    const bits = [];
    if (rw.md) bits.push(rw.md + ' moondust gathered');
    if (rw.flawless) bits.push('not a scale out of place');
    if (rw.healed) bits.push('healed ' + rw.healed);
    const cards = rw.boons.map((id, i) => {
      const b = C.BOON[id];
      return '<button class="choice plate' + (ui.gift === i ? ' sel' : '') + '" data-act="gift" data-i="' + i + '" aria-pressed="' + (ui.gift === i) + '">' +
        plate('<div class="gift-head"><span class="gift-ic">' + ic('i-' + b.ic) + '</span><div><h3>' + esc(b.n) + '</h3><span class="rar r' + b.r + '">' + C.RARITY[b.r] + '</span></div></div><p>' + esc(b.d) + '</p>') + '</button>';
    }).join('');
    const sel = ui.gift >= 0 ? C.BOON[rw.boons[ui.gift]] : null;
    app.className = 'scr';
    app.innerHTML = '<div class="screen reward">' + runTop(R) +
      '<div><h2 class="heading">' + head + '</h2><p class="sub">' + (bits.length ? esc(bits.join(', ')) + '. ' : '') + 'Choose one gift to carry.</p></div>' +
      '<div class="choices">' + cards + '</div><div class="actions">' +
      '<button class="btn primary wide" data-act="take" aria-disabled="' + !sel + '">' + (sel ? 'Carry ' + esc(sel.n) : 'Choose a gift') + '</button>' +
      (R.rerolls > 0 ? '<button class="btn wide" data-act="reroll">Ask the scouts again (' + R.rerolls + ' left)</button>' : '') +
      '<button class="btn quiet" data-act="skip">Carry nothing and rest instead: heal 1</button></div></div>';
  }

  function showEvent() {
    const R = S.run, e = C.EVENTS[R.event];
    const cards = e.opts.map((o, i) => {
      const no = o.hp < 0 && R.hp <= -o.hp;
      return '<button class="choice plate" data-act="opt" data-i="' + i + '" aria-disabled="' + no + '">' + plate('<h3>' + esc(o.l) + '</h3><p>' + esc(o.d) + (no ? ' You are too hurt to risk it.' : '') + '</p>') + '</button>';
    }).join('');
    app.className = 'scr';
    app.innerHTML = '<div class="screen event">' + runTop(R) + '<div><h2 class="heading">' + esc(e.n) + '</h2><p class="sub">' + esc(e.t) + '</p></div><div class="choices">' + cards + '</div></div>';
  }

  function showEnd() {
    const R = S.run, M = S.meta;
    if (!S.sum) { S.orig = M.scales.slice(); S.sum = C.endRun(M, R); ui.pick = null; ui.slot = null; save(); }
    const sm = S.sum, won = sm.won, n = C.slots(M), orig = S.orig || [];
    const z = zoneOf(R);
    const epitaph = won
      ? esc(R.name) + ' reaches the dark face of the Moon and presses the ember to her. A sliver of silver opens like an eye.'
      : esc(R.name) + ', ' + C.ordinal(R.gen) + ' of the line, fell to ' + esc(byWhom(R.cause)) + ' in ' + esc(z.n) + '. Her dust drifts down to the brood.';
    const kills = Object.keys(R.stats.kills).reduce((a, k) => a + R.stats.kills[k], 0);
    const cands = R.boons.filter(b => orig.indexOf(b) < 0);
    let scales = '';
    if (cands.length) {
      scales += '<div><h2 class="heading">One scale for the line</h2><p class="sub">Choose a gift she carried. Every daughter after her will hatch with it.</p></div>';
      scales += cands.map(b => {
        const d = C.BOON[b];
        return '<button class="scale-slot' + (ui.pick === b ? ' pick' : '') + '" data-act="pickScale" data-id="' + b + '" aria-pressed="' + (ui.pick === b) + '"><span class="spot">' + ic('i-' + d.ic) + '</span><h3>' + esc(d.n) + '</h3><p>' + esc(d.d) + '</p></button>';
      }).join('');
      if (ui.pick && n > 1 || (ui.pick && orig[0])) {
        scales += '<p class="note">' + (orig.filter(Boolean).length >= n ? 'The wings are full. Choose which scale it replaces.' : 'Choose where it rests.') + '</p>';
        for (let i = 0; i < n; i++) {
          const cur = orig[i] && C.BOON[orig[i]];
          scales += '<button class="scale-slot' + (ui.slot === i ? ' pick' : '') + (cur ? '' : ' empty') + '" data-act="placeScale" data-i="' + i + '" aria-pressed="' + (ui.slot === i) + '"><span class="spot">' + (cur ? ic('i-' + cur.ic) : '') + '</span><h3>' +
            (cur ? esc(cur.n) : 'An empty scale') + '</h3><p>' + (ui.slot === i ? 'Replaced by ' + esc(C.BOON[ui.pick].n) + '.' : cur ? esc(cur.d) : 'Free.') + '</p></button>';
        }
      }
    } else scales = '<p class="note">She carried nothing new to pass down.</p>';
    const news = sm.news.map(id => '<p class="note warm">A new egg in the brood: the ' + esc(C.SPECIES[id].n) + '.</p>').join('') +
      (won && M.maxEcl > (R.ecl || 0) ? '<p class="note warm">The dark can go deeper now. Eclipse ' + M.maxEcl + ' is open in the brood.</p>' : '');
    app.className = 'scr';
    app.innerHTML = '<div class="screen ending">' +
      '<div class="hero">' + moonSvg(Math.min(8, M.stats.wins) / 8) + '</div>' +
      '<h2 class="heading">' + (won ? 'The Moon wakes' : esc(R.name) + ' has fallen') + '</h2><p class="epitaph">' + epitaph + '</p>' +
      '<dl class="tally"><dt>Clearings won</dt><dd>' + R.stats.fights + '</dd><dt>Enemies burned</dt><dd>' + kills + '</dd><dt>Most caught in one spark</dt><dd>' + (R.stats.best || 0) + '</dd>' +
      '<dt>Moondust carried home</dt><dd class="warm">' + sm.md + '</dd></dl>' + news + scales +
      '<div class="actions"><button class="btn primary wide" data-act="home">' + (ui.pick != null && ui.slot != null ? 'Pass down ' + esc(C.BOON[ui.pick].n) : 'Return to the hollow') + '</button></div></div>';
  }

  /* ---------- the fight ---------- */

  const TILE_HTML = ic('t-rock', 'l rock') + ic('t-litter', 'l litter') + ic('t-wet', 'l wet') + ic('t-web', 'l web') + ic('t-dust', 'l dust') + ic('t-flame', 'l flame') +
    ic('t-remains', 'l remains') + '<i class="l mark"></i><i class="l hint"></i><b class="cost"></b><b class="mk"></b><b class="badge"></b>';

  function showFight() {
    const R = S.run, F = R.f, z = zoneOf(R);
    ui.mode = null; ui.sel = -1; ui.busy = false; ui.msg = ''; uel = {};
    const kind = F.kind === 'boss' ? 'guardian' : F.kind === 'elite' ? 'hunter' : 'clearing';
    let t = '';
    for (let i = 0; i < N; i++) t += '<button class="tile" data-act="tile" data-i="' + i + '">' + TILE_HTML + '</button>';
    app.className = 'scr';
    app.innerHTML = '<div class="fight zone-' + z.id + '">' +
      '<header class="hud"><div class="hud-top"><button class="icon-btn" data-act="menu" aria-label="Menu">' + ic('i-menu') + '</button>' +
      '<div class="where"><span class="zname">' + esc(z.n) + '</span><span class="zstep">' + kind + ', turn <span id="hud-turn">1</span></span></div>' +
      '<button class="chip" data-act="boons" aria-label="What she carries">' + ic('i-dust') + R.boons.length + '</button></div>' +
      '<div class="hud-stats">' + hpStat(R.hp, R.mhp) + '<div class="stat en" id="hud-en"></div><div class="stat du" id="hud-du"></div></div></header>' +
      '<div class="board-wrap"><div class="plate" id="plate"><svg class="edge" aria-hidden="true"><rect width="100%" height="100%"/></svg>' +
      '<div class="board" id="board">' + t + '<svg class="lines" id="lines" viewBox="0 0 6 7" preserveAspectRatio="none" aria-hidden="true"></svg><div class="units" id="units"></div><div class="fx" id="fx"></div></div></div></div>' +
      '<div class="info" id="info" aria-live="polite"></div><footer class="bar" id="bar"></footer></div>';
    boardEl = $('#board'); unitsEl = $('#units'); fxEl = $('#fx'); linesEl = $('#lines');
    tiles = Array.prototype.slice.call(boardEl.querySelectorAll('.tile'));
    for (const el of tiles) { el._badge = $('.badge', el); el._mk = $('.mk', el); el._cost = $('.cost', el); }
    mothEl = document.createElement('div');
    mothEl.className = 'unit moth sp-' + R.species;
    mothEl.innerHTML = ic('s-moth');
    place(mothEl, F.p); // before it is in the page, so she does not glide in from the corner
    unitsEl.appendChild(mothEl);
    fit();
    renderFight();
    if (!S.meta.seen.how) { S.meta.seen.how = 1; save(); showHow(); }
    if (F.over) settle();
  }

  function fit() {
    const wrap = $('.board-wrap'), pl = $('#plate');
    if (!wrap || !pl) return;
    const w = Math.max(180, Math.min(wrap.clientWidth - 12, (wrap.clientHeight - 12) * W / H, 470));
    pl.style.width = Math.floor(w) + 'px';
  }
  window.addEventListener('resize', fit);

  const place = (el, i) => { el.style.transform = 'translate(' + (i % W) * 100 + '%,' + ((i / W) | 0) * 100 + '%)'; el._i = i; };
  function makeUnit(u) {
    const d = C.DEF[u.k], el = document.createElement('div');
    el.className = 'unit u-' + u.k + (d.boss ? ' boss' : '') + (d.elite ? ' elite' : '') + (d.ai === 'none' ? ' neutral' : '') + (u.k === 'spiderling' ? ' small' : '');
    el.innerHTML = ic(spr(u.k)) + '<b class="hp">' + u.hp + '</b><i class="st">' + ic('i-daze') + '</i>';
    return el;
  }

  function tileLabel(F, L, i, mk, sp) {
    const u = C.unitAt(F, i), p = [];
    p.push('row ' + (((i / W) | 0) + 1) + ' col ' + (i % W + 1));
    if (i === F.p) p.push('you');
    if (u) p.push(C.DEF[u.k].n + ' ' + u.hp + ' health' + (u.stun ? ' dazed' : ''));
    if (F.rock[i]) p.push('pebble');
    if (L.dust[i]) p.push('dust');
    if (L.litter[i]) p.push('leaf litter');
    if (L.web[i]) p.push('web');
    if (L.wet[i]) p.push('dew');
    if (mk) p.push('danger ' + mk.dmg);
    if (sp) p.push('arriving ' + C.DEF[sp.k].n);
    return p.join(', ');
  }

  /* Paint the ground. L is the live fight, or a snapshot taken mid-animation. */
  function paintTiles(L) {
    const R = S.run, F = R.f, live = !ui.busy && !F.over;
    const mv = live && !ui.mode ? C.moveTargets(R) : [];
    const tg = live && ui.mode ? (ui.mode === 'spark' ? C.sparkTargets(R) : C.abilTargets(R, ui.mode)) : [];
    const will = {}, badge = {};
    // Spark preview: run each possible spark on a copy and read off exactly who it would hurt
    ui.pv = null;
    if (ui.mode === 'spark') {
      const pv = ui.pv = { dmg: {}, kill: {}, self: 0 };
      for (const t of tg) {
        for (const b of C.burnPreview(R, t).tiles) will[b] = 1;
        const c = C.clone(R);
        C.apply(c, ['spark', t], null);
        for (const u of F.units) {
          const v = c.f.units.find(x => x.id === u.id), d = u.hp - (v ? v.hp : 0);
          if (d > (pv.dmg[u.id] || 0)) pv.dmg[u.id] = d;
          if (!v) pv.kill[u.id] = 1;
        }
        if (R.hp - c.hp > pv.self) pv.self = R.hp - c.hp;
      }
    }
    if (live) {
      const list = !ui.mode ? mv : ui.mode === 'flit' ? tg : [];
      for (const t of list) { const f = C.forecast(R, [!ui.mode ? ['move', t] : ['abil', 'flit', t]]); badge[t] = f.dead ? 'fatal' : f.dmg ? '−' + f.dmg : ''; }
    }
    const mk = {}, sp = {};
    for (const m of L.marks) for (const t of m.tiles) { if (!mk[t]) mk[t] = { dmg: 0 }; mk[t].dmg += m.dmg; }
    for (const s of L.spawns) sp[s.i] = s;
    for (let i = 0; i < N; i++) {
      const el = tiles[i];
      let c = 'tile' + ((i % W + ((i / W) | 0)) % 2 ? ' alt' : '');
      if (F.rock[i]) c += ' rock';
      if (L.litter[i]) c += ' has-litter';
      if (L.wet[i]) c += ' has-wet';
      if (L.web[i]) c += ' has-web';
      if (L.dust[i]) c += ' has-dust';
      if (L.flame[i]) c += ' has-flame';
      if (mk[i]) c += ' has-mark';
      else if (sp[i]) c += ' has-spawn';
      if (L.remains === i) c += ' has-remains';
      if (mv.indexOf(i) >= 0) c += ' can-move';
      if (tg.indexOf(i) >= 0) c += ' target';
      if (will[i]) c += ' will-burn';
      if (ui.sel === i) c += ' sel';
      if (el.className !== c) el.className = c;
      el._badge.textContent = badge[i] || '';
      el._mk.textContent = mk[i] ? mk[i].dmg : '';
      el._cost.textContent = mv.indexOf(i) >= 0 && C.moveCost(R, i) > 1 ? '2' : '';
      el.setAttribute('aria-label', tileLabel(F, L, i, mk[i], sp[i]));
    }
  }

  function syncUnits() {
    const F = S.run.f, seen = {}, fc = ui.fc;
    for (const u of F.units) {
      seen[u.id] = 1;
      let el = uel[u.id];
      if (!el) { el = uel[u.id] = makeUnit(u); unitsEl.appendChild(el); }
      place(el, u.i);
      $('.hp', el).textContent = u.hp;
      el.classList.toggle('dazed', u.stun > 0);
      el.classList.toggle('smo', u.smo > 0);
      el.classList.toggle('will-hit', !!(fc && fc.hits.indexOf(u.id) >= 0));
      const pd = ui.pv && ui.pv.dmg[u.id];
      if (pd) el.dataset.pv = '\u2212' + pd; else delete el.dataset.pv;
      el.classList.toggle('pv-kill', !!(ui.pv && ui.pv.kill[u.id]));
    }
    for (const id in uel) if (!seen[id]) { uel[id].remove(); delete uel[id]; }
    place(mothEl, F.p);
    mothEl.classList.toggle('rooted', !!F.root);
    ui.mp = F.p;
  }

  function hudHp(hp) { const R = S.run, el = $('#hud-hp'); if (el) el.outerHTML = hpStat(Math.max(0, hp), R.mhp); }
  function hudEn(e) { const R = S.run, el = $('#hud-en'); if (el) { el.innerHTML = pips(e, Math.max(R.emax, e)) + '<span>energy</span>'; el.setAttribute('aria-label', 'Energy ' + e); } }
  function hudDust(n) { const R = S.run, el = $('#hud-du'); if (el) { el.innerHTML = ic('i-dust') + n + '/' + R.cap + ' dust'; } }
  function paintHud(L) {
    const R = S.run, F = R.f;
    hudHp(L ? L.hp : R.hp);
    hudEn(L ? L.e : F.e);
    let n = 0;
    const d = L ? L.dust : F.dust;
    for (let i = 0; i < N; i++) if (d[i]) n++;
    hudDust(n);
    const t = $('#hud-turn');
    if (t) t.textContent = F.turn;
  }

  function paintLines() {
    const F = S.run.f, fc = ui.fc;
    let h = '';
    if (fc && opt().foresight && !ui.busy) {
      const now = {};
      for (const u of F.units) now[u.id] = u.i;
      for (const g of fc.units) {
        const a = now[g.id];
        if (a == null || a === g.i) continue;
        const hit = fc.hits.indexOf(g.id) >= 0 ? ' class="hit"' : '';
        h += '<line' + hit + ' x1="' + (a % W + 0.5) + '" y1="' + (((a / W) | 0) + 0.5) + '" x2="' + (g.i % W + 0.5) + '" y2="' + (((g.i / W) | 0) + 0.5) + '"/><circle' + hit + ' cx="' + (g.i % W + 0.5) + '" cy="' + (((g.i / W) | 0) + 0.5) + '" r=".2"/>';
      }
      if (fc.p !== F.p) h += '<line class="hit" x1="' + (F.p % W + 0.5) + '" y1="' + (((F.p / W) | 0) + 0.5) + '" x2="' + (fc.p % W + 0.5) + '" y2="' + (((fc.p / W) | 0) + 0.5) + '"/>';
    }
    linesEl.innerHTML = h;
  }

  function paintBar() {
    const R = S.run, F = R.f, fc = ui.fc;
    const costPips = n => { let s = '<span class="cost">'; for (let i = 0; i < n; i++) s += '<i></i>'; return s + '</span>'; };
    let h = '';
    const sp = C.sparkTargets(R).length > 0;
    h += '<button class="ab spark' + (ui.mode === 'spark' ? ' on' : '') + (sp ? '' : ' off') + '" data-act="spark" aria-label="Spark, 1 energy" aria-pressed="' + (ui.mode === 'spark') + '">' + ic('i-flame') + '<span class="lbl">Spark</span>' + costPips(1) + '</button>';
    for (const id of R.abil) {
      const a = C.ABIL[id], ready = C.abilTargets(R, id).length > 0, cd = F.cd[id] || 0, cost = C.abilCost(R, id);
      h += '<button class="ab' + (ui.mode === id ? ' on' : '') + (ready ? '' : ' off') + '" data-act="abil" data-id="' + id + '" aria-label="' + a.n + ', ' + cost + ' energy' + (cd ? ', ready in ' + cd : '') + '" aria-pressed="' + (ui.mode === id) + '">' +
        ic(ABIC[id]) + '<span class="lbl">' + a.n + '</span>' + costPips(cost) + (cd ? '<span class="cd">' + cd + '</span>' : '') + '</button>';
    }
    if (R.flask) h += '<button class="ab slim' + (R.hp < R.mhp ? '' : ' off') + '" data-act="flask" aria-label="Nectar flask, heal 4">' + ic('i-flask') + '</button>';
    h += '<button class="ab slim' + (ui.undo.length ? '' : ' off') + '" data-act="undo" aria-label="Undo last move">' + ic('i-undo') + '</button>';
    let cls = '', sub = 'nothing reaches you';
    if (fc) { if (fc.dead) { cls = ' fatal'; sub = 'this kills her'; } else if (fc.dmg) { cls = ' hurt'; sub = 'you take ' + fc.dmg; } else if (fc.win) sub = 'the last one falls'; }
    h += '<button class="end' + cls + '" data-act="end" aria-label="End turn, ' + sub + '">End turn<span class="subl">' + sub + '</span></button>';
    $('#bar').innerHTML = h;
    $('#bar').classList.toggle('crowded', R.abil.length + (R.flask ? 1 : 0) >= 3);
    $('.fight').classList.toggle('busy', ui.busy);
  }

  function infoText() {
    const R = S.run, F = R.f;
    if (ui.msg) return ui.msg;
    if (ui.sel >= 0) {
      const i = ui.sel, u = C.unitAt(F, i);
      if (u) { const d = C.DEF[u.k]; return '<span><b>' + esc(d.n) + '</b>, ' + u.hp + ' of ' + u.mhp + ' health' + (u.stun ? ', dazed' : '') + '. ' + esc(d.d) + '</span>'; }
      const m = F.marks.find(x => x.tiles.indexOf(i) >= 0), s = F.spawns.find(x => x.i === i);
      if (m) return '<span><b>Danger.</b> Something lands here after your turn, for ' + m.dmg + '. It hits enemies too.</span>';
      if (s) return '<span><b>Arriving.</b> ' + esc(byWhom(C.DEF[s.k].n)) + ' will come out here.</span>';
      if (i === F.p) return '<span><b>' + esc(R.name) + '</b>, ' + R.hp + ' of ' + R.mhp + ' health. She carries the ember.</span>';
      if (F.remains === i) return '<span><b>Remains.</b> Someone of your line fell here. Fly to her.</span>';
      if (F.rock[i]) return '<span><b>Pebble.</b> Nothing crosses it, though a Flit sails over.</span>';
      if (F.dust[i]) return '<span><b>Your dust.</b> Light any tile of a trail and the whole trail burns.</span>';
      if (F.web[i]) return '<span><b>Web.</b> Costs 2 energy to enter, and burns like dust.</span>';
      if (F.litter[i]) return '<span><b>Leaf litter.</b> Burns like dust, once.</span>';
      if (F.wet[i]) return '<span><b>Dew.</b> Dust will not settle here.</span>';
    }
    if (ui.mode === 'spark') return '<span class="warm">Tap the fuel to light. Everything glowing will burn.' + (ui.pv && ui.pv.self ? ' <b>The blast will catch you for ' + ui.pv.self + '.</b>' : '') + '</span>';
    if (ui.mode) return '<span class="warm">' + esc(C.ABIL[ui.mode].d) + ' Tap where.</span>';
    let best = 0;
    for (const t of C.sparkTargets(R)) {
      const pv = C.burnPreview(R, t);
      let n = 0;
      for (const j of pv.tiles) { const u = C.unitAt(F, j); if (u && C.hostile(u)) n++; }
      if (n > best) best = n;
    }
    if (best) return '<span class="warm">Your fuel runs under ' + (best === 1 ? 'an enemy' : best + ' enemies') + '. Spark it.</span>';
    if (F.root) return 'Webbed fast. You cannot fly this turn, but you can still Spark.';
    if (C.biters(R).length && F.e > 0) return 'The enemy beside you bites if you step away. Flit slips clear.';
    if (F.turn === 1 && !C.dustCount(F) && F.e === R.emax) return 'Tap a ringed tile to fly there. You shed dust on every tile you leave.';
    if (F.e === 0) return 'Out of energy. End your turn.';
    return 'Make them walk where you have been, then Spark the trail beside you.';
  }
  function paintInfo() { const el = $('#info'); if (el) el.innerHTML = infoText(); }

  function renderFight() {
    const R = S.run, F = R.f;
    if (!F || !boardEl) return;
    ui.fc = (!ui.busy && !F.over) ? C.forecast(R) : null;
    paintTiles(F);
    syncUnits();
    paintHud(null);
    paintLines();
    paintBar();
    paintInfo();
  }

  /* ---------- playing back what the rules said happened ---------- */

  function fxTile(i, cls, ms) {
    const d = document.createElement('div');
    d.className = 'fxt ' + cls;
    d.style.left = (i % W) * 100 / W + '%'; d.style.top = ((i / W) | 0) * 100 / H + '%';
    fxEl.appendChild(d);
    setTimeout(() => d.remove(), ms || 500);
  }
  function float(i, text, cls) {
    const d = document.createElement('div');
    d.className = 'float ' + (cls || '');
    d.textContent = text;
    d.style.left = (i % W) * 100 / W + '%'; d.style.top = (((i / W) | 0) + 0.15) * 100 / H + '%';
    fxEl.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }
  function bump(el) { el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 130); }

  const FX = {
    async pmove(e) {
      if (e.kind === 'flit') { mothEl.classList.add('flit'); SFX.flit(); } else SFX.step();
      place(mothEl, e.to); ui.mp = e.to;
      await wait(e.kind === 'flit' ? 230 : 120);
      mothEl.classList.remove('flit');
    },
    async move(e) {
      const el = uel[e.id];
      if (!el) return;
      if (e.kind !== 'walk') el.classList.add(e.kind);
      place(el, e.to);
      await wait(e.kind === 'swoop' ? 250 : e.kind === 'push' ? 180 : 105);
      el.classList.remove('swoop', 'push');
    },
    snap(e) { paintTiles(e); paintHud(e); },
    async spark(e) { fxTile(e.i, 'fx-spark', 260); SFX.spark(); await wait(90); },
    async burn(e) {
      let max = 0;
      const k = opt().fast ? 0.4 : 1;
      for (const o of e.tiles) {
        if (o[1] > max) max = o[1];
        setTimeout(() => { tiles[o[0]].classList.remove('has-dust', 'has-litter', 'has-web'); fxTile(o[0], 'fx-burn', 520); }, o[1] * 55 * k);
      }
      SFX.burn(e.tiles.length);
      await wait(max * 55 + 230);
    },
    async dmg(e) {
      const el = uel[e.id];
      float(e.i, '−' + e.amt, e.src === 'fire' || e.src === 'smoulder' ? 'f-fire' : 'f-hit');
      if (el) { $('.hp', el).textContent = e.hp; bump(el); }
      await wait(80);
    },
    async die(e) {
      const el = uel[e.id];
      if (el) { el.classList.add('dying'); delete uel[e.id]; setTimeout(() => el.remove(), 320); }
      SFX.die();
      await wait(90);
    },
    async flee(e) { const el = uel[e.id]; if (el) { el.classList.add('dying'); delete uel[e.id]; setTimeout(() => el.remove(), 320); } },
    async spawn(e) {
      const el = uel[e.u.id] = makeUnit(e.u);
      el.classList.add('arriving');
      unitsEl.appendChild(el);
      place(el, e.u.i);
      await wait(40);
      el.classList.remove('arriving');
      await wait(170);
    },
    async atk(e) { const el = uel[e.id]; if (el) bump(el); SFX.hit(); await wait(110); },
    async hurt(e) {
      float(ui.mp, '−' + e.amt, 'f-hurt');
      boardEl.classList.add('shake');
      setTimeout(() => boardEl.classList.remove('shake'), 320);
      hudHp(e.hp);
      SFX.hurt();
      if (navigator.vibrate) { try { navigator.vibrate(18); } catch (x) { /* fine */ } }
      await wait(280);
    },
    async block() { float(ui.mp, 'eyespots', 'f-note'); await wait(220); },
    async heal(e) { float(ui.mp, '+' + e.amt, 'f-heal'); hudHp(e.hp); await wait(180); },
    async revive() { float(ui.mp, 'chrysalis', 'f-note'); await wait(500); },
    async strike(e) { for (const i of e.tiles) fxTile(i, 'fx-' + e.kind, 400); SFX.hit(); await wait(260); },
    async mark(e) { for (const i of e.tiles) fxTile(i, 'fx-warn', 320); await wait(110); },
    async boom(e) { for (const i of e.tiles) fxTile(i, 'fx-boom', 440); SFX.burn(7); await wait(210); },
    async pull(e) { place(mothEl, e.to); ui.mp = e.to; await wait(220); },
    async gust(e) { for (const j of C.NB4[e.i]) fxTile(j, 'fx-wave', 400); await wait(120); },
    async click(e) { for (let i = 0; i < N; i++) if (C.man(i, e.i) <= 2) fxTile(i, 'fx-wave', 420); await wait(260); },
    async puff(e) { for (const i of e.tiles) fxTile(i, 'fx-puff', 420); await wait(200); },
    async beam(e) { for (const i of e.tiles) fxTile(i, 'fx-beam', 440); SFX.flit(); await wait(220); },
    async dazed(e) { const el = uel[e.id]; if (el) float(el._i, 'dazed', 'f-note'); await wait(90); },
    async note(e) { float(ui.mp, e.s, 'f-note'); },
    async call() { await wait(120); },
    async remains(e) {
      ui.msg = '<span class="warm">' + esc(e.name) + ' fell here. ' + (e.boon ? 'Her ' + esc(C.BOON[e.boon].n) + ' is yours now.' : 'You carry her a little further.') + '</span>';
      float(ui.mp, e.boon ? C.BOON[e.boon].n : 'remembered', 'f-note');
      await wait(300);
    },
    async phase(e) { await wait(e.who === 'enemy' ? 90 : 40); },
  };

  async function play(ev) {
    for (const e of ev) { const f = FX[e.t]; if (f) await f(e); }
  }

  function banner(text, sub) {
    const d = document.createElement('div');
    d.className = 'banner';
    d.innerHTML = '<div>' + text + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
    boardEl.appendChild(d);
  }
  async function settle() {
    const R = S.run, F = R.f;
    ui.busy = true;
    renderFight();
    if (F.over === 1) {
      SFX.win();
      banner(F.kind === 'boss' ? esc(C.DEF[R.node.comp[0]].n) + ' is ash' : 'The clearing falls quiet', F.taken === 0 ? 'Not a scale out of place' : '');
      await wait(1100);
      C.afterFight(R);
    } else {
      SFX.lose();
      banner(esc(R.name) + ' falls', 'Her ember goes dark');
      await wait(1500);
      C.die(R);
    }
    ui.busy = false; ui.gift = -1;
    save();
    route();
  }

  async function runEvents(ev) {
    ui.busy = true; ui.msg = '';
    linesEl.innerHTML = '';
    for (const id in uel) uel[id].classList.remove('will-hit');
    paintBar(); paintTiles(S.run.f);
    await play(ev);
    ui.busy = false;
    save();
    if (S.run.f.over) return settle();
    renderFight();
  }
  function act(a) {
    if (ui.busy) return;
    const R = S.run, before = JSON.stringify(R), ev = [];
    if (!C.apply(R, a, ev)) return;
    ui.undo.push(before);
    ui.mode = null; ui.sel = -1;
    runEvents(ev);
  }
  function hint(msg) { ui.msg = msg; paintInfo(); }
  function onTile(i) {
    if (ui.busy) return;
    const R = S.run, F = R.f;
    if (F.over) return;
    ui.msg = '';
    if (ui.mode) {
      const tg = ui.mode === 'spark' ? C.sparkTargets(R) : C.abilTargets(R, ui.mode);
      if (tg.indexOf(i) >= 0) return act(ui.mode === 'spark' ? ['spark', i] : ['abil', ui.mode, i]);
      ui.mode = null;
    }
    if (C.moveTargets(R).indexOf(i) >= 0) return act(['move', i]);
    ui.sel = ui.sel === i ? -1 : i;
    if (ui.sel === i && C.adj(i, F.p) && !F.rock[i] && !C.unitAt(F, i)) {
      ui.sel = -1;
      return hint(F.root ? 'Webbed fast. You cannot fly this turn.' : F.e < C.moveCost(R, i) ? 'Not enough energy to fly there.' : '');
    }
    renderFight();
  }

  /* ---------- routing and actions ---------- */

  function route() {
    closeModal();
    const R = S.run;
    if (!R) return showHollow();
    window.scrollTo(0, 0);
    if (R.phase === 'path') return showPath();
    if (R.phase === 'fight') return showFight();
    if (R.phase === 'reward') return showReward();
    if (R.phase === 'event') return showEvent();
    return showEnd();
  }

  const ACT = {
    close() { closeModal(); },
    menu() { showMenu(); },
    how() { showHow(); },
    boons() { showBoons(); },
    boon(d) { const b = C.BOON[d.id]; openModal('<h2>' + esc(b.n) + '</h2><p>' + esc(b.d) + '</p><p class="muted">' + C.RARITY[b.r] + ' gift.</p><button class="btn primary wide" data-act="close">Close</button>'); },
    toggle(d) { opt()[d.k] = opt()[d.k] ? 0 : 1; save(); SFX.tap(); showMenu(); if (S.run && S.run.phase === 'fight' && boardEl && boardEl.isConnected) renderFight(); },
    fly() {
      if (!S.run) { S.run = C.startRun(S.meta, (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0); S.sum = null; S.orig = null; ui.gift = -1; save(); }
      SFX.tap(); route();
    },
    tab(d) { ui.tab = d.tab; showHollow(); },
    buy(d) { if (C.buy(S.meta, d.id)) { SFX.win(); save(); showHollow(); } },
    species(d) { if (S.meta.unlocked[d.id] && !S.run) { S.meta.species = d.id; save(); showHollow(); } else if (S.run) openModal('<h2>A moth is already aloft</h2><p>The next egg can be chosen once this flight has ended.</p><button class="btn primary wide" data-act="close">Close</button>'); },
    ecl(d) { const M = S.meta; M.ecl = Math.max(0, Math.min(M.maxEcl, (M.ecl || 0) + (+d.d))); save(); showHollow(); },
    hollow() { closeModal(); showHollow(); window.scrollTo(0, 0); },
    abandon() { openModal('<h2>Turn back?</h2><p>' + esc(S.run.name) + ' ends her flight here. She keeps the moondust she has gathered and may still pass down a scale.</p><button class="btn wide" data-act="abandon2">End the flight</button><button class="btn primary wide" data-act="close">Keep flying</button>'); },
    abandon2() { const R = S.run; R.cause = 'the long way home'; if (R.f) R.f = null; C.die(R); save(); route(); },
    wipe() { openModal('<h2>Forget the brood?</h2><p>Every scale, every upgrade and all the annals will be gone.</p><button class="btn wide" data-act="wipe2">Forget everything</button><button class="btn primary wide" data-act="close">Keep them</button>'); },
    wipe2() { S = { meta: C.newMeta(), run: null, sum: null, orig: null }; S.meta.seen.intro = 1; ui.tab = 'lineage'; save(); route(); },
    choose(d) { if (C.choose(S.run, +d.i)) { SFX.tap(); ui.undo = []; save(); route(); } },
    gift(d) { ui.gift = ui.gift === +d.i ? -1 : +d.i; SFX.tap(); showReward(); },
    take() { if (ui.gift < 0) return; if (C.takeReward(S.run, ui.gift)) { ui.gift = -1; SFX.win(); save(); route(); } },
    skip() { if (C.takeReward(S.run, -1)) { ui.gift = -1; save(); route(); } },
    reroll() { if (C.reroll(S.run)) { ui.gift = -1; save(); showReward(); } },
    opt(d) { if (C.eventChoose(S.run, +d.i)) { ui.gift = -1; SFX.tap(); save(); route(); } },
    pickScale(d) {
      const n = C.slots(S.meta), orig = S.orig || [];
      ui.pick = ui.pick === d.id ? null : d.id;
      ui.slot = null;
      if (ui.pick) { for (let i = 0; i < n; i++) if (!orig[i]) { ui.slot = i; break; } }
      showEnd();
    },
    placeScale(d) { if (ui.pick) { ui.slot = +d.i; showEnd(); } },
    home() {
      if (ui.pick != null && ui.slot != null) { S.meta.scales = (S.orig || []).slice(); C.inherit(S.meta, ui.pick, ui.slot); }
      S.run = null; S.sum = null; S.orig = null; ui.pick = null; ui.slot = null; ui.tab = 'lineage';
      save(); route(); window.scrollTo(0, 0);
    },
    tile(d) { onTile(+d.i); },
    spark() {
      if (ui.busy) return;
      const R = S.run;
      if (!C.sparkTargets(R).length) return hint(R.f.e < 1 ? 'No energy left to Spark.' : 'Nothing to light. Spark needs dust, litter or web beside you.');
      ui.mode = ui.mode === 'spark' ? null : 'spark'; ui.sel = -1; ui.msg = '';
      renderFight();
    },
    abil(d) {
      if (ui.busy) return;
      const R = S.run, F = R.f, id = d.id, a = C.ABIL[id], tg = C.abilTargets(R, id);
      if (!tg.length) {
        return hint((F.cd[id] || 0) > 0 ? a.n + ' is ready again in ' + F.cd[id] + (F.cd[id] === 1 ? ' turn.' : ' turns.') : F.e < C.abilCost(R, id) ? 'Not enough energy for ' + a.n + '.' :
          id === 'flit' && F.root ? 'Webbed fast. No Flit this turn.' : 'Nothing in reach for ' + a.n + '.');
      }
      if (!a.pick) return act(['abil', id, tg[0]]);
      ui.mode = ui.mode === id ? null : id; ui.sel = -1; ui.msg = '';
      renderFight();
    },
    flask() { if (!ui.busy) act(['flask']); },
    undo() {
      if (ui.busy || !ui.undo.length) return;
      S.run = JSON.parse(ui.undo.pop());
      ui.mode = null; ui.sel = -1; ui.msg = '';
      for (const id in uel) uel[id].remove();
      uel = {};
      save();
      renderFight();
    },
    end() {
      if (ui.busy || !S.run.f || S.run.f.over) return;
      const ev = [];
      ui.undo = []; ui.mode = null; ui.sel = -1;
      C.endTurn(S.run, ev);
      runEvents(ev);
    },
  };

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || el.getAttribute('aria-disabled') === 'true') return;
    const f = ACT[el.dataset.act];
    if (f) f(el.dataset, el);
  }
  app.addEventListener('click', onClick);
  modal.addEventListener('click', onClick);

  document.addEventListener('keydown', e => {
    if (!modal.hidden) { if (e.key === 'Escape') closeModal(); return; }
    const R = S.run;
    if (!R || R.phase !== 'fight' || !R.f || !boardEl || !boardEl.isConnected) return;
    const k = e.key.toLowerCase();
    const dir = { arrowup: [0, -1], w: [0, -1], arrowright: [1, 0], d: [1, 0], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0] }[k];
    if (dir) { const j = C.at(R.f.p % W + dir[0], ((R.f.p / W) | 0) + dir[1]); if (j >= 0) onTile(j); e.preventDefault(); }
    else if (k === 'e') ACT.end();
    else if (k === 'z') ACT.undo();
    else if (k === '1') ACT.spark();
    else if (k >= '2' && k <= '4' && R.abil[+k - 2]) ACT.abil({ id: R.abil[+k - 2] });
    else if (k === 'escape') { ui.mode = null; ui.sel = -1; renderFight(); }
  });

  /* A plain-text view of the fight, for debugging from the console. */
  window.MWdbg = {
    state: () => S, ui,
    ascii() {
      const R = S.run, F = R && R.f;
      if (!F) return R ? 'phase ' + R.phase : 'in the hollow';
      let out = '';
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x, u = C.unitAt(F, i);
          let a = F.rock[i] ? '#' : i === F.p ? '@' : u ? (C.DEF[u.k].boss || C.DEF[u.k].elite ? u.k[0].toUpperCase() : u.k[0]) : '.';
          let b = F.dust[i] ? '*' : F.litter[i] ? '"' : F.web[i] ? '%' : F.wet[i] ? '~' : ' ';
          if (F.marks.some(m => m.tiles.indexOf(i) >= 0)) b = '!';
          out += a + b + ' ';
        }
        out += '\n';
      }
      const fc = F.over ? null : C.forecast(R);
      out += 'hp ' + R.hp + '/' + R.mhp + '  e ' + F.e + '  dust ' + C.dustCount(F) + '/' + R.cap + '  turn ' + F.turn + '  cd ' + JSON.stringify(F.cd) + (F.root ? '  ROOTED' : '') + '\n';
      out += F.units.map(u => u.k + '#' + u.id + '@' + (u.i % W) + ',' + ((u.i / W) | 0) + ' hp' + u.hp + (u.stun ? ' dazed' : '')).join(' | ') + '\n';
      if (fc) out += 'if end now: -' + fc.dmg + (fc.dead ? ' DEAD' : '') + '  hitters ' + JSON.stringify(fc.hits) + '  they go ' + fc.units.map(g => g.id + '>' + (g.i % W) + ',' + ((g.i / W) | 0)).join(' ');
      if (F.spawns.length) out += '\nspawns ' + JSON.stringify(F.spawns);
      return out;
    },
  };

  route();
})();
