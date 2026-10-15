# Tete 21

The Nigerian home card game Tete (21), playable online with friends on any phone or computer, with voice and video at the table.

- `server.js` — serves the game page, runs the tables, accounts and friends, relays voice/video introductions
- `accounts.js`, `db.js` — accounts, wallet, friends and history (Postgres, or a local file)
- `public/engine.js` — the rules: deal, flush, drop, trick, pick, reveal, ties, side bets, timers, computer players (the same file runs practice games in the browser)
- `public/index.html` — the screens and their styles
- `public/app.js` — the lobby, the table, friends, invites, voice and video, card and chip animation
- `public/intro.js` — the launch intro
- `public/sound.js` — every game sound, made in the browser (no audio files)

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

## Rooms, friends and invites

- **Rooms list:** every open table shows in the lobby. Public rooms can be joined with one tap; private rooms need the code, or the host's OK when someone taps "Ask to join".
- **Invite:** inside a room, Invite shows the code, copies the link, opens the phone's share menu (WhatsApp, Messages, contacts) and lists your friends with an Invite button.
- **Friends:** each device has a private key; its public id is derived from it, so nothing needs storing on the server. Share your friend link once and you're friends. Friend lists live on each device; the server only tracks who is online and at which table.

## Standing rooms

A host can keep a room open until they close it. Each player's device keeps a sealed (signed) copy of the room, so if the server restarts or the free plan sleeps, the first player back restores it with everyone's chips. Set `ROOM_SECRET` (any long random string; Render's "Generate" button works) so copies stay valid across deploys; without it the server falls back to Render's service id.

## Accounts

Playing as a guest still works. A free account (username and password) adds:

- **Balance:** 10,000 play chips to start. Your balance backs the chips in front of you: you need enough free chips to sit at a table, and each hand's win or loss lands on your balance the moment the hand ends.
- **Daily wheel:** one free spin a day for bonus chips.
- **Profile:** level and experience, hands, wins, win rate, biggest win, Adasi count, best streak, a 14-day chart of daily gains and losses, and recent hands.
- **Friends:** requests by username (accept or decline), friend links still work, friends' online status on any device.
- **Any device:** your seat follows your account, so you can pick it up on another phone or computer.

Accounts need a Postgres database: set `DATABASE_URL` (Neon's free tier works). Without it the server keeps accounts in `data/accounts.json`, which is fine for running locally but is wiped on Render's free plan. Standing rooms are saved in the database too, so they survive restarts. `/health` answers `ok (accounts offline)` if the database can't be reached.

## Look and sound

- **Launch intro:** about four seconds. An Ace spins in and bursts into the deck, the cards whirl and slam into a fan, then TETE stamps down and an Ace and a 10 make 21. Tap to skip. It is skipped automatically when you are getting back into a game, can be switched off under your profile, and `/?intro` replays it.
- **Lobby:** your name chip, three choices (Host, Join, Practice), a Return card for tables you hold a seat at, then open tables and friends. Settings live in sheets that slide up.
- **At the table:** the dealer riffles the deck before each deal; cards fly from the shoe to each seat and the board; picked cards fly from the board to the player; chips arc into the pot and back out; chip counts roll; the trick is swept back to the dealer.
- **Hot streaks:** win two hands in a row and a flame badge with the count sits over your seat, with a fire glow round your avatar. Three in a row gets a shout, five or more a fire banner for the whole table; when a run of three or more ends it goes out in a puff of smoke. A play-off keeps the tied players' runs alive.
- **Twenty-one:** landing on 21 bursts gold from the seat with a brass ta-da; winning the pot with 21 adds rays and double confetti, and when it's you a gold glow and a shine across your cards. Sitting on 21 straight after the drop gets a private nudge.
- **Table felt:** classic green, royal blue, wine, midnight or an ankara print, picked in your profile (tap your own seat at the table). Each player sees their own choice.
- **Tonight's scores:** the Scores & log panel ranks everyone by what they're up or down since they sat (chips in front of them against everything they bought in), with hands won and best run. When the host closes a standing room, everyone sees the final scores on a podium.
- **Chat:** the Chat button holds the Pidgin shouts and a box to say anything to the table; it floats over your seat and goes in the hand log.
- **Whose turn:** a spotlight under the seat and a gold pointer above it glide from player to player (green when it's you).
- **Picked cards stay open:** cards taken from the board stay face up in their slot, ringed in the picker's colour with their badge underneath.
- **Spraying:** notes peel off the sprayer's hand, flutter across, rain on the receiver and pile up at their seat; ten wagers or more makes it rain over the whole table. 'Give a buy-in' brings a player who ran out back in.
- **Shouts out loud:** each shout is spoken on everyone's device (a Nigerian English voice where the device has one). Profile → My shouts records your own voice for each one, and the table hears yours.
- **Table settings mid-game:** tap the table name. The host (or anyone seated while the host is away) can change the wager, buy-in, timer and rules; the wager and rules apply from the next hand.
- **Leaving:** in rooms that stay open, Leave offers Step away, Leave for good, or (host) Close the room for everyone.
- **Battery:** the turn clock ticks only while someone's clock runs, the voice meter and sound engine rest when quiet, and your camera pauses while the app is in the background.
- **Sounds:** made in the browser with Web Audio: riffle, card flicks, chip clinks, your-turn chime, a ticking clock in the last five seconds, the Adasi fanfare, the Series thud and more. Mute and volume are in the profile; the speaker buttons in the lobby and under your hand toggle them. Phones only play sound after the first tap.

## Notes

- Chips are play money. No deposits, no real money.
- Ordinary tables live in memory: a redeploy ends them, and players' seats are held for two minutes if their connection drops.
