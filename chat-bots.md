# Twitch chat bot commands

The `/api/se/*` endpoints return plain text, sized for chat. No key needed.
Full list with live examples: **https://hotameta.com/api-docs**.

Replace `YourHotAName` with the in-game name shown on hotameta.com.

## StreamElements

```
!command add !stats $(customapi https://hotameta.com/api/se/player/${1:YourHotAName})
!command add !rating $(customapi https://hotameta.com/api/se/rating/${1:YourHotAName})
!command add !today $(customapi https://hotameta.com/api/se/today/${1:YourHotAName})
!command add !opp $(customapi https://hotameta.com/api/se/opp/YourHotAName)
!command add !h2h $(customapi https://hotameta.com/api/se/h2h/YourHotAName)
```

## Nightbot / Fossabot

```
!commands add !stats $(urlfetch https://hotameta.com/api/se/player/$(eval `$(query)`||`YourHotAName`))
!commands add !today $(urlfetch https://hotameta.com/api/se/today/$(eval `$(query)`||`YourHotAName`))
!commands add !opp $(urlfetch https://hotameta.com/api/se/opp/YourHotAName)
```

## Streamlabs Cloudbot

```
!addcom !stats {readapi.https://hotameta.com/api/se/player/{1}}
!addcom !opp {readapi.https://hotameta.com/api/se/opp/YourHotAName}
```

## Useful endpoints

| Endpoint | Returns |
|----------|---------|
| `/api/se/player/{name}` | stats one-liner |
| `/api/se/rating/{name}` | current & peak rating |
| `/api/se/today/{name}` | today's W-L and rating change |
| `/api/se/opp/{name}` | current opponent (live) |
| `/api/se/h2h/{name}` | head-to-head vs current opponent (live) |
| `/api/se/h2h/{p1}/{p2}` | head-to-head between two players |
| `/api/se/leaderboard` | top 5 |
