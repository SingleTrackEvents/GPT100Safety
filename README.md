# GPT100 Safety

A race-day app for GPT100 event staff. It answers one question fast: **a runner needs help at this spot, who do we send and how long will it take?**

It works on a phone, tablet or laptop, and keeps working when there's no signal.

## What's in it

**Courses:** a picker at the top of Find and the Run sheet switches between the GPT100 course (which the 50k, 33k and stage races also run on) and the 14k (the 6k runs on part of it). Each course has its own km, sections and checkpoints, and shares the same access points and drive routes.

**Find** (for whoever takes the call)

- **Runner's race:** on the GPT100 course, pick the runner's race (Miler, 50k or Stage 1, Stage 2, Stage 3, Stage 4 or 33k) and type the km they give. The app converts it, for example Stage 2 km 10 is GPT100 km 59.2, and shows both in the result and the message. Races are set in `data/config.js` by their start and finish aid stations.

- Type a km (`87.3`), coordinates (`-37.294, 142.601`) or what3words (`///word.word.word`). You can also use your phone's GPS or tap the map.
- You get one clear answer: which team to send, where to park (with gated roads flagged), the walk in, and the ETA.
- It also shows the backup team, the nearest aid stations either side, and how long a stretcher carry-out would take.
- **WhatsApp** opens WhatsApp with the message ready to send. Pick the safety group or a person. It includes map links for the casualty and the parking spot. The same message shows on screen, so it can also be read out over the radio.
- **Directions** opens Google Maps to the parking spot.
- **Weather now** at the casualty: temperature, feels like, gusts and sky, the next 3 hours, any trigger getting close, and any BOM warning near the course.
- If a spot takes more than 2 hours to reach, a red warning tells you to escalate early.

**what3words throughout**

- Every access point, aid station and base has a what3words address stored in the app, so it shows even with no signal. Tap one to open it in the what3words app, which can navigate there.
- Search by what3words, with suggestions near the course as you type. If a word is misheard or the address lands a long way from the course, the app suggests likely alternatives near the race.
- With signal, the casualty's what3words is looked up and added to the result, the message and the WhatsApp text, along with the parking spot's what3words.

**Run sheet** (for briefings, aid station captains and sweeps)

- The course from aid station to aid station, rated green, amber or red by how long it takes to reach the hardest point.
- Open a section to see its access points and a km by km table. Tap any row to open it in Find.
- **Print** gives a clean A4 paper backup for vehicles and aid stations.

**Weather** (for the weather lead and race control)

- **Triggers:** the Risk Management Plan triggers (fire, wind on ridges, thunderstorms, heat, heavy rain, cold on ridges, smoke) for the next 48 hours and for race weekend. Each shows Clear, Getting close or Met, where and when, and whether runners will be there. Official BOM warnings near the course and the CFA fire ratings come first. Tap a trigger to see it on the timeline.
- **Timeline:** the whole course against time, coloured by trigger status, feels like temperature, gusts, rain, chance of rain, heat stress (WBGT), thunderstorms or cloud, with the fastest and slowest runners drawn on. Tap anywhere, or type a km and a time, for the weather at that spot.
- **Simulator:** press Play and watch the fastest runner and the slowest (the cut-offs) travel the course, with the weather where they are, then a summary of each runner's whole race: hottest, coldest feels like, strongest ridge gust, rain and any triggers. Before the forecast reaches race weekend you can move the race into the forecast, or replay the race dates from past years (2016 to 2025).
- **Models:** every forecast model for any point on the course (ECMWF, ECMWF AI, GFS, ICON, UK Met Office, Météo-France, GEM and JMA), the consensus, trigger lines, and how well the models agree.
- The consensus is the middle value of all the models. "Getting close" also lights up when any single model reaches a trigger. Temperatures are adjusted for the height of each point.
- **Phone alerts:** the hourly weather watch sends a phone notification (ntfy app) when a trigger gets closer or eases, when a BOM warning is issued near the course, and a 6 am summary each day from 30 October to the end of the race. Race weekend alerts start as soon as the forecast reaches it.
- Lightning isn't included yet (it needs a paid lightning feed).

**Medical** (password protected, for the medical team and race control)

- The race medical plan: who is on duty at each station, runner numbers per hour, where the medical vehicles are, and the movements in the next 2 hours.
- Follows the clock live during the event (Thu 5 to Sun 8 November, Melbourne time). Before or after, it shows a sample time. The slider, quick jumps and **Play** step through the weekend for planning.
- On a laptop the plan and a map sit side by side. On a phone the map sits on top.
- Safety Officer posts also appear on the Find map as SO markers, highlighted when on post.
- Once unlocked, Find also shows the nearest medics on duty to the casualty, and the vehicles.
- The plan is stored encrypted, so it can't be read from the public site without the password. Each device asks once and remembers until someone taps Lock.

**Admin** (`admin.html`, for the Race Director or safety lead)

- The original planning map, with the access point editor and adjustable assumptions.
- Staff never see this. Edits stay on your device until you publish them (see below).

## Using it offline

Open the app once with signal and it saves itself to the device. After that, Find and the Run sheet work with no signal. Map tiles are saved as you view them, so it's worth zooming along the course once before race day. what3words lookups need signal.

On a phone, use **Add to Home Screen** so it opens like an app.

## Hosting

The app is live at **https://singletrackevents.github.io/GPT100Safety/** through GitHub Pages, publishing from the `main` branch. Anything merged into `main` goes live within a couple of minutes.

It's a plain static site with no build step. Offline mode needs the site served over https, which GitHub Pages does.

