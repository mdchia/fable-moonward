/* Moonward - core rules.
   No DOM in here. Loads in the browser as window.MW and in Node via require().
   Everything in a run is plain JSON, so a run can be cloned (forecasts, undo) and saved as-is. */
(function (root) {
  'use strict';

  const W = 6, H = 7, N = W * H;
  const DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const xy = i => [i % W, (i / W) | 0];
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : y * W + x;
  const NB4 = [], NB8 = [];
  for (let i = 0; i < N; i++) {
    const [x, y] = xy(i);
    NB4.push(DIR.map(d => at(x + d[0], y + d[1])).filter(j => j >= 0));
    const a = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) { const j = at(x + dx, y + dy); if (j >= 0) a.push(j); }
    NB8.push(a);
  }
  const man = (a, b) => Math.abs(a % W - b % W) + Math.abs(((a / W) | 0) - ((b / W) | 0));
  const adj = (a, b) => man(a, b) === 1;
  const zeros = () => new Array(N).fill(0);
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ---------- data ---------- */

  const DEF = {
    ant: { n: 'Ant', hp: 1, mv: 2, dmg: 1, ai: 'chase', cost: 1, d: 'Scurries 2 tiles. Bites if you end your turn beside it.' },
    beetle: { n: 'Stag Beetle', hp: 4, mv: 1, dmg: 2, ai: 'chase', cost: 2, d: 'Slow and heavy. Crushes for 2 if you end your turn beside it.' },
    spider: { n: 'Spider', hp: 3, mv: 2, dmg: 1, ai: 'chase', web: 1, cost: 2, d: 'Trails web behind it. Web slows you, but it burns just like dust.' },
    snail: { n: 'Snail', hp: 2, mv: 1, dmg: 1, ai: 'chase', armor: 1, slime: 1, cost: 2, d: 'Shell: never takes more than 1 damage at a time. Its slime washes dust away.' },
    spitter: { n: 'Spitter', hp: 2, mv: 1, dmg: 2, ai: 'spit', shape: 'dot', cycle: 1, rng: 3, cost: 2, d: 'Lobs acid at your tile from up to 3 away, and creeps closer when you are out of reach. It lands after your next turn.' },
    mantis: { n: 'Mantis', hp: 9, mv: 2, dmg: 2, ai: 'pounce', cost: 6, elite: 1, d: 'Stalks 2 tiles and strikes in the same breath.' },
    wasp: { n: 'Wasp', hp: 2, mv: 3, dmg: 2, ai: 'pounce', cost: 2, d: 'Darts 3 tiles and stings in the same turn.' },
    bat: { n: 'Bat', hp: 5, mv: 2, dmg: 2, ai: 'charge', cost: 3, d: 'Lines up with you, then swoops the whole row or column a turn later. It hits its own side too.' },
    lfly: { n: 'Lanternfly', hp: 2, mv: 2, dmg: 1, ai: 'chase', explode: 1, cost: 2, d: 'Bursts when it dies: 2 to every creature around it, 1 to you.' },
    bomb: { n: 'Bombardier', hp: 5, mv: 1, dmg: 2, ai: 'spit', shape: 'plus', cycle: 2, rng: 3, cost: 3, d: 'Sprays a cross of boiling acid where you stand from up to 3 away, every other turn.' },
    toad: { n: 'Toad', hp: 12, mv: 1, dmg: 2, ai: 'toad', cost: 7, elite: 1, d: 'End your turn in line with it, within 3 tiles, and its tongue drags you in.' },
    shade: { n: 'Shade', hp: 5, mv: 2, dmg: 2, ai: 'chase', snuff: 1, cost: 3, d: 'A scrap of the moonless dark. It burns, but fire that reaches it spreads no further.' },
    owlet: { n: 'Owlet', hp: 6, mv: 3, dmg: 2, ai: 'pounce', cost: 4, d: 'Glides 3 tiles and strikes in the same turn.' },
    squall: { n: 'Squall', hp: 5, mv: 1, dmg: 2, ai: 'spit', shape: 'row', cycle: 2, rng: 4, cost: 3, d: 'Calls lightning down your whole row from up to 4 away. Lightning also lights any fuel it touches.' },
    spiderling: { n: 'Spiderling', hp: 1, mv: 2, dmg: 1, ai: 'chase', web: 1, cost: 1, d: 'Small, quick, and trailing web.' },
    puff: { n: 'Puffball', hp: 1, ai: 'none', explode: 1, d: 'Not alive, exactly. Bursts when burned or struck: 2 to creatures around it, 1 to you.' },
    weaver: { n: 'The Weaver', hp: 13, mv: 2, dmg: 2, ai: 'weaver', web: 1, boss: 1, d: 'Casts web where you stand, lunges, then calls her brood. Everything she spins will burn.' },
    lamp: { n: 'The False Moon', hp: 15, mv: 0, dmg: 3, ai: 'lamp', boss: 1, heat: 1, fixed: 1, pull: 1, d: 'Draws you 2 tiles closer every turn, and zaps you if you end beside it. Its glass cracks from heat: burn the tiles around it.' },
    hush: { n: 'The Hush', hp: 22, mv: 2, dmg: 2, ai: 'hush', boss: 1, d: 'Stoops on where you stood, then beats the dust away. It lands on whatever you left behind.' },
  };

  const BOON = {
    longfuse: { n: 'Long Fuse', r: 0, ic: 'flame', d: 'A spark that burns 5 or more tiles deals +1 damage.' },
    smoulder: { n: 'Smoulder', r: 0, ic: 'flame', d: 'Burned enemies take 1 more damage at the start of their next turn.' },
    ember: { n: 'Ember Touch', r: 1, ic: 'flame', d: 'Spark can also singe an enemy beside you directly, for 1, with no fuel at all.' },
    heavy: { n: 'Heavy Scales', r: 0, ic: 'dust', d: 'Dust capacity +3.' },
    glitter: { n: 'Glare', r: 0, ic: 'dust', d: 'Enemies standing on your dust deal 1 less damage.' },
    dawn: { n: 'Quick Start', r: 0, ic: 'wing', d: '+2 energy on the first turn of each fight.' },
    feather: { n: 'Featherlight', r: 0, ic: 'wing', d: 'Flit recharges 1 turn sooner.' },
    updraft: { n: 'Updraft', r: 0, ic: 'wing', d: 'Flit reaches 1 tile further.' },
    thrift: { n: 'Thrift', r: 0, ic: 'wing', d: 'Carry 1 unspent energy into your next turn.' },
    webwalk: { n: 'Silk-Shod', r: 0, ic: 'wing', d: 'Webs cost nothing extra, stay whole beneath you, and cannot root you.' },
    fur: { n: 'Thick Fur', r: 0, ic: 'shield', d: '+2 max health, and heal 2.' },
    sip: { n: 'Nectar Sip', r: 0, ic: 'shield', d: 'Heal 1 after every fight.' },
    hairs: { n: 'Irritant Hairs', r: 0, ic: 'shield', d: 'Enemies that strike you take 1 damage.' },
    glean: { n: 'Gleaner', r: 0, ic: 'moon', d: '+1 moondust after every fight.' },
    linger: { n: 'Lingering Flame', r: 1, ic: 'flame', d: 'Burned tiles stay alight through the enemy turn. Enemies entering them take 1.' },
    leap: { n: 'Sparkleap', r: 1, ic: 'flame', d: 'Fire also spreads diagonally.' },
    backdraft: { n: 'Backdraft', r: 1, ic: 'flame', d: 'Enemies killed by fire burst, dealing 1 to the enemies beside them.' },
    feast: { n: 'Cinder Feast', r: 1, ic: 'shield', d: 'Burn 3 or more enemies with one spark to heal 1.' },
    kindled: { n: 'Kindled', r: 1, ic: 'flame', d: 'The first time each turn your fire burns an enemy, regain 1 energy.' },
    far: { n: 'Far Spark', r: 1, ic: 'flame', d: 'Spark reaches 2 tiles away.' },
    sticky: { n: 'Clinging Dust', r: 1, ic: 'dust', d: 'Enemies stop moving when they step into dust.' },
    slip: { n: 'Slipstream', r: 1, ic: 'wing', d: 'Flit costs no energy.' },
    eyespots: { n: 'Eyespots', r: 1, ic: 'shield', d: 'Ignore the first hit you take in each fight.' },
    gust: { n: 'Wingbeat', r: 1, ic: 'wing', abil: 'gust', d: 'New move: shove every adjacent enemy 2 tiles back. Colliding hurts them.' },
    bomb: { n: 'Dust Puff', r: 1, ic: 'dust', abil: 'bomb', d: 'New move: dust a tile within 3 and its neighbours, even under enemies.' },
    tinder: { n: 'Tinder Scales', r: 2, ic: 'flame', d: 'Fire deals +1 damage.' },
    flash: { n: 'Flash Powder', r: 2, ic: 'flame', d: 'The first time your fire burns an enemy, it is dazed and loses its next turn. Guardians shrug it off.' },
    wildfire: { n: 'Wildfire', r: 2, ic: 'flame', d: 'Enemies beside a burning tile are scorched for 1.' },
    swift: { n: 'Fourth Wing', r: 2, ic: 'wing', d: '+1 energy every turn.' },
    chrys: { n: 'Chrysalis', r: 2, ic: 'shield', d: 'Once per flight, a killing blow leaves you at half health instead.' },
    beam: { n: 'Moonbeam', r: 2, ic: 'moon', abil: 'beam', d: 'New move: 2 damage to every enemy in a line, lighting any fuel it crosses.' },
  };
  const GAIN = {
    heavy: R => { R.cap += 3; },
    fur: R => { R.mhp += 2; R.hp = Math.min(R.mhp, R.hp + 2); },
    swift: R => { R.emax += 1; },
    ember: R => { R.singe += 1; },
    chrys: R => { R.revive += 1; },
    wildfire: R => { R.heat += 1; },
  };
  const RARITY = ['Common', 'Uncommon', 'Rare'];

  const ABIL = {
    flit: { n: 'Flit', cost: 1, cd: 3, pick: 1, d: 'Leap in a straight line, over anything, dusting every tile you cross.' },
    gust: { n: 'Wingbeat', cost: 1, cd: 3, pick: 0, d: 'Shove every adjacent enemy 2 tiles back.' },
    bomb: { n: 'Dust Puff', cost: 1, cd: 3, pick: 1, d: 'Dust a tile within 3 and its neighbours.' },
    beam: { n: 'Moonbeam', cost: 2, cd: 4, pick: 1, d: '2 damage down a whole line. Lights fuel.' },
    click: { n: 'Click', cost: 1, cd: 4, pick: 0, d: 'Daze every enemy within 2 tiles.' },
  };

  const SPECIES = {
    luna: { n: 'Luna Moth', hp: 8, e: 3, cap: 6, flitR: 4, d: 'Long-tailed and steady. Her Flit reaches 4 tiles.' },
    tiger: { n: 'Tiger Moth', hp: 7, e: 3, cap: 6, flitR: 3, abil: ['click'], d: 'Knows the Click, a cry that dazes every enemy within 2 tiles.', lock: 'Defeat the Weaver.' },
    hawk: { n: 'Hawk Moth', hp: 6, e: 4, cap: 5, flitR: 3, d: 'Frail and fast: 4 energy every turn.', lock: 'Defeat the False Moon.' },
    ghost: { n: 'Ghost Moth', hp: 7, e: 3, cap: 8, flitR: 3, heat: 1, d: 'Her fire scorches. Enemies beside a burning tile take 1.', lock: 'Lose 3 moths to the dark.' },
  };

  const UPG = {
    span: { n: 'Wing Span', cost: [25, 60], d: 'One more scale can be passed down the line.' },
    jelly: { n: 'Royal Jelly', cost: [8, 20, 40], d: '+1 max health.' },
    glands: { n: 'Dust Glands', cost: [10, 25], d: '+1 dust capacity.' },
    scouts: { n: 'Scout Moths', cost: [10, 25], d: 'One more reroll of gift choices each flight.' },
    remember: { n: 'Remembrance', cost: [12], d: 'Finding the remains of the fallen also heals 3.' },
    trails: { n: 'Old Trails', cost: [15], d: 'Every fight begins with 3 dust already laid ahead of you.' },
    dawn: { n: 'Dawn Stretch', cost: [20], d: '+1 energy on the first turn of every fight.' },
    flask: { n: 'Nectar Flask', cost: [20], d: 'Carry a flask: once per flight, heal 4 without spending energy.' },
    keeper: { n: 'Ember Keeper', cost: [25], d: 'The first spark of each fight burns for +1.' },
    gleaners: { n: 'Moon-Gleaners', cost: [30], d: 'A quarter more moondust from every flight.' },
    sendoff: { n: "Elder's Send-off", cost: [35], d: 'Begin every flight by choosing 1 of 3 gifts.' },
    chrysalis: { n: 'Chrysalis Rite', cost: [60], d: 'Once per flight, a killing blow leaves you at half health instead.' },
  };

  const ZONES = [
    { id: 'hedge', n: 'The Hedgerow', pool: ['ant', 'ant', 'beetle', 'spider', 'snail', 'spitter'], budget: [5, 7, 8], elite: ['mantis', 'ant', 'ant'], boss: ['weaver'], rocks: [2, 4], dew: 1, puff: 1 },
    { id: 'lane', n: 'The Lamplit Lane', pool: ['wasp', 'wasp', 'bat', 'lfly', 'bomb', 'spider', 'beetle'], budget: [13, 15, 17], elite: ['toad', 'wasp', 'wasp', 'lfly'], boss: ['lamp'], rocks: [2, 4], dew: 2, puff: 1 },
    { id: 'dark', n: 'The High Dark', pool: ['shade', 'shade', 'owlet', 'squall', 'wasp', 'bat', 'lfly'], budget: [17, 20, 22], elite: ['owlet', 'owlet', 'shade', 'shade'], boss: ['hush', 'shade'], rocks: [1, 3], dew: 2, puff: 2 },
  ];

  const EVENTS = {
    rest: { n: 'A moonflower, still open', t: 'Its cup holds a little of last night. There is room to rest beneath the petals.',
      opts: [{ l: 'Drink and sleep', d: 'Heal 5.', hp: 5 }, { l: 'Preen your wings', d: '+2 dust capacity for this flight.', cap: 2 }] },
    lampwick: { n: 'A guttering lamp', t: 'Someone left it burning on a sill. The flame is small and very close, and every part of you wants it.',
      opts: [{ l: 'Fly through the flame', d: 'Lose 2 health. Choose a rare gift.', hp: -2, pick: 2 }, { l: 'Circle once and go', d: 'Gain 3 moondust.', md: 3 }] },
    cicada: { n: 'The old cicada', t: 'Seventeen years underground, one summer in the light. It has opinions about patience.',
      opts: [{ l: 'Listen until it finishes', d: '+1 max health, and heal 2.', mhp: 1, hp: 2 }, { l: 'Ask for its husk', d: '+2 dust capacity for this flight.', cap: 2 }] },
    jasmine: { n: 'Night-blooming jasmine', t: 'The whole vine has opened at once. The air is thick enough to drink.',
      opts: [{ l: 'Drink deep', d: 'Heal 4.', hp: 4 }, { l: 'Roll in the pollen', d: 'Choose a gift.', pick: 1 }] },
    husk: { n: 'An empty chrysalis', t: 'Split down the back, long since left. Whoever she was, she got out.',
      opts: [{ l: 'Shelter inside a while', d: 'Heal 3.', hp: 3 }, { l: 'Take a thread of its silk', d: 'Gain 4 moondust.', md: 4 }] },
  };

  const NAMES = ['Ilse', 'Maren', 'Sable', 'Wren', 'Oona', 'Tamsin', 'Lark', 'Edda', 'Bryn', 'Calla', 'Fenn', 'Isolde', 'Juno', 'Linnea', 'Mab', 'Nyx', 'Orla', 'Petra', 'Quill', 'Rue',
    'Selene', 'Thistle', 'Una', 'Vesper', 'Willow', 'Yarrow', 'Zinnia', 'Ash', 'Briar', 'Clove', 'Dusk', 'Elm', 'Fable', 'Garnet', 'Hazel', 'Ivy', 'Kit', 'Lumen', 'Moss', 'Nettle'];

  /* ---------- rng (state lives in the run, so clones replay identically) ---------- */

  function rnd(R) {
    let t = (R.rng = (R.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const ri = (R, n) => Math.floor(rnd(R) * n);
  const pick = (R, a) => a[ri(R, a.length)];
  function shuffle(R, a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(R, i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------- small helpers ---------- */

  const E = (ev, o) => { if (ev) ev.push(o); };
  const has = (R, b) => R.boons.indexOf(b) >= 0;
  const unitAt = (F, i) => { for (const u of F.units) if (u.i === i) return u; return null; };
  const hostile = u => DEF[u.k].ai !== 'none';
  const alive = (F, u) => u.hp > 0 && F.units.indexOf(u) >= 0;
  const blocked = (F, i) => !!(F.rock[i] || i === F.p || unitAt(F, i));
  const fuel = (F, i) => { if (F.dust[i] || F.litter[i] || F.web[i]) return true; const u = unitAt(F, i); return !!(u && u.k === 'puff'); };
  const newCtx = first => ({ burned: {}, nb: 0, kills: 0, tiles: 0, first: !!first });
  const rank = (M, id) => (M.upg && M.upg[id]) || 0;

  function snap(R, ev) {
    if (!ev) return;
    const F = R.f;
    ev.push({ t: 'snap', dust: F.dust.slice(), web: F.web.slice(), wet: F.wet.slice(), litter: F.litter.slice(), flame: F.flame.slice(),
      marks: clone(F.marks), spawns: clone(F.spawns), hp: R.hp, e: F.e, remains: F.remains });
  }

  function heal(R, n, ev) {
    const b = R.hp;
    R.hp = Math.min(R.mhp, R.hp + n);
    if (R.hp > b) E(ev, { t: 'heal', amt: R.hp - b, hp: R.hp });
    return R.hp - b;
  }

  function dustCount(F) { let c = 0; for (let i = 0; i < N; i++) if (F.dust[i]) c++; return c; }

  function layDust(R, i) {
    const F = R.f;
    if (F.rock[i] || F.wet[i] > 0) return false;
    const on = unitAt(F, i);
    if (on && DEF[on.k].fixed) return false;
    F.dust[i] = ++F.seq;
    let cnt = 0, old = -1;
    for (let j = 0; j < N; j++) if (F.dust[j]) { cnt++; if (old < 0 || F.dust[j] < F.dust[old]) old = j; }
    if (cnt > R.cap) F.dust[old] = 0;
    return true;
  }

  /* ---------- damage, death, fire ---------- */

  function hurt(R, amt, src, ev) {
    const F = R.f;
    if (F.over || amt <= 0) return;
    if (has(R, 'eyespots') && !F.used.eyes) { F.used.eyes = 1; E(ev, { t: 'block' }); return; }
    R.hp -= amt; F.taken += amt;
    E(ev, { t: 'hurt', amt, hp: Math.max(0, R.hp), by: src && src.id });
    if (R.hp > 0) return;
    if (R.revive > 0) {
      R.revive--; R.hp = Math.max(1, Math.floor(R.mhp / 2));
      for (const u of F.units) if (hostile(u)) stunUnit(F, u);
      E(ev, { t: 'revive', hp: R.hp });
      return;
    }
    R.hp = 0; F.over = -1;
    R.cause = src ? (src.k ? DEF[src.k].n : src.n) : 'the dark';
    E(ev, { t: 'dead' });
  }

  function stunUnit(F, u) {
    if (DEF[u.k].boss) return false;
    u.stun = 1; u.rest = 0;
    F.marks = F.marks.filter(m => m.own !== u.id);
    return true;
  }

  function checkWin(R, ev) {
    const F = R.f;
    if (F.over) return;
    if (!F.units.some(hostile) && !F.spawns.length) { F.over = 1; E(ev, { t: 'win' }); }
  }

  function dmgUnit(R, u, amt, src, ev, ctx) {
    const F = R.f, d = DEF[u.k];
    if (!alive(F, u)) return 0;
    if (d.armor) amt = Math.min(amt, d.armor);
    if (amt <= 0) return 0;
    u.hp -= amt;
    E(ev, { t: 'dmg', id: u.id, i: u.i, amt, hp: Math.max(0, u.hp), src });
    if (src === 'fire' && hostile(u)) {
      if (ctx && !ctx.burned[u.id]) { ctx.burned[u.id] = 1; ctx.nb++; }
      if (has(R, 'smoulder')) u.smo = 1;
      if (has(R, 'flash') && !u.fl) { u.fl = 1; stunUnit(F, u); }
    }
    if (u.hp <= 0) killUnit(R, u, src, ev, ctx);
    return amt;
  }

  function killUnit(R, u, src, ev, ctx) {
    const F = R.f, d = DEF[u.k];
    const k = F.units.indexOf(u);
    if (k < 0) return;
    F.units.splice(k, 1);
    F.marks = F.marks.filter(m => m.own !== u.id);
    E(ev, { t: 'die', id: u.id, i: u.i, k: u.k });
    if (hostile(u)) { R.stats.kills[u.k] = (R.stats.kills[u.k] || 0) + 1; if (ctx) ctx.kills++; }
    if (d.explode) explode(R, u.i, ev, ctx);
    if (src === 'fire' && hostile(u) && has(R, 'backdraft')) {
      for (const j of NB4[u.i]) { const v = unitAt(F, j); if (v && hostile(v)) dmgUnit(R, v, 1, 'blast', ev, ctx); }
    }
    if (d.boss) {
      for (const v of F.units.slice()) if (hostile(v)) { F.units.splice(F.units.indexOf(v), 1); E(ev, { t: 'flee', id: v.id }); }
      F.marks = []; F.spawns = [];
    }
    checkWin(R, ev);
  }

  function explode(R, c, ev, ctx) {
    const F = R.f, area = [c].concat(NB8[c]);
    E(ev, { t: 'boom', i: c, tiles: area });
    for (const j of area) { const v = unitAt(F, j); if (v) dmgUnit(R, v, 2, 'blast', ev, ctx); }
    if (area.indexOf(F.p) >= 0) hurt(R, 1, { n: 'a bursting spore' }, ev);
    for (const j of area) if (fuel(F, j)) burn(R, j, ev, ctx);
  }

  /* Fire runs through every connected fuel tile at once. */
  function burnTiles(R, start) {
    const F = R.f, nb = has(R, 'leap') ? NB8 : NB4;
    const seen = {}, order = [[start, 0]];
    seen[start] = 1;
    for (let h = 0; h < order.length; h++) {
      const i = order[h][0], d = order[h][1], on = unitAt(F, i);
      if (on && DEF[on.k].snuff) continue;
      for (const j of nb[i]) if (!seen[j] && fuel(F, j)) { seen[j] = 1; order.push([j, d + 1]); }
    }
    return order;
  }
  function burnDmg(R, n, first) {
    return R.burn + (has(R, 'tinder') ? 1 : 0) + (has(R, 'longfuse') && n >= 5 ? 1 : 0) + (first ? 1 : 0);
  }

  function burn(R, start, ev, ctx) {
    const F = R.f;
    ctx = ctx || newCtx();
    const order = burnTiles(R, start);
    const dmg = burnDmg(R, order.length, ctx.first);
    const linger = has(R, 'linger'), lit = {};
    for (const o of order) { const i = o[0]; lit[i] = 1; F.dust[i] = 0; F.litter[i] = 0; F.web[i] = 0; if (linger) F.flame[i] = 1; }
    ctx.tiles += order.length;
    E(ev, { t: 'burn', tiles: order, dmg });
    for (const o of order) { const u = unitAt(F, o[0]); if (u && !DEF[u.k].heat) dmgUnit(R, u, dmg, 'fire', ev, ctx); }
    // radiant heat: the False Moon cracks from fire beside it, and some moths scorch whatever stands near
    for (const u of F.units.slice()) {
      if (!alive(F, u)) continue;
      const d = DEF[u.k], on = !!lit[u.i];
      let n = 0;
      for (const j of NB4[u.i]) if (lit[j]) n++;
      if (d.heat) { const a = (on ? dmg : 0) + n; if (a) dmgUnit(R, u, a, 'fire', ev, ctx); }
      else if (!on && n && R.heat && hostile(u)) dmgUnit(R, u, R.heat, 'fire', ev, ctx);
    }
  }

  function afterFire(R, ctx, ev) {
    const F = R.f;
    if (ctx.nb >= 1 && has(R, 'kindled') && !F.used.kind) { F.used.kind = 1; F.e++; E(ev, { t: 'note', s: 'Kindled' }); }
    if (ctx.nb >= 3 && has(R, 'feast')) heal(R, 1, ev);
    if (ctx.nb > (R.stats.best || 0)) R.stats.best = ctx.nb;
    if (ctx.tiles > (R.stats.fuse || 0)) R.stats.fuse = ctx.tiles;
  }

  /* ---------- player actions ---------- */

  function arrive(R, ev) {
    const F = R.f;
    if (F.remains !== F.p) return;
    F.remains = -1;
    const rem = R.rem || {};
    const b = (rem.boons || []).find(x => BOON[x] && !has(R, x) && allowed(R, x));
    if (b) gainBoon(R, b);
    if (R.remHeal) heal(R, 3, ev);
    E(ev, { t: 'remains', boon: b || null, name: rem.name || 'one who came before' });
    R.rem = null;
  }

  const MELEE = { chase: 1, pounce: 1, toad: 1, weaver: 1, hush: 1 };
  /* Enemies beside you that will bite if you step away. Flit and being dragged never provoke. */
  function biters(R) {
    const F = R.f, out = [];
    for (const j of NB4[F.p]) { const u = unitAt(F, j); if (u && MELEE[DEF[u.k].ai] && !u.stun) out.push(u); }
    return out;
  }

  function moveCost(R, i) { return 1 + (R.f.web[i] && !has(R, 'webwalk') ? 1 : 0); }
  function moveTargets(R) {
    const F = R.f;
    if (!F || F.over || F.root) return [];
    return NB4[F.p].filter(i => !F.rock[i] && !unitAt(F, i) && F.e >= moveCost(R, i));
  }
  function move(R, i, ev) {
    if (moveTargets(R).indexOf(i) < 0) return false;
    const F = R.f, from = F.p, bit = biters(R);
    F.e -= moveCost(R, i);
    F.p = i;
    layDust(R, from);
    if (F.web[i] && !has(R, 'webwalk')) F.web[i] = 0;
    E(ev, { t: 'pmove', from, to: i, kind: 'step' });
    for (const u of bit) { if (F.over) break; if (alive(F, u)) strike(R, u, ev); }
    if (F.over) { snap(R, ev); return true; }
    arrive(R, ev);
    snap(R, ev);
    return true;
  }

  function sparkTargets(R) {
    const F = R.f;
    if (!F || F.over || F.e < 1) return [];
    const r = has(R, 'far') ? 2 : 1, out = [];
    for (let i = 0; i < N; i++) {
      const m = man(i, F.p);
      if (m > r || F.rock[i]) continue;
      if (fuel(F, i) || (R.singe > 0 && m === 1 && unitAt(F, i))) out.push(i);
    }
    return out;
  }
  /* What a spark on tile i would do, without doing it. */
  function burnPreview(R, i) {
    const F = R.f;
    if (!fuel(F, i)) return { tiles: [i], dmg: R.singe, fire: false };
    const order = burnTiles(R, i);
    return { tiles: order.map(o => o[0]), dmg: burnDmg(R, order.length, R.kindling && !F.used.first), fire: true };
  }
  function spark(R, i, ev) {
    if (sparkTargets(R).indexOf(i) < 0) return false;
    const F = R.f;
    F.e--;
    const ctx = newCtx(R.kindling && !F.used.first);
    E(ev, { t: 'spark', from: F.p, i });
    if (fuel(F, i)) burn(R, i, ev, ctx);
    else dmgUnit(R, unitAt(F, i), R.singe, 'spark', ev, ctx);
    F.used.first = 1;
    afterFire(R, ctx, ev);
    snap(R, ev);
    return true;
  }

  function abilReady(R, id) {
    const F = R.f, a = ABIL[id];
    if (!F || F.over || R.abil.indexOf(id) < 0 || (F.cd[id] || 0) > 0) return false;
    return F.e >= abilCost(R, id);
  }
  function abilCost(R, id) { return (id === 'flit' && has(R, 'slip')) ? 0 : ABIL[id].cost; }
  function abilTargets(R, id) {
    if (!abilReady(R, id)) return [];
    const F = R.f, px = F.p % W, py = (F.p / W) | 0, out = [];
    if (id === 'flit') {
      if (F.root) return [];
      const r = R.flitR + (has(R, 'updraft') ? 1 : 0);
      for (const d of DIR) for (let k = 2; k <= r; k++) {
        const j = at(px + d[0] * k, py + d[1] * k);
        if (j < 0) break;
        if (!F.rock[j] && !unitAt(F, j)) out.push(j);
      }
    } else if (id === 'gust') {
      if (NB4[F.p].some(j => { const u = unitAt(F, j); return u && !DEF[u.k].boss; })) out.push(F.p);
    } else if (id === 'click') {
      if (F.units.some(u => hostile(u) && !DEF[u.k].boss && man(u.i, F.p) <= 2)) out.push(F.p);
    } else if (id === 'bomb') {
      for (let i = 0; i < N; i++) if (!F.rock[i] && i !== F.p && man(i, F.p) <= 3) out.push(i);
    } else if (id === 'beam') {
      for (const j of NB4[F.p]) out.push(j);
    }
    return out;
  }
  function useAbil(R, id, i, ev) {
    if (abilTargets(R, id).indexOf(i) < 0) return false;
    const F = R.f, a = ABIL[id], ctx = newCtx();
    const px = F.p % W, py = (F.p / W) | 0, tx = i % W, ty = (i / W) | 0;
    F.e -= abilCost(R, id);
    F.cd[id] = a.cd;
    if (id === 'flit') {
      const from = F.p, dx = Math.sign(tx - px), dy = Math.sign(ty - py), path = [];
      for (let x = px, y = py; x !== tx || y !== ty; x += dx, y += dy) path.push(at(x, y));
      F.p = i;
      for (const j of path) layDust(R, j);
      if (F.web[i] && !has(R, 'webwalk')) F.web[i] = 0;
      if (has(R, 'feather')) F.cd.flit = a.cd - 1;
      E(ev, { t: 'pmove', from, to: i, kind: 'flit', path });
      arrive(R, ev);
    } else if (id === 'gust') {
      E(ev, { t: 'gust', i: F.p });
      for (const d of DIR) {
        const j = at(px + d[0], py + d[1]);
        const u = j >= 0 ? unitAt(F, j) : null;
        if (!u || DEF[u.k].boss) continue;
        let cur = j, bumped = false;
        for (let k = 0; k < 2; k++) {
          const n = at((cur % W) + d[0], ((cur / W) | 0) + d[1]);
          if (n < 0 || F.rock[n] || unitAt(F, n)) { bumped = true; break; }
          cur = n;
        }
        if (cur !== j) { u.i = cur; E(ev, { t: 'move', id: u.id, from: j, to: cur, kind: 'push' }); }
        if (bumped) dmgUnit(R, u, 1, 'bump', ev, ctx);
        if (alive(F, u) && F.flame[u.i]) dmgUnit(R, u, 1, 'fire', ev, ctx);
      }
    } else if (id === 'click') {
      const hit = [];
      for (const u of F.units) if (hostile(u) && man(u.i, F.p) <= 2 && stunUnit(F, u)) hit.push(u.id);
      E(ev, { t: 'click', i: F.p, ids: hit });
    } else if (id === 'bomb') {
      const tiles = [i].concat(NB4[i]);
      for (const j of tiles) layDust(R, j);
      E(ev, { t: 'puff', tiles });
    } else if (id === 'beam') {
      const dx = Math.sign(tx - px), dy = Math.sign(ty - py), line = [];
      for (let x = px + dx, y = py + dy; at(x, y) >= 0; x += dx, y += dy) line.push(at(x, y));
      E(ev, { t: 'beam', tiles: line });
      for (const j of line) { const u = unitAt(F, j); if (u) dmgUnit(R, u, 2, 'beam', ev, ctx); }
      for (const j of line) if (fuel(F, j)) burn(R, j, ev, ctx);
      afterFire(R, ctx, ev);
    }
    snap(R, ev);
    return true;
  }

  function flask(R, ev) {
    const F = R.f;
    if (!F || F.over || !R.flask || R.hp >= R.mhp) return false;
    R.flask--;
    heal(R, 4, ev);
    snap(R, ev);
    return true;
  }

  /* ---------- enemies ---------- */

  function bfsPath(from, goal, pass) {
    const prev = new Array(N).fill(-2), q = [from];
    prev[from] = -1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (i !== from && goal(i)) { const p = []; for (let c = i; c !== from; c = prev[c]) p.push(c); return p.reverse(); }
      for (const j of NB4[i]) if (prev[j] === -2 && pass(j)) { prev[j] = i; q.push(j); }
    }
    return null;
  }

  function stepUnit(R, u, to, ev, kind) {
    const F = R.f, d = DEF[u.k], from = u.i;
    u.i = to;
    E(ev, { t: 'move', id: u.id, from, to, kind: kind || 'walk' });
    if (d.slime) { F.wet[from] = Math.max(F.wet[from], 3); F.dust[from] = 0; F.web[from] = 0; }
    else if (d.web && !F.wet[from]) F.web[from] = 1;
    if (F.flame[to]) { dmgUnit(R, u, 1, 'fire', ev, null); if (!alive(F, u)) return false; }
    if (F.dust[to] && has(R, 'sticky')) return false;
    return true;
  }

  function walk(R, u, path, steps, ev) {
    const F = R.f;
    for (let s = 0; s < steps && s < path.length; s++) {
      if (!alive(F, u) || F.over) return;
      if (!stepUnit(R, u, path[s], ev)) return;
    }
  }

  function moveToward(R, u, steps, ev) {
    const F = R.f;
    if (adj(u.i, F.p)) return;
    const free = j => !blocked(F, j);
    let path = bfsPath(u.i, j => adj(j, F.p), free);
    if (!path) {
      // boxed out by its own side: shuffle one step closer if it can
      path = bfsPath(u.i, j => adj(j, F.p), j => !F.rock[j] && j !== F.p);
      if (!path || !free(path[0])) return;
      path = [path[0]];
    }
    walk(R, u, path, steps, ev);
  }

  function strike(R, u, ev) {
    const F = R.f;
    let dmg = DEF[u.k].dmg;
    if (has(R, 'glitter') && F.dust[u.i]) dmg--;
    E(ev, { t: 'atk', id: u.id, to: F.p });
    if (dmg > 0) hurt(R, dmg, u, ev);
    if (has(R, 'hairs') && alive(F, u)) dmgUnit(R, u, 1, 'hairs', ev, null);
  }

  function addMark(R, u, tiles, dmg, kind, ev, extra) {
    const F = R.f;
    const m = Object.assign({ own: u.id, tiles: tiles.filter(i => !F.rock[i]), dmg, kind }, extra || {});
    F.marks.push(m);
    E(ev, { t: 'mark', id: u.id, kind, tiles: m.tiles });
    return m;
  }

  function resolveMarks(R, u, ev) {
    const F = R.f;
    const mine = F.marks.filter(m => m.own === u.id);
    if (!mine.length) return mine;
    F.marks = F.marks.filter(m => m.own !== u.id);
    for (const m of mine) {
      E(ev, { t: 'strike', kind: m.kind, tiles: m.tiles, id: u.id });
      for (const i of m.tiles) {
        const v = unitAt(F, i);
        if (v && v !== u && !DEF[v.k].boss) dmgUnit(R, v, m.dmg, 'ally', ev, null);
      }
      if (m.tiles.indexOf(F.p) >= 0) {
        hurt(R, m.dmg, u, ev);
        if (m.kind === 'web' && !has(R, 'webwalk')) F.rootNext = 1;
      }
      if (m.kind === 'web') for (const i of m.tiles) if (!F.wet[i]) F.web[i] = 1;
      if (m.kind === 'gale') for (const i of m.tiles) F.dust[i] = 0;
      if (m.kind === 'bolt') { const ctx = newCtx(); for (const i of m.tiles) if (fuel(F, i)) burn(R, i, ev, ctx); }
    }
    return mine;
  }

  function lineFrom(F, a, b) {
    const ax = a % W, ay = (a / W) | 0, dx = Math.sign(b % W - ax), dy = Math.sign(((b / W) | 0) - ay), out = [];
    for (let x = ax + dx, y = ay + dy; at(x, y) >= 0; x += dx, y += dy) out.push(at(x, y));
    return out;
  }
  const aligned = (a, b) => a !== b && (a % W === b % W || ((a / W) | 0) === ((b / W) | 0));
  /* tiles between a and b if they share a line and nothing stands between them, else 0 */
  function lineClear(F, a, b) {
    if (!aligned(a, b)) return 0;
    const ax = a % W, ay = (a / W) | 0, bx = b % W, by = (b / W) | 0, dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
    let n = 1;
    for (let x = ax + dx, y = ay + dy; x !== bx || y !== by; x += dx, y += dy, n++) { const j = at(x, y); if (F.rock[j] || unitAt(F, j)) return 0; }
    return n;
  }

  function relocate(R, u, to, ev, kind) {
    const from = u.i;
    if (from === to) return;
    u.i = to;
    E(ev, { t: 'move', id: u.id, from, to, kind: kind || 'swoop' });
  }

  function freeNear(F, i) {
    const seen = {}, q = [i];
    seen[i] = 1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (!blocked(F, c)) return c;
      for (const j of NB4[c]) if (!seen[j]) { seen[j] = 1; q.push(j); }
    }
    return -1;
  }

  function spawnUnit(R, k, i, ev) {
    const F = R.f, d = DEF[k];
    const hp = d.hp + (d.boss ? 2 * (R.ecl || 0) : 0);
    const u = { id: F.uid++, k, i, hp, mhp: hp, stun: 0, smo: 0, ph: 0, cdm: 0, rest: 0 };
    F.units.push(u);
    E(ev, { t: 'spawn', u: clone(u) });
    return u;
  }

  function summon(R, k, n, ev) {
    const F = R.f;
    if (F.units.filter(hostile).length + F.spawns.length >= 6) return 0;
    const spots = [];
    for (let i = 0; i < N; i++) if (!blocked(F, i) && man(i, F.p) >= 3 && !F.spawns.some(s => s.i === i)) spots.push(i);
    spots.sort((a, b) => man(b, F.p) - man(a, F.p) || a - b);
    let c = 0;
    for (const i of spots) { if (c >= n) break; F.spawns.push({ t: F.turn + 1, k, i }); c++; }
    if (c) E(ev, { t: 'call', k });
    return c;
  }

  function unitAct(R, u, ev) {
    const F = R.f, d = DEF[u.k];
    if (u.smo > 0) { u.smo = 0; dmgUnit(R, u, 1, 'smoulder', ev, null); if (!alive(F, u)) return; }
    if (u.stun > 0) { u.stun--; E(ev, { t: 'dazed', id: u.id }); return; }
    switch (d.ai) {
      case 'chase':
        if (adj(u.i, F.p)) strike(R, u, ev); else moveToward(R, u, d.mv, ev);
        break;
      case 'pounce':
        if (!adj(u.i, F.p)) moveToward(R, u, d.mv, ev);
        if (alive(F, u) && adj(u.i, F.p)) strike(R, u, ev);
        break;
      case 'spit': {
        resolveMarks(R, u, ev);
        if (!alive(F, u) || F.over) break;
        // no fleeing: it creeps into reach, which walks it over whatever you have left behind
        if (man(u.i, F.p) > d.rng) { moveToward(R, u, d.mv, ev); if (!alive(F, u) || F.over) break; }
        if (u.cdm > 0) { u.cdm--; break; }
        if (man(u.i, F.p) > d.rng) break;
        const p = F.p;
        let tiles = [p];
        if (d.shape === 'plus') tiles = [p].concat(NB4[p]);
        else if (d.shape === 'row') { tiles = []; for (let x = 0; x < W; x++) tiles.push(at(x, (p / W) | 0)); }
        addMark(R, u, tiles, d.dmg, d.shape === 'row' ? 'bolt' : 'acid', ev);
        u.cdm = d.cycle - 1;
        break;
      }
      case 'charge': {
        const had = F.marks.find(m => m.own === u.id);
        if (had) {
          const tiles = had.tiles.slice();
          resolveMarks(R, u, ev);
          if (alive(F, u)) {
            for (let k = tiles.length - 1; k >= 0; k--) if (!blocked(F, tiles[k])) { relocate(R, u, tiles[k], ev, 'swoop'); break; }
            u.rest = 1;
          }
        } else if (u.rest > 0) u.rest--;
        else {
          if (!aligned(u.i, F.p)) {
            const path = bfsPath(u.i, j => aligned(j, F.p), j => !blocked(F, j));
            if (path) walk(R, u, path, d.mv, ev);
          }
          if (alive(F, u) && aligned(u.i, F.p)) addMark(R, u, lineFrom(F, u.i, F.p), d.dmg, 'swoop', ev);
        }
        break;
      }
      case 'toad': {
        const n = lineClear(F, u.i, F.p);
        if (n >= 1 && n <= 3) {
          if (n > 1) {
            const to = at(u.i % W + Math.sign(F.p % W - u.i % W), ((u.i / W) | 0) + Math.sign(((F.p / W) | 0) - ((u.i / W) | 0)));
            E(ev, { t: 'pull', from: F.p, to, by: u.id });
            F.p = to;
          }
          strike(R, u, ev);
        } else moveToward(R, u, d.mv, ev);
        break;
      }
      case 'weaver': {
        resolveMarks(R, u, ev);
        if (!alive(F, u) || F.over) break;
        const ph = u.ph % 3;
        if (ph === 0) addMark(R, u, [F.p].concat(NB4[F.p]), 1, 'web', ev);
        else if (ph === 1 || F.units.length >= 7) {
          moveToward(R, u, d.mv, ev);
          if (alive(F, u) && adj(u.i, F.p)) strike(R, u, ev);
        } else {
          let c = 0;
          for (const j of NB8[u.i]) {
            if (c >= 2) break;
            if (!blocked(F, j) && !F.spawns.some(s => s.i === j)) { F.spawns.push({ t: F.turn + 1, k: 'spiderling', i: j }); c++; }
          }
          E(ev, { t: 'call', k: 'spiderling' });
        }
        u.ph++;
        break;
      }
      case 'lamp': {
        resolveMarks(R, u, ev);
        if (!alive(F, u) || F.over) break;
        if (adj(u.i, F.p)) { E(ev, { t: 'atk', id: u.id, to: F.p }); hurt(R, 2, u, ev); if (F.over) break; }
        const ph = u.ph % 4;
        if (ph % 2 === 0) { const t = []; for (let i = 0; i < N; i++) if (aligned(i, u.i)) t.push(i); addMark(R, u, t, 3, 'zap', ev); }
        else { const t = []; for (let i = 0; i < N; i++) if (i !== u.i && man(i, u.i) <= 2) t.push(i); addMark(R, u, t, 2, 'zap', ev); summon(R, ph === 1 ? 'lfly' : 'wasp', 2, ev); }
        u.ph++;
        break;
      }
      case 'hush': {
        const stoop = F.marks.find(m => m.own === u.id && m.kind === 'stoop');
        resolveMarks(R, u, ev);
        if (!alive(F, u) || F.over) break;
        if (stoop) {
          let dest = blocked(F, stoop.c) ? -1 : stoop.c;
          if (dest < 0) { for (const j of NB8[stoop.c]) if (!blocked(F, j)) { dest = j; break; } }
          if (dest >= 0) relocate(R, u, dest, ev, 'swoop');
        }
        const ph = u.ph % 3;
        if (ph === 0) addMark(R, u, [F.p].concat(NB8[F.p]), 3, 'stoop', ev, { c: F.p });
        else if (ph === 1) {
          const py = (F.p / W) | 0, t = [];
          for (let y = py - 1; y <= py + 1; y++) for (let x = 0; x < W; x++) if (at(x, y) >= 0) t.push(at(x, y));
          addMark(R, u, t, 1, 'gale', ev);
        } else {
          summon(R, 'shade', 1, ev);
          moveToward(R, u, d.mv, ev);
          if (alive(F, u) && adj(u.i, F.p)) strike(R, u, ev);
        }
        u.ph++;
        break;
      }
    }
  }

  function pullPlayer(R, lamp, ev) {
    const F = R.f;
    if (man(F.p, lamp.i) <= 1) return;
    const px = F.p % W, py = (F.p / W) | 0, lx = lamp.i % W, ly = (lamp.i / W) | 0;
    const dx = Math.sign(lx - px), dy = Math.sign(ly - py);
    const cand = Math.abs(lx - px) >= Math.abs(ly - py) ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
    for (const c of cand) {
      if (!c[0] && !c[1]) continue;
      const j = at(px + c[0], py + c[1]);
      if (j >= 0 && !blocked(F, j)) { E(ev, { t: 'pull', from: F.p, to: j, by: lamp.id }); F.p = j; arrive(R, ev); return; }
    }
  }

  function endTurn(R, ev) {
    const F = R.f;
    if (!F || F.over) return false;
    const carry = has(R, 'thrift') ? Math.min(1, F.e) : 0;
    F.e = 0; F.root = 0;
    E(ev, { t: 'phase', who: 'enemy' });
    const marked = u => (F.marks.some(m => m.own === u.id) ? 1 : 0);
    const order = F.units.filter(hostile).sort((a, b) => (marked(b) - marked(a)) || (man(a.i, F.p) - man(b.i, F.p)) || (a.id - b.id));
    for (const u of order) {
      if (F.over) break;
      if (!alive(F, u)) continue;
      unitAct(R, u, ev);
      snap(R, ev);
    }
    if (!F.over && F.spawns.length) {
      const none = !F.units.some(hostile);
      const tmin = Math.min.apply(null, F.spawns.map(s => s.t));
      const due = F.spawns.filter(s => s.t <= F.turn || (none && s.t === tmin));
      F.spawns = F.spawns.filter(s => due.indexOf(s) < 0);
      for (const s of due) { const i = freeNear(F, s.i); if (i >= 0) spawnUnit(R, s.k, i, ev); }
    }
    if (!F.over) {
      const lamp = F.units.find(u => DEF[u.k].pull);
      if (lamp) { pullPlayer(R, lamp, ev); pullPlayer(R, lamp, ev); }
      checkWin(R, ev);
    }
    if (F.over) { snap(R, ev); return true; }
    for (let i = 0; i < N; i++) { if (F.wet[i] > 0 && F.wet[i] < 90) F.wet[i]--; F.flame[i] = 0; }
    F.turn++;
    F.e = R.emax + carry;
    F.used.kind = 0;
    for (const k in F.cd) if (F.cd[k] > 0) F.cd[k]--;
    if (F.rootNext) { F.root = 1; F.rootNext = 0; }
    snap(R, ev);
    E(ev, { t: 'phase', who: 'you', turn: F.turn });
    return true;
  }

  /* ---------- generic action plumbing (ui, forecasts, bots) ---------- */

  function apply(R, a, ev) {
    switch (a[0]) {
      case 'move': return move(R, a[1], ev);
      case 'spark': return spark(R, a[1], ev);
      case 'abil': return useAbil(R, a[1], a[2], ev);
      case 'flask': return flask(R, ev);
      case 'end': return endTurn(R, ev);
    }
    return false;
  }
  function legalActions(R) {
    const out = [];
    for (const i of moveTargets(R)) out.push(['move', i]);
    for (const i of sparkTargets(R)) out.push(['spark', i]);
    for (const id of R.abil) for (const i of abilTargets(R, id)) out.push(['abil', id, i]);
    return out;
  }
  /* What happens if you (optionally do `pre` and then) end the turn right now. Deterministic, so this is exact. */
  function forecast(R, pre) {
    const c = clone(R), ev = [];
    const hp0 = c.hp;
    if (pre) for (const a of pre) apply(c, a, ev);
    endTurn(c, ev);
    return {
      dmg: Math.max(0, hp0 - c.hp), dead: c.f.over === -1, win: c.f.over === 1, p: c.f.p,
      units: c.f.units.map(u => ({ id: u.id, i: u.i })),
      hits: ev.filter(e => e.t === 'hurt' && e.by).map(e => e.by),
    };
  }

  /* ---------- fights ---------- */

  function connected(F) {
    const seen = {}, q = [F.p];
    seen[F.p] = 1;
    let open = 0;
    for (let i = 0; i < N; i++) if (!F.rock[i]) open++;
    for (let h = 0; h < q.length; h++) for (const j of NB4[q[h]]) if (!seen[j] && !F.rock[j]) { seen[j] = 1; q.push(j); }
    return q.length === open;
  }

  function genFight(R, node) {
    const z = ZONES[R.zone];
    const F = { rock: zeros(), litter: zeros(), web: zeros(), wet: zeros(), dust: zeros(), flame: zeros(), marks: [], units: [], spawns: [],
      p: at(2 + ri(R, 2), H - 1), e: 0, turn: 1, seq: 0, uid: 1, cd: {}, used: {}, root: 0, rootNext: 0, over: 0, taken: 0, kind: node.type, remains: -1 };
    R.f = F;
    const boss = node.type === 'boss', comp = node.comp.slice();
    const keep = {};
    keep[F.p] = 1;
    for (const j of NB8[F.p]) keep[j] = 1;
    let lampAt = -1;
    if (comp[0] === 'lamp') { lampAt = at(2 + ri(R, 2), 3); keep[lampAt] = 1; for (const j of NB8[lampAt]) keep[j] = 1; }

    let nr = boss ? ri(R, 2) : z.rocks[0] + ri(R, z.rocks[1] - z.rocks[0] + 1);
    for (let tries = 0; nr > 0 && tries < 80; tries++) {
      const i = at(ri(R, W), 1 + ri(R, H - 3));
      if (F.rock[i] || keep[i]) continue;
      F.rock[i] = 1;
      if (!connected(F)) { F.rock[i] = 0; continue; }
      nr--;
    }
    // leaf litter: natural fuel, in a couple of ragged patches
    for (let c = 2 + ri(R, 2); c > 0; c--) {
      let i = at(ri(R, W), 1 + ri(R, 4));
      for (let k = 2 + ri(R, 3); k > 0; k--) {
        if (!F.rock[i] && i !== lampAt) F.litter[i] = 1;
        const nx = NB4[i].filter(j => !F.rock[j] && ((j / W) | 0) >= 1 && ((j / W) | 0) <= 5);
        if (!nx.length) break;
        i = pick(R, nx);
      }
    }
    for (let c = ri(R, z.dew + 1), tries = 0; c > 0 && tries < 30; tries++) {
      const i = at(ri(R, W), 1 + ri(R, 5));
      if (F.rock[i] || F.litter[i] || keep[i] || F.wet[i]) continue;
      F.wet[i] = 99; c--;
    }

    // enemies gather at the far end; anything past five waits a turn in the wings
    const spots = [];
    for (let i = 0; i < W * 3; i++) if (!F.rock[i] && !F.wet[i] && i !== lampAt) spots.push(i);
    shuffle(R, spots);
    if (lampAt >= 0) { spawnUnit(R, comp.shift(), lampAt, null); }
    else if (boss) { const b = at(2 + ri(R, 2), 1); F.rock[b] = 0; spawnUnit(R, comp.shift(), b, null); const k = spots.indexOf(b); if (k >= 0) spots.splice(k, 1); }
    let placed = 0;
    for (const k of comp) {
      if (!spots.length) break;
      const i = spots.pop();
      if (placed < 5) { spawnUnit(R, k, i, null); placed++; }
      else F.spawns.push({ t: 2, k, i });
    }
    for (let c = ri(R, z.puff + 1), tries = 0; c > 0 && tries < 30; tries++) {
      const i = at(ri(R, W), 2 + ri(R, 3));
      if (blocked(F, i) || keep[i] || F.wet[i]) continue;
      spawnUnit(R, 'puff', i, null); c--;
    }
    if (R.rem && R.rem.zone === R.zone && R.rem.step === R.step) {
      for (let tries = 0; tries < 40; tries++) {
        const i = at(ri(R, W), 3 + ri(R, 3));
        if (blocked(F, i) || F.wet[i]) continue;
        F.remains = i; break;
      }
    }
    if (R.trails) { const x = F.p % W; for (let k = 1; k <= 3; k++) layDust(R, at(x, H - 1 - k)); }
    F.e = R.emax + (has(R, 'dawn') ? 2 : 0) + (R.firstE || 0);
    return F;
  }

  /* ---------- the flight (run) ---------- */

  function compose(R, z, b) {
    const out = [];
    for (let guard = 0; b > 0 && out.length < 7 && guard < 80; guard++) {
      const k = pick(R, z.pool), c = DEF[k].cost;
      if (c > b) continue;
      if (out.filter(x => x === k).length >= (c === 1 ? 4 : 2)) continue;
      out.push(k); b -= c;
    }
    return out;
  }
  function fightNode(R, b, hard) {
    const z = ZONES[R.zone];
    return { type: 'fight', hard: hard ? 1 : 0, comp: compose(R, z, b + (hard ? 3 : 0) + (R.ecl || 0)) };
  }

  function makeChoices(R) {
    const z = ZONES[R.zone], s = R.step;
    let ch;
    if (s === 0) ch = [R.first && R.zone === 0 ? { type: 'fight', hard: 0, comp: ['ant', 'ant', 'beetle'] } : fightNode(R, z.budget[0])];
    else if (s === 1) {
      ch = [fightNode(R, z.budget[1])];
      const left = Object.keys(EVENTS).filter(k => k !== 'rest' && R.seen.indexOf(k) < 0);
      if (rnd(R) < 0.5 || !left.length) ch.push(fightNode(R, z.budget[1], 1));
      else ch.push({ type: 'event', id: pick(R, left) });
    } else if (s === 2) {
      const comp = z.elite.slice();
      for (let k = 0; k < (R.ecl || 0); k++) comp.push(z.pool[0]);
      ch = [{ type: 'elite', comp }, { type: 'rest' }];
      if (rnd(R) < 0.6) ch.unshift(fightNode(R, z.budget[2]));
    } else ch = [{ type: 'boss', comp: z.boss.slice() }];
    R.choices = ch;
    R.phase = 'path';
  }

  function choose(R, idx) {
    const c = R.phase === 'path' && R.choices && R.choices[idx];
    if (!c) return false;
    R.node = c; R.choices = null;
    if (c.type === 'rest' || c.type === 'event') {
      R.event = c.type === 'rest' ? 'rest' : c.id;
      if (c.id) R.seen.push(c.id);
      R.phase = 'event';
    } else { genFight(R, c); R.phase = 'fight'; }
    return true;
  }

  function advance(R) {
    R.reward = null; R.event = null; R.node = null; R.f = null;
    R.step++;
    if (R.step > 3) { R.zone++; R.step = 0; }
    if (R.zone >= ZONES.length) { R.phase = 'won'; return; }
    makeChoices(R);
  }

  function abilCount(R) { return R.abil.length - 1; }
  function allowed(R, id) { return !(BOON[id].abil && abilCount(R) >= 2); }
  function gainBoon(R, id) {
    if (!BOON[id] || has(R, id)) return false;
    R.boons.push(id);
    if (GAIN[id]) GAIN[id](R);
    if (BOON[id].abil) R.abil.push(BOON[id].abil);
    return true;
  }
  /* q: 0 ordinary, 1 good, 2 rare-leaning */
  function rollBoons(R, n, q) {
    const wt = [[62, 30, 8], [30, 48, 22], [0, 55, 45]][q || 0];
    const pool = Object.keys(BOON).filter(id => !has(R, id) && allowed(R, id));
    const out = [];
    while (out.length < n && pool.length) {
      let tot = 0;
      for (const id of pool) tot += wt[BOON[id].r];
      if (tot <= 0) break;
      let x = rnd(R) * tot, got = pool[pool.length - 1];
      for (const id of pool) { x -= wt[BOON[id].r]; if (x < 0) { got = id; break; } }
      out.push(got);
      pool.splice(pool.indexOf(got), 1);
    }
    return out;
  }

  function afterFight(R) {
    const F = R.f, node = R.node || {};
    if (!F || F.over !== 1) return false;
    R.stats.fights++;
    let md = node.type === 'boss' ? 10 : node.type === 'elite' ? 6 : 3;
    if (node.hard) md += 2;
    const flawless = F.taken === 0;
    if (flawless) { md += 1; R.stats.flawless++; }
    if (has(R, 'glean')) md += 1;
    R.md += md;
    let healed = 0;
    if (node.type === 'boss') { healed += heal(R, 4); R.stats.bosses.push(ZONES[R.zone].boss[0]); }
    if (has(R, 'sip')) healed += heal(R, 1);
    R.f = null;
    if (node.type === 'boss' && R.zone === ZONES.length - 1) { R.zone++; R.step = 0; R.phase = 'won'; return true; }
    const q = node.type === 'boss' ? 2 : (node.type === 'elite' || node.hard) ? 1 : 0;
    R.reward = { boons: rollBoons(R, 3, q), q, md, healed, flawless, kind: node.type };
    R.phase = 'reward';
    return true;
  }
  function takeReward(R, idx) {
    const rw = R.reward;
    if (!rw || R.phase !== 'reward') return false;
    if (idx >= 0) { if (!rw.boons[idx]) return false; gainBoon(R, rw.boons[idx]); }
    else heal(R, 1);
    if (rw.first) { R.reward = null; makeChoices(R); } else advance(R);
    return true;
  }
  function reroll(R) {
    const rw = R.reward;
    if (!rw || R.rerolls <= 0) return false;
    R.rerolls--;
    rw.boons = rollBoons(R, 3, rw.q || 0);
    return true;
  }
  function eventChoose(R, idx) {
    const e = EVENTS[R.event], o = e && e.opts[idx];
    if (!o || R.phase !== 'event') return false;
    if (o.hp < 0 && R.hp <= -o.hp) return false;
    if (o.mhp) R.mhp += o.mhp;
    if (o.hp > 0) heal(R, o.hp); else if (o.hp < 0) R.hp += o.hp;
    if (o.cap) R.cap += o.cap;
    if (o.md) R.md += o.md;
    if (o.pick != null) { R.event = null; R.reward = { boons: rollBoons(R, 3, o.pick), q: o.pick, md: 0, healed: 0, kind: 'event' }; R.phase = 'reward'; return true; }
    advance(R);
    return true;
  }
  function die(R) { R.phase = 'dead'; return true; }

  /* ---------- the brood (what persists) ---------- */

  function newMeta() {
    return { v: 1, dust: 0, gen: 1, upg: {}, scales: [], species: 'luna', unlocked: { luna: 1 },
      stats: { runs: 0, wins: 0, deaths: 0, best: 0, kills: {} }, annals: [], last: null, ecl: 0, maxEcl: 0, seen: {},
      opt: { fast: 0, sound: 1, foresight: 1 } };
  }
  const slots = M => 1 + rank(M, 'span');
  function canBuy(M, id) { const u = UPG[id], r = rank(M, id); return !!u && r < u.cost.length && M.dust >= u.cost[r]; }
  function buy(M, id) { if (!canBuy(M, id)) return false; M.dust -= UPG[id].cost[rank(M, id)]; M.upg[id] = rank(M, id) + 1; return true; }
  function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  function startRun(M, seed) {
    const sp = SPECIES[M.species] || SPECIES.luna;
    const R = { v: 1, rng: (seed >>> 0) || 1, species: SPECIES[M.species] ? M.species : 'luna', name: '', gen: M.gen,
      hp: 0, mhp: sp.hp + rank(M, 'jelly'), emax: sp.e, cap: sp.cap + rank(M, 'glands'), burn: 2, singe: 0, flitR: sp.flitR, heat: sp.heat || 0,
      boons: [], abil: ['flit'].concat(sp.abil || []), zone: 0, step: 0, phase: 'path', choices: null, reward: null, event: null, node: null, f: null,
      md: 0, seen: [], stats: { kills: {}, fights: 0, flawless: 0, best: 0, fuse: 0, bosses: [] },
      revive: rank(M, 'chrysalis'), flask: rank(M, 'flask'), rerolls: rank(M, 'scouts'), kindling: rank(M, 'keeper'), firstE: rank(M, 'dawn'),
      trails: rank(M, 'trails'), remHeal: rank(M, 'remember'), ecl: M.ecl || 0, first: M.stats.runs === 0 ? 1 : 0,
      rem: M.last ? clone(M.last) : null, cause: null, inherited: [] };
    R.name = NAMES[(ri(R, NAMES.length) + M.gen) % NAMES.length];
    for (const b of M.scales.slice(0, slots(M))) if (b && gainBoon(R, b)) R.inherited.push(b);
    R.hp = R.mhp;
    if (rank(M, 'sendoff')) { R.reward = { boons: rollBoons(R, 3, 0), q: 0, md: 0, healed: 0, kind: 'sendoff', first: 1 }; R.phase = 'reward'; }
    else makeChoices(R);
    return R;
  }

  /* Bank a finished flight into the brood. Call once, when the run reaches 'dead' or 'won'. */
  function endRun(M, R) {
    const won = R.phase === 'won';
    let md = R.md + (won ? 20 : 0);
    md = Math.round(md * (1 + 0.25 * rank(M, 'gleaners')) * (1 + 0.2 * (R.ecl || 0)));
    M.dust += md;
    M.stats.runs++;
    if (won) M.stats.wins++; else M.stats.deaths++;
    for (const k in R.stats.kills) M.stats.kills[k] = (M.stats.kills[k] || 0) + R.stats.kills[k];
    const reach = Math.min(12, R.zone * 4 + R.step);
    M.stats.best = Math.max(M.stats.best, reach);
    const z = ZONES[Math.min(R.zone, ZONES.length - 1)];
    const rec = { name: R.name, gen: R.gen, species: R.species, zone: z.n, won: won ? 1 : 0, cause: R.cause, boons: R.boons.slice(), md, ecl: R.ecl || 0 };
    M.annals.unshift(rec);
    if (M.annals.length > 24) M.annals.length = 24;
    M.last = won ? null : { zone: R.zone, step: R.step, boons: R.boons.filter(b => M.scales.indexOf(b) < 0), name: R.name };
    M.gen++;
    const news = [];
    const unlock = id => { if (!M.unlocked[id]) { M.unlocked[id] = 1; news.push(id); } };
    if (R.stats.bosses.indexOf('weaver') >= 0) unlock('tiger');
    if (R.stats.bosses.indexOf('lamp') >= 0) unlock('hawk');
    if (M.stats.deaths >= 3) unlock('ghost');
    if (won) M.maxEcl = Math.max(M.maxEcl, Math.min(8, (R.ecl || 0) + 1));
    return { md, won, rec, news, reach };
  }
  /* One scale per generation: press boon `id` into lineage slot `slot`. */
  function inherit(M, id, slot) {
    if (!BOON[id] || slot < 0 || slot >= slots(M)) return false;
    const at0 = M.scales.indexOf(id);
    if (at0 >= 0 && at0 !== slot) return false;
    while (M.scales.length < slot) M.scales.push(null);
    M.scales[slot] = id;
    return true;
  }

  const API = { W, H, N, DIR, NB4, NB8, xy, at, man, adj, clone,
    DEF, BOON, RARITY, ABIL, SPECIES, UPG, ZONES, EVENTS,
    has, unitAt, hostile, fuel, dustCount, rank, slots, ordinal, biters,
    moveTargets, moveCost, move, sparkTargets, burnPreview, spark, abilReady, abilCost, abilTargets, useAbil, flask, endTurn,
    apply, legalActions, forecast,
    genFight, makeChoices, choose, afterFight, takeReward, reroll, eventChoose, die, gainBoon, rollBoons,
    newMeta, canBuy, buy, startRun, endRun, inherit };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.MW = API;
})(typeof self !== 'undefined' ? self : this);
