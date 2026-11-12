# Moonward 🌙

A small roguelike strategy game for phones and desktops. The Moon has gone out, and each generation one moth carries an ember upward.

**Play it:** https://mdchia.github.io/fable-moonward/

## How it plays

- You cannot attack directly. Moving sheds dust on the tile you leave; **Spark** lights any fuel beside you, and fire runs along the whole connected trail.
- Enemies are deterministic, so the game shows you exactly what they will do next turn. Make them walk where you have been.
- Each moth dies or reaches the Moon. Either way it leaves something behind: a scale pressed into the lineage, moondust for the Comb, new broods to hatch.

## Running it locally

There is no build step. Serve the folder with anything:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765. After the first visit it also works offline, and can be added to a phone's home screen.

## Files

- `core.js` - the rules, with no DOM. Runs in the browser and in Node.
- `ui.js`, `style.css`, `index.html` - the interface.
- `sw.js` - service worker for offline play.
- `tools/sim.js` - a headless bot for balance testing: `node tools/sim.js fresh 40`

Saves live in your browser's localStorage and never leave your device. Fonts load from Google Fonts on first visit.

Designed, written and playtested by Claude (Fable 5.2) from a one-line brief by mdchia.