## Updating access points

1. Open `admin.html`, click **Edit access points**, and add, edit or delete points.
2. Press **Publish file**. This downloads `access-edits.js`.
3. Replace `data/access-edits.js` on the `main` branch with the downloaded file and commit it.

Every staff device picks up the change next time it opens the app with signal.

## Updating the course

When there's a new GPX (a course change, or next year's course), run:

```
python3 tools/update_course.py path/to/course.gpx
```

Then run `python3 tools/add_w3w.py` to give any new points a what3words address.

The update script replaces the route, re-measures the km of every access point, and marks the aid stations from the GPX waypoints (any waypoint with "Aid Station" in its name). If an aid station has no access point nearby, it prints a warning. Add that point with its drive times, then run it again. Check the Run sheet afterwards and commit `data/course.js`.

Where the course passes the same spot twice, such as the out and back to Jimmy Creek Camp, the app works that out automatically and shows both km.

## Adding a course

```
python3 tools/add_course.py path/to/course.gpx 14k GPT14k "14k and 6k" "The 6k runs on part of this course."
```

The GPX waypoints (aid stations, water points, checkpoints) become the course's sections, with what3words addresses. For every access point near the course, the tool works out the real walk to the course along OpenStreetMap footpaths, tracks and streets (up to 2.5 km), once for each time the course passes nearby. No straight-line guesses. Running it again with the same ID replaces that course. An access point that only makes sense for one course can be limited to it with `"courses": ["14k"]` in `data/course.js` (for example Mt Victory Rd at Barrys Creek); the tool then needs running again to work out its walks.

## Updating the medical plan or its password

```
MEDPLAN_PASSWORD='new password' node tools/encrypt_medplan.mjs path/to/GPT100_MedicalPlan_Interactive.html
```

This replaces `data/medplan.enc.js`. Commit that file only, never the plan itself (`.gitignore` blocks it). Changing the password asks every device for the new one.

## Weather watch

`.github/workflows/weather.yml` runs `tools/weather_watch.mjs` every hour on GitHub Actions. It fetches the forecast models from Open-Meteo every 3 hours (they only update a few times a day), and the CFA fire ratings, BOM warnings (from the Bureau's anonymous FTP service) and the air quality forecast every hour. It publishes the results to the `weather-data` branch, which the Weather tab reads. The branch holds only the latest results, so it doesn't grow.

- **Phone alerts:** install the ntfy app (iPhone or Android), subscribe to a private topic name only you know, then add that name as a repository secret called `NTFY_TOPIC` (Settings, Secrets and variables, Actions). Anyone who should get alerts subscribes to the same topic.
- **Run it now:** Actions, Weather watch, Run workflow (tick "Fetch every forecast model now" to refresh the models straight away).
- **Commercial use:** the free Open-Meteo service is for non-commercial use. With a paid Open-Meteo licence, add the key as a secret called `OPEN_METEO_KEY`.
- **Triggers, models and dates** are set in `data/config.js` under `weather`. Runner pacing is in `data/pacing.js`.
- If the watch stops, the Weather tab warns that the data is old, and GitHub emails the repository owner when a run fails.

## Settings

`data/config.js` holds the bases, the timing assumptions (walk pace, stretcher pace, climb penalty, drive factor) and the green, amber and red thresholds.

The what3words API key lives in `config.js`, so every device can look up what3words addresses with no setup. The key is locked in the what3words dashboard to `singletrackevents.github.io`, so it only works from the live site and is useless to anyone who copies it. If the app ever moves to a new address, add that address to the key's allowed list first. what3words lookups won't work when testing from your own computer unless you add that address too.

## How the estimates work

For each base (Halls Gap, Jimmy Creek, Dunkeld), the app checks every access point: the drive time, plus the walk from the car park to the course and along the course to the casualty (12 min/km, plus 0.1 min for every metre climbed). It picks the fastest option for each base, then ranks the bases.

Drive times come from three places, in this order of trust:

- **Race team times**, entered by hand for gated and 4WD access. Used exactly.
- **Checked routes** from Valhalla, an open-source router that allows for gravel and winding roads. Used exactly. `tools/drive_routes.py` fetches them and `tools/apply_drive_routes.py` applies reviewed results.
  Where a route has to use a gated or forestry track the routers won't drive, `tools/extend_routes.py` follows the track from OpenStreetMap to the access point.
- **Older automatic times** from OSRM, which is optimistic on gravel, so the app adds 20% (the drive factor in `config.js`).

These are planning estimates. Always check access, gates and closures on the day.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Staff app (Find, Run sheet, Weather and Medical) |
| `admin.html` | Planning map and access point editor |
| `js/engine.js` | Response calculations, shared by Find and Run sheet |
| `js/app.js` | Staff app screens |
| `css/app.css` | Staff app styles, including the print layout |
| `data/course.js` | Course route, bases, access points and crossings |
| `data/access-edits.js` | Published access point changes |
| `data/config.js` | Bases, assumptions and thresholds |
| `js/weather.js`, `js/weather-core.js` | Weather tab, and the trigger logic shared with the weather watch |
| `data/pacing.js` | Fastest and slowest runner times for the simulator |
| `tools/weather_watch.mjs`, `.github/workflows/weather.yml` | Hourly weather watch and phone alerts |
| `sw.js`, `manifest.webmanifest` | Offline support and Add to Home Screen |

## Coming later

- **Race Control board**: incident log with timers, team status and an end-of-day export.
- **Field pocket app**: GPS "you are at km X", nearest way out, and send-my-location by SMS.
