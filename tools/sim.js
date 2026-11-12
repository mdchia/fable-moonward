/* Headless balance sim for Moonward.
   A search bot plays whole flights against the real rules in core.js.
   Usage:  node tools/sim.js fresh 200      - 200 first-ever flights (no upgrades)
           node tools/sim.js career 12 25   - 12 broods of 25 generations each, buying upgrades as they go
   The bot is exhaustive within a turn and blind beyond it, so read its numbers as a floor for a careful human. */
'use strict';
const C = require('../core.js');

const hpSum = R => R.f.units.reduce((s, u) => s + (C.hostile(u) ? u.hp : 0), 0);
const cnt = R => R.f.units.filter(C.hostile).length;

function potential(R) {
  const F = R.f, e = F.e;
  let best = 0;
  F.e = Math.max(1, e);
  for (const t of C.sparkTargets(R)) {
    const pv = C.burnPreview(R, t);
    let n = 0;
    for (const i of pv.tiles) { const u = C.unitAt(F, i); if (u && C.hostile(u)) n += Math.min(u.hp, pv.dmg); }
    if (n > best) best = n;
  }
  F.e = e;
  return best;
}

function score(c, b) {
  if (c.f.over === -1) return -1e6;
  let s = -(b.hp - c.hp) * 50 + (hpSum(b) - hpSum(c)) * 12 + (cnt(b) - cnt(c)) * 18;
  if (c.f.over === 1) return s + 500;
  s += potential(c) * 7;
  s += C.NB4[c.f.p].filter(j => !c.f.rock[j] && !C.unitAt(c.f, j)).length * 1.5;
  s += C.dustCount(c.f) * 0.6;
  return s;
}

const key = S => {
  const F = S.f;
  return F.p + '|' + F.e + '|' + S.hp + '|' + F.dust.map(d => (d ? 1 : 0)).join('') + '|' + F.web.join('') + F.litter.join('') + '|' +
    F.units.map(u => u.id + ':' + u.i + ':' + u.hp + ':' + u.stun).join(',') + '|' + JSON.stringify(F.cd);
};

function plan(R) {
  let best = { s: -Infinity, seq: [] };
  const seen = new Set();
  let nodes = 0;
  (function rec(S, seq, depth) {
    const k = key(S);
    if (seen.has(k)) return;
    seen.add(k);
    if (S.f.over === 1) { const v = 1e5 - depth; if (v > best.s) best = { s: v, seq }; return; }
    if (S.f.over === -1) return;
    const c = C.clone(S);
    C.endTurn(c, null);
    const sc = score(c, R) - depth * 0.01;
    if (sc > best.s) best = { s: sc, seq };
    if (depth >= 7 || ++nodes > 2500) return;
    for (const a of C.legalActions(S)) {
      if (a[0] === 'abil' && a[1] === 'bomb') {
        const u = C.unitAt(S.f, a[2]);
        if (!u || !C.hostile(u)) continue;
      }
      const n = C.clone(S), h0 = hpSum(n), k0 = cnt(n);
      C.apply(n, a, null);
      if ((a[0] === 'spark' || a[1] === 'beam') && hpSum(n) === h0 && cnt(n) === k0) continue;
      rec(n, seq.concat([a]), depth + 1);
    }
  })(R, [], 0);
  return best.seq;
}

const BOON_PREF = { tinder: 9, swift: 10, flash: 9, wildfire: 8, chrys: 7, beam: 6, kindled: 7, linger: 5, far: 6, sticky: 6, eyespots: 6, slip: 6,
  leap: 5, backdraft: 4, feast: 3, gust: 3, bomb: 5, longfuse: 4, smoulder: 5, ember: 5, heavy: 3, glitter: 3, dawn: 4, feather: 3, updraft: 2,
  thrift: 3, webwalk: 1, fur: 5, sip: 4, hairs: 3, glean: 1 };

function playRun(M, seed, log) {
  const R = C.startRun(M, seed);
  for (let guard = 0; guard < 400; guard++) {
    if (R.phase === 'path') {
      const ch = R.choices;
      let idx = 0;
      const frac = R.hp / R.mhp;
      const find = t => ch.findIndex(c => c.type === t);
      if (find('rest') >= 0 && frac <= 0.6) idx = find('rest');
      else if (find('event') >= 0) idx = find('event');
      else if (find('elite') >= 0 && frac >= 0.75) idx = find('elite');
      else if (find('rest') >= 0 && ch.length === 2) idx = frac >= 0.75 ? find('elite') : find('rest');
      else idx = ch.findIndex(c => c.type === 'fight' && !c.hard);
      if (idx < 0) idx = 0;
      C.choose(R, idx);
    } else if (R.phase === 'event') {
      const e = C.EVENTS[R.event];
      let idx = e.opts.findIndex(o => o.hp > 0);
      if (R.hp / R.mhp > 0.7 || idx < 0) idx = e.opts.findIndex(o => !(o.hp > 0) && !(o.hp < 0 && R.hp <= 3));
      if (idx < 0) idx = 0;
      if (!C.eventChoose(R, idx)) C.eventChoose(R, 1 - idx);
    } else if (R.phase === 'reward') {
      const b = R.reward.boons;
      let idx = -1, bs = 0;
      b.forEach((id, i) => { const v = BOON_PREF[id] || 1; if (v > bs) { bs = v; idx = i; } });
      C.takeReward(R, idx);
    } else if (R.phase === 'fight') {
      const node = R.node, hp0 = R.hp;
      let turns = 0;
      while (!R.f.over && turns < 45) {
        for (const a of plan(R)) C.apply(R, a, null);
        if (R.flask && R.hp <= R.mhp - 4) C.flask(R, null);
        if (!R.f.over) C.endTurn(R, null);
        turns++;
      }
      const label = node.type + (node.hard ? '+' : '') + ' z' + (R.zone + 1);
      const st = log.fights[label] || (log.fights[label] = { n: 0, loss: 0, turns: 0, dead: 0, stall: 0 });
      st.n++; st.loss += hp0 - R.hp; st.turns += turns;
      if (R.f.over === 1) C.afterFight(R);
      else {
        if (!R.f.over) { st.stall++; R.cause = 'stall'; }
        st.dead++;
        log.causes[R.cause] = (log.causes[R.cause] || 0) + 1;
        C.die(R);
      }
    } else break;
  }
  return R;
}

