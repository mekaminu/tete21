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

- **Rooms list:** every open table shows in the lobby. Public rooms can be joined with one tap; private rooms need the code, or the host's OK when someone taps "Ask to join". The owner (Meka) gets **Join** on every table and sits straight down if there's a free seat. Each row says who's actually there: "2 here now · 3 of 6 seats taken", or, for a room that stays open after everyone has stepped away, "Nobody here now · 3 seats held" (their seats and chips wait for them).
- **Invite:** inside a room, Invite shows the code, copies the link, opens the phone's share menu (WhatsApp, Messages, contacts) and lists your friends with an Invite button.
- **Friends:** each device has a private key; its public id is derived from it, so nothing needs storing on the server. Share your friend link once and you're friends. Friend lists live on each device; the server only tracks who is online and at which table.

## Members only

Only people the owner (Meka, username `meka`) lets in can open Tete at all. Everyone else gets a small sign-in page (`pages/gate.html`) that carries none of the game: not the tables, not practice, not the code (the game's files answer 403 and the socket closes with 4003).

- **Asking:** a new account (or an old one coming back) lands on "Waiting for Meka" and the request drops in for Meka as a card with **Let in** / **Not now**; the page lets them in by itself the moment he says yes.
- **Members sheet** (the 👥 button in Meka's lobby, with how many are waiting): Waiting for you, Invite a friend, Members (**Remove** takes someone off at once, even mid-game), Not let in, everyone else who had an account before members only, and the **Members only On/Off** switch (Off: anyone with the link can play; switching it back on sends anyone who isn't a member back to the sign-in page).
- **Who opens tables:** only Meka, for now. The Members sheet's **Tables** section switches it between **Only me** and **Any member** (`hosts` in the same `members` record). Everyone else's Host tile is locked and says why, and the server turns them away too. The same section lists the tables open now and has **Close all tables** (two taps): everyone at a table goes back to the lobby with the final scores, and standing rooms close for good.
- **Top up (Meka only):** each member's row (and Meka's own, at the top of Members) shows their balance and a **Top up** button: +1,000, +5,000 or +10,000 chips from the house, straight onto their balance (play money; written in the ledger as `gift`). They're told wherever they're signed in ("Meka gave you 5,000 chips", with coins raining if they're at a table, and "Tap Rebuy" if they'd run out). The server takes `member_topup` from the owner only, and only those three amounts.
- **Invite links:** a link for 1 person or up to 5, valid 3 days; whoever opens it and makes an account (or signs in) is straight in.
- **How it knows you:** signing in sets a cookie holding the account's session (HttpOnly, SameSite=Lax, Secure on https); a phone that was signed in before members only is carried over automatically. Sign-in, accounts made per address (5 an hour) and failed passwords are rate-limited.
- **Settings:** `OWNERS` (usernames, default `meka`), `OWNER_NAME` (default Meka), `MEMBERS_ONLY=0` switches it all off (for running locally). The list is kept in the database (`t21_kv`, key `members`).

## Standing rooms

