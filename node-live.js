#!/usr/bin/env node
// Live lobby events from hotameta.com — Node 18+, no dependencies.
//
//   node node-live.js Alice Bob
//
// Subscribes to the SSE stream for the named players and prints game
// starts, updates and finishes. Reconnects forever with capped backoff;
// a read that stalls longer than the keepalive interval aborts and
// reconnects. See https://hotameta.com/api-docs for the API.

const roster = process.argv.slice(2);
if (roster.length === 0) {
  console.error('usage: node node-live.js <player> [player...]');
  process.exit(1);
}

const STREAM = 'https://hotameta.com/api/lobby/stream?players=' +
  encodeURIComponent(roster.join(','));
// Name your own project here — see "Ground rules" in the README.
const UA = 'hotameta-api-examples/1.0 (+https://github.com/HotAMeta/api-examples)';
// The stream keepalives at least every ~15s; 45s of silence means the
// connection is dead even if TCP hasn't noticed.
const STALL_MS = 45_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Yields parsed JSON messages from an SSE byte stream.
async function* messages(body, signal) {
  const decoder = new TextDecoder();
  let pending = '';
  for await (const chunk of body) {
    if (signal.aborted) return;
    pending += decoder.decode(chunk, { stream: true });
    const blocks = pending.split('\n\n');
    pending = blocks.pop(); // last piece may be incomplete
    for (const block of blocks) {
      for (const line of block.split('\n')) {
        if (line.startsWith('data:')) yield JSON.parse(line.slice(5));
      }
    }
  }
}

function show(games) {
  const list = [...games.values()]
    .map((g) => `${g.p1_name} (${g.p1_rating})` +
      (g.p2_name ? ` vs ${g.p2_name} (${g.p2_rating})` : ' — waiting') +
      (g.picks?.template ? ` [${g.picks.template}]` : ''))
    .join(' | ');
  console.log(new Date().toISOString(), list || 'no games');
}

async function run() {
  const games = new Map();
  for (let backoff = 1000; ; backoff = Math.min(backoff * 2, 30_000)) {
    const abort = new AbortController();
    // Stall watchdog: reset on every message, aborts the fetch otherwise.
    let stallTimer = setTimeout(() => abort.abort(), STALL_MS);
    try {
      const res = await fetch(STREAM, {
        headers: { accept: 'text/event-stream', 'user-agent': UA },
        signal: abort.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      for await (const msg of messages(res.body, abort.signal)) {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => abort.abort(), STALL_MS);
        backoff = 1000; // healthy again
        if (msg.type === 'snapshot') {
          games.clear();
          for (const g of msg.games ?? []) games.set(g.p1_id, g);
          show(games);
        } else if (msg.type === 'delta') {
          for (const g of msg.added ?? []) games.set(g.p1_id, g);
          for (const g of msg.updated ?? []) games.set(g.p1_id, g);
          for (const id of msg.removed ?? []) games.delete(id);
          show(games);
        }
        // keepalive: nothing to do — receiving it already fed the watchdog
      }
      throw new Error('stream ended');
    } catch (err) {
      console.error(`reconnecting in ${backoff / 1000}s:`, err.message);
    } finally {
      clearTimeout(stallTimer);
      abort.abort();
    }
    await sleep(backoff);
    // No state to restore: the first message after reconnect is a full
    // snapshot, which rebuilds `games` from scratch.
  }
}

run();
