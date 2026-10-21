# Timing chips in the app (RaceResult)

The timing team's chip reads give the app a second way to place every runner, alongside the GPS trackers. Each covers for the other: when a tracker goes quiet, is left at home or runs flat, the chips still say which checkpoint the runner last crossed and when. When the chips miss someone, the tracker still has them. For every runner the newest hard fix wins, whichever feed it came from, and the app says how each position was worked out.

The timing decoders at every checkpoint upload over 4G or Starlink, so the reads reach RaceResult's server within moments of the runner crossing.

## 1. What to ask the timing team for

A **Simple API** link to a list, in JSON. In the event file: **Basic Settings**, then **Access Rights / Simple API**, add a list and copy its link. The link is a fixed address on `api.raceresult.com` that works without logging in. It only reads that one list, and it lives in our Cloudflare Worker, never in the app or on a phone.

The list needs these columns (names don't have to match exactly, the app recognises the usual ones):

- **Bib**
- **Name** (or first name and last name)
- **Contest** (the race: Miler, 50k, Stage 2, 14k and so on)
- **Status** (so withdrawn and did-not-start runners drop off the course)
- **One column per timing point**, holding the **time of day** the runner crossed it (blank until they do). Name each column after the place: Start, Copper Mine, GAR, Mt Difficult Ridgeline, Mt Difficult Rd, Halls Gap, Mt Rosea, Borough Huts, Mt William, Stockyard Track, Jimmy Creek, Yarram Gap, Griffin, Cassidys, Bainggug, Finish. A full date and time, or a Unix time, is fine too.

Ask for the list to cover every contest. One list for everything is simplest. If a timing point is passed twice (the out and back at Jimmy Creek), either two columns or one column with the later time both work.

The app matches the column names to the course by itself and says in its status line if one didn't match. Add any it can't match to `tracking.chipPoints` in `data/config.js`, for example `{ 'TP7': { km: 99.5 } }` (add `course: '14k'` for that course).

RaceResult answers at most one call a second per link and caches for 10 to 30 seconds, so the Worker reads it every 20 seconds at most and every phone reads from the Worker. Nothing the app does can overload their server.

## 2. Put the link in the Worker

1. In Cloudflare, open the `gpt100-refresh` Worker, then **Settings**, then **Variables and Secrets**, then **Add**.
2. **Type:** Secret. **Variable name:** `TIMING_URL`. **Value:** paste the whole link, including everything after the `?`.
3. **Deploy** (or **Save**). Make sure the Worker has the current `tools/refresh-worker.js` pasted in (the `/timing/` relay was added with the chip feed).
4. Open `https://gpt100-refresh.chad-ad3.workers.dev/timing/` in a browser from the app's site. If it shows the list as JSON, the relay works.

## 3. Turn it on in the app

In `data/config.js`, set `tracking.chip` to `'relay'` and commit. From then on every app (staff, field, Medical, Control) reads the chips every 30 seconds and merges them with the trackers. Leave it blank to switch the chips off again.

## 4. How the two feeds are merged

- **The newest hard fix wins.** A GPS fix and a chip read are both facts about where a runner was and when. Whichever is newer gives the position. Finished, withdrawn and did-not-start runners come off the course.
- **Carried forward at their pace.** A fix older than 3 minutes gets a "likely km now", at the runner's own pace (where they sit between the fastest runner and the cut-offs, from their last two chip reads, or mid-pack until then), along the course and never past the next timing point. If at their pace they'd have reached the next timing point and there's no read there, the app says they're somewhere on that leg and puts the marker in the middle of it.
- **Late at the next checkpoint.** From their last chip read, the app works out when they're due at the next timing point. Past that by 20 minutes (or a quarter of the leg), and with no fresh GPS fix showing them moving, they're flagged late. Past the cut-off pace for the leg, overdue. These show in the Runner watch on the Control board and in Medical.
- **A quiet tracker isn't an alarm by itself.** If the chips have a newer read, the runner is accounted for and the app just notes the tracker went quiet. If the chips have nothing newer, they show in the Tracker gone quiet list as before.
- **On the maps:** solid blue is a fix in the last few minutes; dashed is estimated; grey is a quiet tracker; amber is late at the next checkpoint; dark orange overdue; red not moving. Every marker's popup and every list row say which feed placed the runner and when.

## 5. Rehearse before the link exists

The quickest way: open any app with `?demo=1` (for example `map.html?demo=1`). The made-up field runs the course live in the browser, GPS trackers and timing chips both, with the handover cases below, and nothing to install. See "Demo: run the race in the browser" in the README.

For a feed in the provider's exact files, served from a folder:

```
node tools/gps_demo_feed.mjs out/demo-gps 60 9      # 60 made-up runners, 9 hours into the Miler, both feeds
python3 -m http.server 8765                          # from the repo root
open http://localhost:8765/index.html?gps=http://localhost:8765/out/demo-gps/
```

The rehearsal feed has runners with no tracker, trackers that went quiet while the chips carried on, runners who stopped, one lot who lost their tracker and stopped 3 hours ago (overdue at the next checkpoint), withdrawals and a checkpoint that missed a runner. Find them with `#bib` in Find, or on the Control board's Runner watch.

To try a timing list on its own (no GPS feed) open the app with `?chip=<address of the JSON list>`. On the live site the same works through the relay with `?chip=relay` once the secret is in the Worker, before `tracking.chip` is set in the config.
