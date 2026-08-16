# Stream overlay in one URL

If what you want is "my current game on my stream", you may not need any
code at all. hotameta.com hosts a ready-made overlay:

1. In OBS, add a **Browser** source.
2. URL:

   ```
   https://hotameta.com/overlay/show?player=YourHotAName
   ```

3. Size it to taste (it renders on a transparent background) and you're done.
   It updates itself within seconds of your lobby state changing and never
   goes blank during brief network hiccups.

There is a builder with a live preview at **https://hotameta.com/overlay** —
pick which panels you want (rating, today's record, opponent, heroes, towns,
map, trade, head-to-head, streak, …) and it gives you the URL.

## Rolling your own instead

If you want full control of the look, build your own page and feed it from
the live stream — that's what [`browser-live.html`](browser-live.html)
demonstrates. Since the API sends CORS headers, your overlay page can be a
single local HTML file loaded straight into OBS; there is no need for a
companion server, polling loops, or a proxy.
