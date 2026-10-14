# Tete 21

The Nigerian home card game Tete (21), playable online with friends on any phone or computer, with voice and video at the table.

- `server.js` — serves the game page, runs the tables, relays voice/video introductions
- `engine.js` — the rules: deal, flush, drop, trick, pick, reveal, ties, side bets, timers, computer players
- `public/index.html` — the game screen

## Run it yourself

```
npm install
npm start
```

Open http://localhost:3000. Host a table, send the code or link to friends.

## Deploy on Render (free)

1. Push this repo to GitHub.
2. On render.com: **New → Web Service**, pick the repo. Render reads `render.yaml`, so the defaults are right: Node, `npm install`, `npm start`.
3. Deploy. Your game is at `https://<name>.onrender.com`.

The free plan sleeps after 15 minutes without visitors; the first visit after that takes about 30 seconds to wake. Fine for testing with friends.

## Voice and video

Players stream directly to each other (WebRTC). The server only introduces them. This suits groups up to 5 or 6. On some mobile networks a relay is needed; set these environment variables on Render to add one (free relays exist, e.g. metered.ca):

```
TURN_URL=turn:your-relay-host:443?transport=tcp
TURN_USER=...
TURN_PASS=...
```

## Standing rooms

A host can keep a room open until they close it. Each player's device keeps a sealed (signed) copy of the room, so if the server restarts or the free plan sleeps, the first player back restores it with everyone's chips. Set `ROOM_SECRET` (any long random string; Render's "Generate" button works) so copies stay valid across deploys; without it the server falls back to Render's service id.

## Notes

- Chips are play money. No deposits, no real money.
- Ordinary tables live in memory: a redeploy ends them, and players' seats are held for two minutes if their connection drops.