function tend(M, R) {
  // pass down the best new scale, then spend moondust cheapest-first
  const sl = C.slots(M);
  const fresh = R.boons.filter(b => M.scales.indexOf(b) < 0).sort((a, b) => (BOON_PREF[b] || 0) - (BOON_PREF[a] || 0));
  if (fresh.length) {
    let slot = M.scales.length < sl ? M.scales.length : -1;
    if (slot < 0) {
      let worst = 0;
      for (let i = 1; i < sl; i++) if ((BOON_PREF[M.scales[i]] || 0) < (BOON_PREF[M.scales[worst]] || 0)) worst = i;
      if ((BOON_PREF[fresh[0]] || 0) > (BOON_PREF[M.scales[worst]] || 0)) slot = worst;
    }
    if (slot >= 0) C.inherit(M, fresh[0], slot);
  }
  for (;;) {
    const can = Object.keys(C.UPG).filter(id => C.canBuy(M, id)).sort((a, b) => C.UPG[a].cost[C.rank(M, a)] - C.UPG[b].cost[C.rank(M, b)]);
    if (!can.length) break;
    C.buy(M, can[0]);
  }
  for (const s of ['tiger', 'hawk', 'ghost']) if (M.unlocked[s] && process.env.SPECIES === s) M.species = s;
}

function report(title, runs, log) {
  const n = runs.length, wins = runs.filter(r => r.phase === 'won').length;
  const reach = new Array(13).fill(0);
  for (const r of runs) reach[Math.min(12, r.zone * 4 + r.step)]++;
  console.log('\n== ' + title + ' ==');
  console.log('flights ' + n + '   wins ' + wins + ' (' + (100 * wins / n).toFixed(1) + '%)   avg moondust ' + (runs.reduce((s, r) => s + r.md, 0) / n).toFixed(1));
  console.log('ended at  ' + reach.map((c, i) => 'z' + (1 + (i >> 2)) + '.' + (i & 3) + ':' + c).filter((_, i) => reach[i]).join('  '));
  if (log) {
    console.log('fight                n   hp lost  turns  deaths  stalls');
    for (const k of Object.keys(log.fights).sort((a, b) => a.slice(-2).localeCompare(b.slice(-2)) || a.localeCompare(b))) {
      const f = log.fights[k];
      console.log(k.padEnd(18) + String(f.n).padStart(4) + (f.loss / f.n).toFixed(2).padStart(9) + (f.turns / f.n).toFixed(1).padStart(7) +
        ((100 * f.dead / f.n).toFixed(0) + '%').padStart(8) + String(f.stall).padStart(8));
    }
    console.log('killed by: ' + Object.entries(log.causes).sort((a, b) => b[1] - a[1]).map(e => e[0] + ' ' + e[1]).join(', '));
  }
}

const mode = process.argv[2] || 'fresh';
const t0 = Date.now();
if (mode === 'fresh') {
  const n = +process.argv[3] || 100, log = { fights: {}, causes: {} }, runs = [];
  for (let i = 0; i < n; i++) {
    const M = C.newMeta();
    M.stats.runs = 1; // skip the scripted first fight
    if (process.env.SPECIES) M.species = process.env.SPECIES;
    runs.push(playRun(M, 1000 + i * 7919, log));
  }
  report('fresh broods, no upgrades' + (process.env.SPECIES ? ' (' + process.env.SPECIES + ')' : ''), runs, log);
} else {
  const broods = +process.argv[3] || 8, gens = +process.argv[4] || 20;
  const byGen = [];
  for (let g = 0; g < gens; g++) byGen.push([]);
  const log = { fights: {}, causes: {} };
  let firstWin = [];
  for (let b = 0; b < broods; b++) {
    const M = C.newMeta();
    let won = -1;
    for (let g = 0; g < gens; g++) {
      const R = playRun(M, 5000 + b * 104729 + g * 7919, log);
      C.endRun(M, R);
      if (R.phase === 'won' && won < 0) won = g + 1;
      tend(M, R);
      byGen[g].push(R);
    }
    firstWin.push(won);
  }
  for (let g = 0; g < gens; g += 5) report('generations ' + (g + 1) + '-' + Math.min(gens, g + 5), [].concat.apply([], byGen.slice(g, g + 5)), null);
  report('all generations', [].concat.apply([], byGen), log);
  console.log('first win at generation: ' + firstWin.join(', '));
}
console.log('\n(' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
