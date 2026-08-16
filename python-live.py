#!/usr/bin/env python3
"""Live lobby events from hotameta.com — Python 3.9+, needs `requests`.

    python python-live.py Alice Bob

Subscribes to the SSE stream for the named players and prints game starts,
updates and finishes. Reconnects forever with capped backoff. The read
timeout doubles as stall detection: the stream keepalives at least every
~15s, so a 45s silent read means the connection is dead.

API reference: https://hotameta.com/api-docs
"""
import json
import sys
import time

import requests

STREAM = "https://hotameta.com/api/lobby/stream"
# Name your own project here — see "Ground rules" in the README.
UA = "hotameta-api-examples/1.0 (+https://github.com/HotAMeta/api-examples)"
STALL_S = 45


def show(games: dict) -> None:
    parts = []
    for g in games.values():
        s = f"{g['p1_name']} ({g['p1_rating']})"
        s += f" vs {g['p2_name']} ({g['p2_rating']})" if g.get("p2_name") else " — waiting"
        template = (g.get("picks") or {}).get("template")
        if template:
            s += f" [{template}]"
        parts.append(s)
    print(time.strftime("%H:%M:%S"), " | ".join(parts) or "no games", flush=True)


def watch(roster: list[str]) -> None:
    games: dict = {}
    backoff = 1
    while True:
        try:
            with requests.get(
                STREAM,
                params={"players": ",".join(roster)},
                headers={"Accept": "text/event-stream", "User-Agent": UA},
                stream=True,
                # (connect timeout, read timeout) — the read timeout is the
                # stall watchdog, no separate timer needed.
                timeout=(10, STALL_S),
            ) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines(decode_unicode=True):
                    backoff = 1  # healthy again
                    if not line or not line.startswith("data:"):
                        continue
                    msg = json.loads(line[5:])
                    if msg["type"] == "snapshot":
                        games = {g["p1_id"]: g for g in msg.get("games", [])}
                        show(games)
                    elif msg["type"] == "delta":
                        for g in msg.get("added", []) + msg.get("updated", []):
                            games[g["p1_id"]] = g
                        for pid in msg.get("removed", []):
                            games.pop(pid, None)
                        show(games)
                    # keepalive: nothing to do — it exists to feed the timeout
        except (requests.RequestException, json.JSONDecodeError) as exc:
            print(f"reconnecting in {backoff}s: {exc}", file=sys.stderr, flush=True)
        time.sleep(backoff)
        backoff = min(backoff * 2, 30)
        # No state to restore: the first message after reconnect is a full
        # snapshot, which rebuilds `games` from scratch.


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python python-live.py <player> [player...]")
    watch(sys.argv[1:])