A host can keep a room open until they close it. Each player's device keeps a sealed (signed) copy of the room, so if the server restarts or the free plan sleeps, the first player back restores it with everyone's chips. Set `ROOM_SECRET` (any long random string; Render's "Generate" button works) so copies stay valid across deploys; without it the server falls back to Render's service id.

## Gold tables

A Gold table is the premium look, for everyone sitting at it:
- **The table:** a brass rail with a slow glint, and an onyx felt with a fine gold lattice. On computers, the table's name is engraved on the felt; phones keep the felt clear.
- **Cards and coins:** cards are gold-edged, with black-and-gold backs. Chips become gold coins that clink heavier, and sprayed notes turn gold.
- **Seats:** a gold ring circles each seat, a crown sits on the host's, and a GOLD badge sits by the table's name.
- **Big moments:** an Adasi gilds the two Aces and rains coins instead of confetti, and a win bursts coins from the winner's seat.
- **Lobby:** a Gold table's row in Rooms, and its Return card, are gold-edged with a Gold tag.

Only the owner can make a table Gold for now (`members.canGold`). He can do it from Host → **Gold**, Practice → **Gold**, or ⚙ Settings at the table. The server drops `gold` from anyone else's host and settings messages, even while the host is away. Later it's meant to be something people pay for. The motion is transform and opacity only, and it stays still for anyone whose device asks for reduced motion.

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
- **Handing over the host:** the host taps someone's seat → **Make host** (a second tap confirms), or uses Make host in ⚙ Table settings → Players at the table. The new host is told and runs the table (settings, starting hands, letting people in); the table's log says who handed it over. If the host leaves for good without picking, the next person at the table takes over, and the Leave sheet says who. Anyone can come back later with the table's code and sit straight down if there's a seat and their balance covers the buy-in.
- **Picking is compulsory:** on your turn, while the next card on the board keeps you on 21 or under you must take it (tap Take, or tap the card itself); there's no Stay button. When the turn clock runs out the card is given to you. You stop on 21, or when the next card would take you over 21 (both look like a plain stay to everyone else, so a 21 stays secret). Computer players follow the same rule.
- **Picked cards leave the board:** a card someone picks flies from the board to them, and the cards still to be picked slide together, so the table only shows what's left to pick.
- **Spraying:** notes peel off the sprayer's hand, flutter across, rain on the receiver and pile up at their seat; ten wagers or more makes it rain over the whole table. 'Give a buy-in' brings a player who ran out back in.
- **Shouts out loud:** each shout is spoken on everyone's device (a Nigerian English voice where the device has one). Profile → My shouts records your own voice for each one, and the table hears yours.
- **Table settings mid-game:** the ⚙ Settings button in the table's top bar (gold-edged for whoever can change things; the table name and the wager open it too). The host (or anyone seated while the host is away) can change the wager, buy-in, timer and rules; the wager and rules apply from the next hand. The first time a host is at a table, a pointer shows where it is.
- **The call:** the first card dropped is the call. It wears a CALL tag, its suit flies to the middle of the table ("♠ called · 👑 Ada · 10♠"), a crown sits on the card leading the call and hops across with sparks whenever someone beats it, and cards that didn't follow suit are greyed out. On your turn, a small crown marks any card in your hand that would take the lead.
- **Other players' cards:** real cards with big corner numbers (the top-left number is about 1.7 times the old size, the middle suit stays, the bottom corner stays small so an upside-down 9 never reads as a 6). Overlapping cards always leave every top-left number showing, on both sides of the table, and the total sits on the avatar's outer shoulder so it never covers a card.
- **Reveal:** 21 stays secret while people pick (no pop-up, and the log never shows totals). When picking ends, hands are turned over one player at a time; a 21 pops up with its sound as it's shown, and every seat gets a big total.
- **Lending:** 🤝 Lend in the bottom bar (or on a player's card). Loans are recorded per table (and saved with standing rooms), paid back from the Lend sheet or marked settled by the lender; a loan moves both players' buy-in totals so Tonight's scores ignore it; what's still owed is listed on the final scores.
- **Music:** 13 real Afrobeats, Afrobeat and highlife songs (picked by Meka) in `public/music`, free to use under the Pixabay Content License (no credit needed; the Music panel shows each song's name and artist anyway). They play quietly at the table in a shuffle, through the sound engine, so the music ducks while anyone talks on voice and dips under each shout; a song is fetched whole and kept by the browser (versioned address), and the next one is fetched while the current one plays. 🎵 Music at the bottom of the table shows what's playing, skips to the next song, turns it down or off (also in the profile); 🔊 Sounds is a plain on/off for the game sounds. To change the songs: edit `tools/music-sources.json`, push to the `get-music` branch (the "Fetch the table music" action downloads them, trims the silence and evens out the loudness onto `music-lab`), then copy the chosen files and `index.json` into `public/music`. The intro still ends on the synthesised Afrobeat break, and 21 is an Afrobeat hit. **Play music from a tab:** on a computer (Chrome or Edge), 🎵 Music → Play music from a tab shares another tab's sound (YouTube Music, say) with the whole table: it goes as its own stream next to your mic (which carries on as normal), the table's songs rest meanwhile, it doesn't step back when people talk, the sharer sets **Volume for the table** and everyone keeps their own music volume. Chrome mutes the shared tab on the sharer's side and Tete plays it to them instead. One person at a time (the latest takes over); it stops when they stop sharing, leave or lose their connection. Phones can't share another app's sound, and Safari and Firefox can't share a tab's sound. **Play songs from my phone** (or song files on a computer): pick music files (MP3, M4A…) and they play for the table the same way, in order and round again, with Next song and Stop; everyone sees the song's name. The sound is unlocked inside the tap that opens the picker, because phones only let sound start from a tap. Songs saved inside YouTube Music, Spotify or Apple Music can't be picked: those apps keep them locked. **Tete for Android** (`android/`, a small Kotlin app: the game in a WebView) adds **Play music from my phone**: start YouTube Music (or any music app), then 🎵 Music → Play music from my phone; Android asks once (the whole screen, since that's the only way Android passes on other apps' sound; Tete never looks at the screen), and a foreground service picks up what other apps are playing (never Tete's own sound) and sends it to the page as 48 kHz stereo 16-bit over a message port; the page plays it to the table like a shared tab. Chromium asks Android for full audio focus whenever a page plays WebRTC voices, which would pause YouTube Music, so while the music is shared the app mutes the page and the page mixes everyone's voices and the game's sounds (AudioWorklet `tete-out`) back to the app, which plays them with a player that asks Android for nothing and can't be recorded; it also presses play once for the music app in case it had already been paused. The page knows it's in the app by `window.TeteAndroid` (hello, startMusic, stopMusic, share, version); invites go through Android's share sheet. Android browsers get a link to the app instead (`/download/tete.apk`, members only). The app is built on GitHub: push to the `android-build` branch and the "Android app" action puts the signed `tete.apk` (and `build.txt`) on the `android-apk` branch; copy it to `public/download/tete.apk`. To check a build installs and opens, push to the `android-test` branch: the "Android install test" action installs `android-apk`'s `tete.apk` on emulated Android 10, 14 and 16 phones and opens it. It leaves the install result, the crash log and a screenshot on `android-test-results-<api level>`. The app's signing key is `android/keystore/tete.jks` (the same key for every version, so updates install over the old one), and `/.well-known/assetlinks.json` names it so invite links open in the app.
- **House voice:** every shout plays in one real Nigerian voice, Meka's, for everyone at every table (`public/shouts/house`, with `index.json` naming whose voice it is). The clips are cut from a single voice note of all 14 shouts said in order with a pause between each: `python3 tools/house-voice.py note.m4a --name Meka` finds each shout, leaves out taps and rustles, trims, filters, evens out the loudness and saves small MP3s (`--list` shows what it heard, `--keep` picks the parts if it heard more or fewer than 14). To record them again, send a new voice note and run it again. The older computer voice (Microsoft Azure's en-NG "Abeo") can still be made by the "Make the shout clips" GitHub Action (`tools/make-shouts.mjs`, key in the repository's secrets), which puts its clips on the `voice-clips` branch. If the clips can't load, shouts fall back to the phone's voice. New shouts go on the end of the list (so the earlier clips keep their numbers) and are cut from a note of just those: `--from 14`; `--keep 1.5-2.9,5.7-7.8` cuts at exact times when a note has taps or extra sounds. The "Transcribe the voice notes" action (push to `transcribe`) writes down what each note says, word by word, to check the cuts.
- **Leaving:** in rooms that stay open, Leave offers Step away, Leave for good, or (host) Close the room for everyone.
- **Battery:** the turn clock ticks only while someone's clock runs, the voice meter and sound engine rest when quiet, and your camera pauses while the app is in the background.
- **Sounds:** made in the browser with Web Audio: riffle, card flicks, chip clinks, your-turn chime, a ticking clock in the last five seconds, the Adasi fanfare, the Series thud and more. Mute and volume are in the profile; the speaker buttons in the lobby and under your hand toggle them. Phones only play sound after the first tap.

## Notes

- **Closing the game for a while:** commit a file called `CLOSED` at the top of the repo and push to `main`. After the deploy, every page shows "The tables are closed for now", nobody can connect, and standing rooms stay saved untouched. Delete the file and push again to open up.
- Chips are play money. No deposits, no real money.
- **Which version is live:** `/version` shows the first 7 characters of the commit Render is running (`dev` locally). Like `/health`, it's open to anyone, so a deploy can be checked from outside the members' gate. The live-check action waits for the commit named in `expect.txt` on the `live-check` branch.
- Ordinary tables live in memory: a redeploy ends them, and players' seats are held for two minutes if their connection drops.
