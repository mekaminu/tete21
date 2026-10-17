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

- **Launch intro:** about four seconds. An Ace spins in and bursts into the deck, the cards whirl and slam into a fan, then TETE stamps down and an Ace and a 10 make 21. Tap to skip. It is skipped automatically when you are getting back into a game, can be switched off under your profile, and `/?intro` replays it. Browsers hold sound back until the page has had a tap (Safari always, Chrome unless the app is installed or well used), so when sound is held back the intro waits on a "Tap to start" card and then plays with its soundtrack. Sounds are never saved up for later: one asked for before any tap is simply dropped. Skipping the intro cuts its sound too.
- **Lobby:** your name chip, three choices (Host, Join, Practice), a Return card for tables you hold a seat at, then open tables and friends. Settings live in sheets that slide up.
- **At the table:** the dealer riffles the deck before each deal; cards fly from the shoe to each seat and the board; picked cards fly from the board to the player; chips arc into the pot and back out; chip counts roll; the trick is swept back to the dealer.
- **Hot streaks:** win two hands in a row and a flame badge with the count sits over your seat, with a fire glow round your avatar. Three in a row gets a shout, five or more a fire banner for the whole table; when a run of three or more ends it goes out in a puff of smoke. A play-off keeps the tied players' runs alive.
- **Twenty-one:** landing on 21 bursts gold from the seat with a brass ta-da; winning the pot with 21 adds rays and double confetti, and when it's you a gold glow and a shine across your cards. Sitting on 21 straight after the drop gets a private nudge.
- **Table felt:** classic green, royal blue, wine, midnight or an ankara print, picked in your profile (tap your own seat at the table). Each player sees their own choice.
- **Tonight's scores:** the Scores & log panel ranks everyone by what they're up or down since they sat (chips in front of them against everything they bought in), with hands won and best run. When the host closes a standing room, everyone sees the final scores on a podium.
- **Chat:** the Chat button holds the Pidgin shouts and a box to say anything to the table; it floats over your seat and goes in the hand log.
- **Whose turn:** a spotlight under the seat and a gold pointer above it glide from player to player (green when it's you).
- **Removing a player:** the host taps someone's seat, then Remove from the table (a second tap confirms), or uses Players at the table at the top of ⚙ Table settings. The seat goes, mid-hand they're out of the hand like anyone who leaves, the table's log says who took them off, and they can only come back if the host lets them in (they're sent to the host as a request; the list is saved with standing rooms).
- **Picking is compulsory:** on your turn, while the next card on the board keeps you on 21 or under you must take it (tap Take, or tap the card itself); there's no Stay button. When the turn clock runs out the card is given to you. You stop on 21, or when the next card would take you over 21 (both look like a plain stay to everyone else, so a 21 stays secret). Computer players follow the same rule.
- **Picked cards leave the board:** a card someone picks flies from the board to them, and the cards still to be picked slide together, so the table only shows what's left to pick.
- **Spraying:** notes peel off the sprayer's hand, flutter across, rain on the receiver and pile up at their seat; ten wagers or more makes it rain over the whole table. 'Give a buy-in' brings a player who ran out back in.
- **Shouts out loud:** each shout is spoken on everyone's device (a Nigerian English voice where the device has one). Profile → My shouts records your own voice for each one, and the table hears yours.
- **Table settings mid-game:** the ⚙ Settings button in the table's top bar (gold-edged for whoever can change things; the table name and the wager open it too). The host (or anyone seated while the host is away) can change the wager, buy-in, timer and rules; the wager and rules apply from the next hand. The first time a host is at a table, a pointer shows where it is.
- **The call:** the first card dropped is the call. It wears a CALL tag, its suit flies to the middle of the table ("♠ called · 👑 Ada · 10♠"), a crown sits on the card leading the call and hops across with sparks whenever someone beats it, and cards that didn't follow suit are greyed out. On your turn, a small crown marks any card in your hand that would take the lead.
- **Other players' cards:** real cards with big corner numbers (the top-left number is about 1.7 times the old size, the middle suit stays, the bottom corner stays small so an upside-down 9 never reads as a 6). Overlapping cards always leave every top-left number showing, on both sides of the table, and the total sits on the avatar's outer shoulder so it never covers a card.
- **Reveal:** 21 stays secret while people pick (no pop-up, and the log never shows totals). When picking ends, hands are turned over one player at a time; a 21 pops up with its sound as it's shown, and every seat gets a big total.
- **Lending:** 🤝 Lend in the bottom bar (or on a player's card). Loans are recorded per table (and saved with standing rooms), paid back from the Lend sheet or marked settled by the lender; a loan moves both players' buy-in totals so Tonight's scores ignore it; what's still owed is listed on the final scores.
- **Music:** 13 real Afrobeats, Afrobeat and highlife songs (picked by Meka) in `public/music`, free to use under the Pixabay Content License (no credit needed; the Music panel shows each song's name and artist anyway). They play quietly at the table in a shuffle, through the sound engine, so the music ducks while anyone talks on voice and dips under each shout; a song is fetched whole and kept by the browser (versioned address), and the next one is fetched while the current one plays. 🎵 Music at the bottom of the table shows what's playing, skips to the next song, turns it down or off (also in the profile); 🔊 Sounds is a plain on/off for the game sounds. To change the songs: edit `tools/music-sources.json`, push to the `get-music` branch (the "Fetch the table music" action downloads them, trims the silence and evens out the loudness onto `music-lab`), then copy the chosen files and `index.json` into `public/music`. The intro still ends on the synthesised Afrobeat break, and 21 is an Afrobeat hit.
- **House voice:** every shout plays in one real Nigerian voice, Meka's, for everyone at every table (`public/shouts/house`, with `index.json` naming whose voice it is). The clips are cut from a single voice note of all 14 shouts said in order with a pause between each: `python3 tools/house-voice.py note.m4a --name Meka` finds each shout, leaves out taps and rustles, trims, filters, evens out the loudness and saves small MP3s (`--list` shows what it heard, `--keep` picks the parts if it heard more or fewer than 14). To record them again, send a new voice note and run it again. The older computer voice (Microsoft Azure's en-NG "Abeo") can still be made by the "Make the shout clips" GitHub Action (`tools/make-shouts.mjs`, key in the repository's secrets), which puts its clips on the `voice-clips` branch. If the clips can't load, shouts fall back to the phone's voice. New shouts go on the end of the list (so the earlier clips keep their numbers) and are cut from a note of just those: `--from 14`; `--keep 1.5-2.9,5.7-7.8` cuts at exact times when a note has taps or extra sounds. The "Transcribe the voice notes" action (push to `transcribe`) writes down what each note says, word by word, to check the cuts.
- **Leaving:** in rooms that stay open, Leave offers Step away, Leave for good, or (host) Close the room for everyone.
- **Battery:** the turn clock ticks only while someone's clock runs, the voice meter and sound engine rest when quiet, and your camera pauses while the app is in the background.
- **Sounds:** made in the browser with Web Audio: riffle, card flicks, chip clinks, your-turn chime, a ticking clock in the last five seconds, the Adasi fanfare, the Series thud and more. Mute and volume are in the profile; the speaker buttons in the lobby and under your hand toggle them. Phones only play sound after the first tap.

## Notes

- **Closing the game for a while:** commit a file called `CLOSED` at the top of the repo and push to `main`. After the deploy, every page shows "The tables are closed for now", nobody can connect, and standing rooms stay saved untouched. Delete the file and push again to open up.
- Chips are play money. No deposits, no real money.
- Ordinary tables live in memory: a redeploy ends them, and players' seats are held for two minutes if their connection drops.
