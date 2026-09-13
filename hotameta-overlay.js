/*!
 * hotameta-overlay.js — the boilerplate every HotA overlay ends up writing.
 * MIT. No dependencies. Browser (incl. OBS browser source) or Node 18+.
 *
 *   const ov = hotameta.watch('YourHotAName', {
 *     onGame(game)    { renderYourBar(game); },   // called only on real changes
 *     onIdle()        { hideYourBar(); },        // no live game right now
 *   });
 *
 * Everything below the callback is handled for you: one held SSE connection
 * (never poll), snapshot/delta reconciliation, reconnect with backoff, stall
 * detection, and restart-aware change detection.
 *
 * API reference: https://hotameta.com/api-docs
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.hotameta = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BASE = 'https://hotameta.com';
  const ART = BASE + '/static/img';

  // Keepalives arrive at least every ~15s. Nothing for this long means the
  // connection is wedged in a way EventSource will not notice by itself
  // (a proxy holding a dead socket open, a laptop resuming from sleep).
  const STALL_MS = 45000;

  /* ── Art URLs ───────────────────────────────────────────────────────────
   * Use these instead of building /static/ paths by hand: if the layout
   * ever changes, this file changes with it and your overlay keeps working.
   * Every image 404s silently, so pass the result straight to an <img>. */
  const art = {
    flag: (colorName) => `${ART}/flags/${encodeURIComponent(colorName)}_flag.png`,
    town: (factionName) => `${ART}/towns/${encodeURIComponent(factionName)}.png`,
    hero: (heroName) => `${ART}/heroes/Hero_${encodeURIComponent(heroName)}.png`,
    heroSmall: (heroName) => `${ART}/heroes/Hero_${encodeURIComponent(heroName)}_small.png`,
  };

  /* A game is "the same game, changed" when its picks move — which is what a
   * restart does. Comparing the whole object would re-render on every
   * heartbeat field; comparing only names would miss a re-pick. */
  function fingerprint(g) {
    if (!g) return '';
    const p = g.picks;
    if (!p) return `${g.p1_id}|${g.p1_name}|${g.p2_name}|nopicks`;
    const side = (s) => (s ? `${s.color}/${s.faction}/${s.hero_id}/${s.trade}` : '-');
    return [g.p1_id, g.p1_name, g.p2_name, p.template, p.restarts,
            side(p.p1), side(p.p2)].join('|');
  }

  /**
   * Watch one player (or several) and get a callback when their game changes.
   *
   * opts.onGame(game)  — a live game started or changed (restart, re-pick…)
   * opts.onIdle()      — that player has no live game right now
   * opts.onToday(t)    — today's W/L + rating, refreshed after each game ends
   * opts.onStatus(s)   — 'live' | 'reconnecting' (for a status dot, optional)
   *
   * Returns { close() }.
   */
  function watch(players, opts) {
    const names = Array.isArray(players) ? players : [players];
    const primary = names[0];
    const o = opts || {};
    const url = `${BASE}/api/lobby/stream?players=${encodeURIComponent(names.join(','))}`;

    const games = new Map();      // p1_id -> game
    let shown = '';               // fingerprint of what the caller last saw
    let es = null, stallTimer = null, retryMs = 2000, closed = false;

    const status = (s) => { if (o.onStatus) o.onStatus(s); };

    function emit() {
      // The caller asked about specific players; surface the first game that
      // actually involves one of them.
      const wanted = names.map((n) => n.toLowerCase());
      const mine = [...games.values()].find((g) =>
        wanted.includes((g.p1_name || '').toLowerCase()) ||
        wanted.includes((g.p2_name || '').toLowerCase()));
      const fp = fingerprint(mine);
      if (fp === shown) return;            // nothing a renderer would notice
      shown = fp;
      if (mine) { if (o.onGame) o.onGame(mine); }
      else if (o.onIdle) o.onIdle();
    }

    async function refreshToday() {
      if (!o.onToday || !primary) return;
      try {
        const res = await fetch(`${BASE}/api/today/${encodeURIComponent(primary)}`);
        if (res.ok) o.onToday(await res.json());
      } catch (_) { /* next game end will try again */ }
    }

    function armStall() {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => { if (!closed) reconnect(); }, STALL_MS);
    }

    function reconnect() {
      if (es) { try { es.close(); } catch (_) {} }
      status('reconnecting');
      setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 60000);
    }

    function connect() {
      if (closed) return;
      es = new EventSource(url);
      armStall();

      es.onopen = () => { retryMs = 2000; status('live'); };

      es.onmessage = (e) => {
        armStall();
        let msg;
        try { msg = JSON.parse(e.data); } catch (_) { return; }

        if (msg.type === 'keepalive') return;

        if (msg.type === 'snapshot') {
          // Full state on connect and every ~60s — just replace. This is what
          // makes reconnecting free: you cannot drift.
          games.clear();
          (msg.games || []).forEach((g) => games.set(g.p1_id, g));
        } else if (msg.type === 'delta') {
          (msg.added || []).forEach((g) => games.set(g.p1_id, g));
          (msg.updated || []).forEach((g) => games.set(g.p1_id, g));
          // NB: `removed` carries bare p1_id values (the host's player id),
          // NOT game ids and NOT player names. This trips up most overlays.
          if (msg.removed && msg.removed.length) {
            msg.removed.forEach((id) => games.delete(id));
            // A finished game's result reaches the history a few seconds
            // later, so give it a moment before asking for today's numbers.
            setTimeout(refreshToday, 10000);
          }
        } else return;

        emit();
      };

      // EventSource retries by itself; it only gives up on a non-2xx
      // (a 502 while we deploy, say). Handle that one case.
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) reconnect();
        else status('reconnecting');
      };
    }

    connect();
    refreshToday();
    return { close() { closed = true; clearTimeout(stallTimer); if (es) es.close(); } };
  }

  return { watch, art, fingerprint, BASE };
});
