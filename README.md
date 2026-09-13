# hotameta.com API examples

Small, runnable examples for the [hotameta.com](https://hotameta.com) public
API — live Heroes III: Horn of the Abyss lobby data, player stats, ratings
and match history.

The API reference lives at **https://hotameta.com/api-docs** — that page is
always the source of truth. This repo only shows working patterns.

## The one thing to know

If you are watching players **live** (an overlay, a bot, a match ticker):
**don't poll — subscribe.** The API has a Server-Sent Events stream that
pushes changes within seconds:

```
GET https://hotameta.com/api/lobby/stream?players=Alice,Bob
```

It works from a browser (`EventSource`), from Node, from Python — CORS is
enabled on all public read-only endpoints, so browser pages (including OBS
browser sources) can call the API directly with no server in between.

## Examples

| File | What it shows |
|------|---------------|
| [`hotameta-overlay.js`](hotameta-overlay.js) | **Drop-in library** — owns the stream, reconnect, stall detection and restart-aware change detection; you write only the rendering |
| [`overlay-statusbar.html`](overlay-statusbar.html) | A stream status bar built on that library, ~30 lines of your own code |
| [`browser-live.html`](browser-live.html) | Live games for a roster, plain `EventSource`, works as an OBS browser source |
| [`node-live.js`](node-live.js) | Node 18+ stream consumer with reconnect + stall detection, no dependencies |
| [`python-live.py`](python-live.py) | Python stream consumer (`requests`), reconnect + stall detection |
| [`obs-overlay.md`](obs-overlay.md) | Ready-made stream overlay in one URL — no code at all |
| [`chat-bots.md`](chat-bots.md) | StreamElements / Nightbot / Cloudbot commands |

## Writing an overlay? Start with the library

Every overlay ends up re-implementing the same 100 lines: hold the stream,
reconcile `snapshot` against `delta`, reconnect sanely, notice when a restart
changed the picks, refresh today's score when a game ends. That is
[`hotameta-overlay.js`](hotameta-overlay.js) — MIT, no dependencies, one file:

```html
<script src="hotameta-overlay.js"></script>
<script>
hotameta.watch('YourHotAName', {
  onGame(g)   { /* a game started or changed — render it */ },
  onIdle()    { /* no live game — hide your bar */ },
  onToday(t)  { /* { wins, losses, current_rating, rating_change } */ },
});
</script>
```

It also carries `hotameta.art.flag() / .town() / .hero() / .heroSmall()` for
image URLs. Use those rather than building `/static/` paths by hand — the art
is keyed by **name** (`Hero_Loynis_small.png`), not by hero id, and if the
layout ever moves, updating this file keeps your overlay working.

## Ground rules

- **Send a User-Agent** that names your project (ideally with a URL). It is
  how we can tell you apart from anonymous traffic and reach you if your
  integration would benefit from an endpoint we could add.
- **Rate limit:** 5 requests/second per IP, bursts up to 25; over the limit
  returns `429` with a `Retry-After` header. One held stream connection
  replaces almost any polling loop and never touches the limit.
- **Watching a fixed roster without streaming?** Use the batch endpoint
  `/api/lobby/players?names=a,b,c` — one request for the whole roster.
- **Faction overview?** `/api/factions` returns all factions in one
  response — no need to fetch `/api/faction/0` … `/api/faction/11`.

## Stream event format

Every message is a `data:` line of JSON with a `type` field:

- `snapshot` — full state; sent on connect and every ~60 s. Replace your
  local state with it (this is what makes reconnecting trivial).
- `delta` — `added` / `updated` (lists of games), `removed` (list of
  `p1_id`). Any may be absent.
- `keepalive` — ignore; sent so idle connections stay open (at least every
  ~15 s, which is what makes stall detection easy).

Games are keyed by `p1_id` and carry both players' names, ratings, and —
once a game has started — `picks` (faction, hero, colour, template, trade).

## License

MIT — use these in anything.
