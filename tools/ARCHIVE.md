# Race archive (Cloudflare D1)

During the race the Worker keeps its own copies of the timing list and the GPS tracking files, so next year's predictions can be fitted to how this year's field actually ran. The feeds only ever hold the latest state, and the providers can change or take down an event after the race, so the copies are our record.

- **What's kept:** the timing team's RaceResult list every 15 minutes, and each GPS event's competitor list (`init.txt`) and positions (`data.lst`, every fix so far) every hour. A copy that's the same as the last one isn't kept again.
- **When:** only inside the race window, 5am Thursday 5 November to midday Monday 9 November 2026 (Melbourne time). Outside it the timer does nothing.
- **Where:** the `gpt100-race-control` database the Race Control board already uses, in a table of its own (`archive`). Copies are gzipped and split into pieces small enough for the database.
- **Who can read it:** only someone with the medical password. Names and GPS tracks never go into the GitHub repository, which is public.
- **Size:** under about 100 MB for the whole weekend. D1's free plan allows 500 MB a database, shared here with Race Control. Each GPS copy holds every fix before it, so older ones are thinned out: the 3 latest are kept, plus the last one of every 6 hours. Every timing copy is kept.

## 1. Setup (about 5 minutes)

The database, the password and the 15-minute timer are already set up for Race Control and the weather refresh. All that's needed is the new Worker code.

1. In Cloudflare, go to **Workers & Pages**, then **gpt100-refresh**, then **Edit code**.
2. Delete everything in the editor, paste in the whole of the latest [`refresh-worker.js`](refresh-worker.js), then **Deploy**.
3. Check the Worker has these (they should be there already):
   - **Settings, Bindings:** a D1 database called `DB` (`gpt100-race-control`). See [RACE_CONTROL.md](RACE_CONTROL.md).
   - **Settings, Variables and Secrets:** `RC_PASSWORD` (the medical password) and `TIMING_URL` (see [TIMING.md](TIMING.md)).
   - **Settings, Trigger Events:** the cron trigger, every 15 minutes. See [REFRESH_WORKER.md](REFRESH_WORKER.md).

## 2. Check it's working

From a computer with this repository:

```
MEDPLAN_PASSWORD='the medical password' node tools/archive_race.mjs --now --list
```

`--now` takes a copy straight away and shows what each feed sent. "same as the last copy" is fine, and so is a 404 for a GPS event that hasn't started yet. Then `--list` shows every copy the Worker holds. After the next 15-minute tick there should be a new timing copy whenever the list has changed.

The Worker's log in Cloudflare (**Observability**, or **Logs**) also shows a line starting `archive:` every 15 minutes.

- **"Wrong password"** means `RC_PASSWORD` doesn't match the password you typed.
- **"needs the DB database and the RC_PASSWORD secret"** means the binding or the secret is missing.
- **"no TIMING_URL secret"** means the timing list isn't being kept (the GPS still is).
- **"Exceeded CPU" in the log** can happen on Cloudflare's free plan once the GPS files get big late in the race. If it shows up, the Workers Paid plan (US$5 a month) lifts the limit. The timing copies are small and aren't affected.

## 3. After the race

Once the last cut-off has passed, take a final copy and download everything:

```
MEDPLAN_PASSWORD='the medical password' node tools/archive_race.mjs --now
```

This writes into `out/history/2026/`, which is never committed:

- `raw/`: every copy, exactly as the feeds sent it.
- `race-2026.json`: the tidy file. Every runner's chip times (with the time since their start at each timing point, and when each read first came through) and every GPS fix, merged from all the copies. It has names and bibs: keep it private.
- `anon-2026.json`: the same with no names or bibs (a made-up id still joins each runner's chip times to their GPS track), and the GPS thinned to one fix a minute. Each track is still precise, so keep this private too.

Run it again any time: copies already downloaded aren't fetched again. `--offline` rebuilds the tidy files from `raw/` without the Worker. Keep a copy of `out/history/` somewhere safe (the SingleTrack Google Drive, say) once it's done.

Only fitted figures with no names or tracks (such as `data/splits.js`) go into the app.

## Next year

Set `ARCHIVE_GPS` (the GPS event ids, separated by commas), `ARCHIVE_FROM` and `ARCHIVE_TO` (the race window, for example `2027-11-04T05:00:00+11:00`) as variables on the Worker, or change the defaults at the top of `refresh-worker.js`. Download with `--year 2027`.

To clear the copies out of the database (after downloading them and keeping `out/history/` safe), open `gpt100-race-control` in Cloudflare, go to **Console**, and run:

```
DELETE FROM archive;
```
