# GPT100 Safety

A race-day app for GPT100 event staff. It answers one question fast: **a runner needs help at this spot, who do we send and how long will it take?**

It works on a phone, tablet or laptop, and keeps working when there's no signal.

## What's in it

**Courses:** a picker at the top of Find switches between the GPT100 course (which the 50k, 33k and stage races also run on) and the 14k (the 6k runs on part of it). Each course has its own km, sections and checkpoints, and shares the same access points and drive routes.

**Intro:** each app (staff, field and runner) shows a short intro and how-to the first time it's opened on a phone, with a **?** button in the header to see it again (`js/intro.js` for the staff and field apps).

**Map** (`map.html`, the Map link at the top of the staff app)

- The whole course on one screen, for the big screen at race control or a phone: both courses, the aid stations and water points (named once zoomed in), access points, the response bases, helicopter landing sites, Safety Officer posts, and every tracked runner live. The layers button adds the emergency markers, camps, track hazards and the Parks Victoria track grades along the whole GPT100. The key folds away.
- Tap the course for the km, the team to send and the ETA, with the nearest tracked runners and an **Open in Find** link for the full answer.
- **Runners** opens a panel with a bib search, the Runner watch (not moving, off the course, late at the next checkpoint, tracker gone quiet), the field by section and the front and tail of each race. **Show** centres the map on a runner. `map.html#bib=1047` opens on that runner.
- **Full screen** on every map (the button under the zoom buttons on Find, Medical, Control, the map page and the field app). Where the browser has no full screen of its own (iPhone), the map is pinned over the page instead. Esc or the button again brings the page back.

**Find** (for whoever takes the call)

- **Runner's race:** on the GPT100 course, pick the runner's race (Miler, 50k or Stage 1, Stage 2, Stage 3, Stage 4 or 33k) and type the km they give. The app converts it, for example Stage 2 km 10 is GPT100 km 59.2, and shows both in the result and the message. Races are set in `data/config.js` by their start and finish aid stations.

- Type a km (`87.3`), coordinates (`-37.294, 142.601`) or what3words (`///word.word.word`). You can also use your phone's GPS or tap the map.
- You get one clear answer: which team to send, where to park (with gated roads flagged), the walk in, and the ETA.
- It also shows the backup team, the nearest aid stations either side, and how long a stretcher carry-out would take.
- **Nearest Safety Officers on foot:** the two closest Safety Officer posts on duty, with their walking time along the course. When they'd beat the team, it says to send them first, and the WhatsApp message includes them. Posts marked "stays put" are shown but not sent. It works without the medical password, live during the race (an example time before it).
- **WhatsApp** opens WhatsApp with the message ready to send. Pick the safety group or a person. It includes map links for the casualty and the parking spot. The same message shows on screen, so it can also be read out over the radio.
- **Directions** opens Google Maps to the parking spot.
- **Weather now** at the casualty: temperature, feels like, gusts and sky, the next 3 hours, any trigger getting close, and any BOM warning near the course.
- If a spot takes more than 2 hours to reach, a red warning tells you to escalate early.
- **Track and carry-out:** the Parks Victoria track grade at the casualty (Easy: mule stretcher, Medium: paraguard stretcher, Hard: slow, may need hand to hand carrying, or Not yet assessed), what the carry-out crosses on the way to the vehicle and to the aid stations either side (for example "0.3 km hard, 0.7 km medium"), and whether the access road is sealed, unsealed or 4WD only. Below that, the nearest **emergency marker** (the GNP code to give 000), the nearest **helicopter landing sites** (see below), any assembly area, and any track hazards Parks Victoria has flagged nearby. The map colours the course by grade between the aid stations either side and marks the emergency markers, campsites and hazards. The message carries the grade, stretcher type, emergency marker and nearest landing site. Carry-out times slow down on Hard track (x1.75) and track not yet assessed (x1.5), set in `data/config.js` (`carryFactor`). The data comes from the Parks Victoria "Walking track and road grades" access maps (December 2020), aligned to the course GPX (`data/track-grades.js`).
- **Elevation profile** under the map, coloured by steepness. After a find it shows the casualty's section with the distance, climb and descent to the aid stations either side. Drag along it to see any point on the map.
- **Helicopter landing sites:** the 26 sites near the course from the DEECA Wimmera District helipad list that Parks Victoria sent in October 2026, as a layer on the Find, Control and field maps (and off by default on the Medical map). Green **H** sites were used by a Parks Victoria helicopter in October 2026, so they are known to be in good condition; dark grey are current on the DEECA list (some may need vegetation cleared); light grey are expired on it. Tap one for the pad size and surface, vehicle access, hazards, last inspection, height, position and directions. Find and the field app name the two nearest within 10 km, best condition first, with what to expect there. Bainggug (Piccaninny) carries a warning: its carpark is the aid station on the Saturday and Sunday, so it can't take a helicopter then. Data in `data/helipads.js`, made by `tools/import_helipads.py` (see below).
- **Maps** on every tab open on a topo map (contours, tracks and peaks). The layers button switches to the street map and ticks layers on or off: helicopter landing sites (on), emergency markers and camps and assembly areas (off until wanted, so the map doesn't get busy). The choices are remembered on the phone.

**what3words throughout**

- Every access point, aid station and base has a what3words address stored in the app, so it shows even with no signal. Tap one to open it in the what3words app, which can navigate there.
- Search by what3words, with suggestions near the course as you type. If a word is misheard or the address lands a long way from the course, the app suggests likely alternatives near the race.
- With signal, the casualty's what3words is looked up and added to the result, the message and the WhatsApp text, along with the parking spot's what3words.

**Live runner tracking** (when the GPS tracking link is set, see below)

- Every runner with a tracker is a dot on the Find map with their bib (grey when the tracker has gone quiet, red when they haven't moved for 20 minutes). Tap one for name, km and last fix.
- **Find by bib:** type `#1047` (or `bib 1047`, or just the number when it's bigger than the course km) and Find opens at that runner's last position, on their own course, with how long ago the fix was. The normal response answer follows from there.
- **Runners near this spot** on every Find result: the tracked runners within 5 km along the course either side of the casualty, with bib, km, distance and last fix, and a Find button for each. The message gets a line with the nearest bibs.
- **Medical:** runners on course now per section between aid stations, the leader and the tail, anyone not moving, and trackers gone quiet.
- **Control:** a Runner watch list (not moving, off the course, late at the next checkpoint, tracker quiet) with Find buttons, every runner on the board map, and each open incident with a bib shows where that runner's tracker is now and how far that is from the logged km.
- **Field app:** Where am I? adds Runners near you: the next runners coming towards you, nearest first, and those just past, with the runners on the field map.
- The feed is GPS-seuranta (tulospalvelu.fi), the system used at Buffalo Stampede. The app reads the event's `init.txt` (competitors) and `data.lst` (positions) through the Worker's `/gps/` relay, since the provider only serves them to its own viewer, and polls `data.php` every 15 seconds while the event is live. Without the link set, nothing changes.
- **Timing chips too** (when the timing team's RaceResult link is in the Worker, see [`tools/TIMING.md`](tools/TIMING.md)): the time each runner crossed each timing point. The two feeds cover for each other. For every runner the newest hard fix wins, GPS or chip; a fix older than a few minutes is carried forward at the runner's own pace, never past the next timing point; and a runner who should have reached the next checkpoint by now, with no fresh GPS fix showing them moving, is flagged late (past the cut-off pace, overdue) in the Control Runner watch and in Medical. Every marker, row and Find answer says which feed placed the runner and when: solid is a recent fix, dashed an estimate, grey a quiet tracker, amber late, red not moving, purple more than 150 m off the course (listed as Off the course in the Runner watch). Where the course passes close to itself (Halls Gap, the out and back to Jimmy Creek) a wobbly fix is snapped to the pass that keeps the runner going forward, so their km doesn't flick back. Runners on the same spot (at an aid station, or estimated on the same leg) are stacked in a column so every bib stays in view, and each popup names the others there. Runners the chips know but the trackers don't are on the maps as well, and finished or withdrawn runners come off the course. The timing and tracking provider (`tracking.credit` in `data/config.js`) is credited in each app's intro, next to the Live tracking button and in the tracking status line.

**Weather** (for the weather lead and race control)

- **Triggers:** the Risk Management Plan triggers (fire, wind on ridges, thunderstorms, heat, heavy rain, cold on ridges, smoke) for the next 48 hours and for race weekend. Each shows Clear, Getting close or Met, where and when, and whether runners will be there. Official BOM warnings near the course and the CFA fire ratings come first. Tap a trigger to see it on the timeline.
- **Timeline:** the whole course against time, coloured by trigger status, feels like temperature, gusts, rain, chance of rain, heat stress (WBGT), thunderstorms or cloud, with the fastest and slowest runners drawn on. Tap anywhere, or type a km and a time, for the weather at that spot.
- **Simulator:** press Play and watch the fastest runner and the slowest (the cut-offs) travel the course, with the weather where they are, then a summary of each runner's whole race: hottest, coldest feels like, strongest ridge gust, rain and any triggers. Before the forecast reaches race weekend you can move the race into the forecast, or replay the race dates from past years (2016 to 2025).
- **Models:** every forecast model for any point on the course (ECMWF, ECMWF AI, GFS, ICON, UK Met Office, Météo-France, GEM, JMA and China's CMA), the consensus, trigger lines, and how well the models agree. BOM's ACCESS-G is on Open-Meteo but has no data for the Grampians.
- **Model check:** each model's forecasts are compared with the BOM weather stations near the course (Mount William, Stawell, Horsham, Ben Nevis and others) over the past 7 days: how far off its temperature and gusts were, made 6 to 30 hours ahead. The table is at the bottom of Models. Models that have been further off count for less in the consensus (down to 0.4 of the best model's weight), once they have 48 checked hours.
- The consensus is the middle value of all the models, weighted by the model check. "Getting close" also lights up when any single model reaches a trigger. Thunderstorms are the exception: getting close needs 2 models showing one, and 3 or more meets the trigger. Temperatures are adjusted for the height of each point.
- **Phone alerts:** the hourly weather watch sends a phone notification (ntfy app) when a trigger gets closer or eases, when a BOM warning is issued near the course, and a 6 am summary each day from 30 October to the end of the race. Race weekend alerts start as soon as the forecast reaches it.
- **Ensembles:** about 210 versions of the ECMWF, ECMWF AI, GFS, UK Met Office, ICON and GEM forecasts give the chance of each trigger (for example "25% chance of gusts over 60 km/h"). Only ECMWF, GFS and the UK Met Office carry gusts, so the wind chance comes from those 100. When 30% or more of them reach a trigger, it shows as getting close. For thunderstorms, the chance is of storm energy (CAPE) reaching 800 J/kg. The Models view shows the ensemble range as a shaded band.
- **Live observations:** BOM weather stations within 60 km of the course (temperature, feels like, wind, gusts, rain since 9 am), in a table and on the map.
- **Fires, burns and incidents:** VicEmergency within 40 km of the course, on the map. A bushfire within 20 km meets the fire trigger, and a planned burn that close makes smoke getting close. New ones send a phone alert. Find also shows any within 15 km of the casualty.
- **BOM forecast:** the Bureau's own forecasts for Halls Gap, Stawell, Ararat, Horsham, Dunkeld and Hamilton.
- **Rain radar:** tap Radar on the Weather map for the last hour of rain radar, looping (RainViewer).
- **Cloud on high ground (advisory):** whether the high ground is in cloud: Mt Rosea (km 61 to 65.5) and Mt William with the Major Mitchell Plateau (km 79 to 100). Zones are set in `data/config.js`, from each model's humidity at the height of the course, plus fog and very low visibility. It shows "Advisory" when they're in cloud for 3 hours or more in at least half the models while runners are there (in the next 48 hours, whoever is up there). The card also shows the live humidity at the BOM Mount William station (near 100% means it's in cloud now). The Timeline can show cloud, Models shows each model's cloud base, and the daily update says how many hours Mt William is in cloud. It's not an RMP trigger.
- **UV index** in the Timeline and readouts.
- **EPA AirWatch** live smoke readings, once a free EPA API key is added as the `EPA_KEY` secret.
- **Share weather update:** the button at the top of Triggers writes the daily update (race weekend day by day, triggers, the next 48 hours, BOM warnings, CFA ratings, fires and burns) ready to edit and send by WhatsApp. In race week (from 29 October) the watch also sends the draft to your phone at 9 am, ready for a 10 am update. To try it now: Actions, Weather watch, Run workflow, tick "Send a draft weather update".
- Lightning isn't included yet (it needs a paid lightning feed).

**Medical** (password protected, for the medical team and race control)

- The race medical plan: who is on duty at each station, runner numbers per hour, where the medical vehicles are, and the movements in the next 2 hours.
- Follows the clock live during the event (Thu 5 to Sun 8 November, Melbourne time). Before or after, it shows a sample time. The slider, quick jumps and **Play** step through the weekend for planning.
- On a laptop the plan and a map sit side by side. On a phone the map sits on top.
- Safety Officer posts appear on the Find map for everyone as SO markers, highlighted when on post. No password is needed for these: they come from `data/safety-officers.js`, which holds only the posts and shift times, no names.
- Once unlocked, Find also shows the nearest medics on duty to the casualty, and the vehicles.
- The plan is stored encrypted, so it can't be read from the public site without the password. Each device asks once and remembers until someone taps Lock.

**Control** (Race Control board, unlocked with the medical password)

- A live board shared between race control devices: open incidents with timers (since the call, and against the expected arrival once a unit is sent, turning red when overdue), the unit board (response teams, medical vehicles and where the plan has them, Safety Officers on post, and any units you add) and a radio log.
- Log an incident from **New incident**, or from **Log incident** on a Find result, which carries over the km, coordinates and what3words. It suggests the team to send and the ETA.
- Step through Dispatched, On scene, Leaving scene and Close (with the outcome). Each step is timed, logged with who did it, and updates the unit's status on every device within a few seconds.
- Changes made without signal are kept on the device and sent when it reconnects.
- **Export** downloads all incidents and the radio log as a spreadsheet for the incident report.
- The log is kept in a database on the Cloudflare Worker, locked with the medical password. Setup: [`tools/RACE_CONTROL.md`](tools/RACE_CONTROL.md).

**Runner app** (`runner.html`, for runners and their crews; public, kept separate from the staff and field apps)

- **Intro the first time** (and from the **?** button): pick running or crewing and the race, install the app, save the map, and what each tab does. On iPhone a home screen app keeps its own storage apart from Safari, so the app asks iPhone users to install first and save the map from the installed app (saving in Safari would mean downloading it twice); there's a "Save in Safari anyway" option. On Android, Chrome's Install app button is offered when available.
- **Tabs along the bottom** (for thumbs while running): Home, Map, Aid (Crew in crew mode), Help, Schedule and Gear.
- **Home** welcomes you with a summary of your race: a countdown (or how long the race has been going), distance, climb and aid points, the start and final cut-off, your target finish (or when crews can expect their runner), what's up next on the schedule, and big buttons to the map, aid stations and help. The race picker stays at the top, and the app remembers the last tab.
- **Pick your race:** Miler, Stage race (opens on today's stage), 50k, 33k, 14k, 6k, 5k Family or 2k Kids. Distances, climb, cut-offs, drop bags and crew access come from the course sheet (`tools/import_races.mjs`).
- **I'm running:** the **Map** tab fills the screen with your race on the topo map (saved for offline) and its elevation profile in race km pinned at the bottom, as in the field app. A small round locate button on the map (like Google Maps) finds you, and the line under the profile gives your race km, the next aid station with distance, climb and descent, what's there (drop bag, crew), its cut-off, and at your pace when you'd get there. Off the course, it says which way the course is.
- **Aid stations and cut-offs:** every point with race km, leg distance and climb, cut-off, and your expected time from a target time (between the first runner's time and the cut-off).
- **I'm crewing:** just the crew points (shuttle-only ones marked), with directions, cut-offs and the runner's expected times, from their target time or from where they were last seen.
- **Help**, the safety tab, in English, Japanese, Simplified Chinese, Russian or Polish (a language picker at the top, remembered, and first set from the phone's language; **Show in English** flips the tab for crew or medics to read without changing the runner's choice). It carries the international runners' emergency card (`data/safety-cards.js`, from the v0.5 documents in Drive) rewritten around the app's own tools, so the app is the runner's safety tool and the printed card its backup:
  - **Need help?** Call 000 and Call race medical (1300 375 352), each with what it's for, then the 000 interpreter steps for runners not confident in English (say Ambulance, Victoria, then your language).
  - **Tell us where you are:** Find my 3 words shows your what3words and, always, your GPS numbers (the card says to read the numbers when English is hard, and they work with no signal); Share my location sends km, position and words by text or WhatsApp; then the three steps to give 000 or race medical, the no-signal plan, and Emergency+ as the backup.
  - **Lost or stopping:** the Map tab's locate button for how far off the course you are and which way, the markers, withdrawing through an aid station, and an Open the map button.
  - **In an emergency** (STOP, CALL, TELL, STAY), then five sections to open one at a time: snake bite, another runner needs help, weather and fire, before you start (a checklist with ticks kept on the phone, including this app installed with the map saved, and a link to the Gear tab) and show this screen. 000, 112 and the Medical Team number are tap-to-call throughout.
  - The card sentences are the checked v0.5 translations; the sentences that name the app's buttons, and the tab's own labels and status lines, are new and still need the interpreter check (see the note at the top of `data/safety-cards.js`).
- **Schedule** from gpt100.com.au, with **On now** and **Up next** at the top (refreshed every minute). Its own dropdown shows your race (and crew shuttles in crew mode), the Full schedule, or any other race. Past items are greyed and the ones on now highlighted.
- **Mandatory gear checklist** for each race from gpt100.com.au/mandatory-gear, with the spec for each item, ticks kept on the phone and a packed count. The 6k, 5k and 2k have no mandatory gear.
- The GPT6k and the Dunkeld 5k and 2k courses come from their Strava GPX files (`tools/import_gpx.mjs`, into `data/runner-courses.js`), with the turnaround shown. On out-and-back courses, the locate button tells the way out from the way back using your last fix or the race clock.
- The 14k, 50k and 33k GPX files match the course lines already in the app (within 25 to 42 m). To add or replace a course: `node tools/import_gpx.mjs <id> "<name>" file.gpx`, set the race's course to that id in `tools/import_races.mjs` and re-run it.

**Field app** (`field.html`, four tabs along the bottom: **Home**, **Map**, **Where** and **Race**; for Safety Officers, sweeps, aid station crews and medics on the course; open to all, and kept separate from the staff app with no links into it)

- **Home** (the first tab): the save-the-map card until it's saved, then a summary of the picked race: race clock or countdown, distance, climb and aid points, start and final cut-off, how many Safety Officer stations are on post now (or when shifts start), where you were at your last fix, the next three cut-offs with how long until each, and big buttons to the map, the cut-offs and Send my location.
- **Map and elevation profile** are up from the start: both courses and the aid stations on a topo map (switch to the street map with the layers button, which also ticks the helicopter landing sites, emergency markers and camps on or off), with the whole course profile underneath, coloured by steepness (under 5%, 5 to 10%, 10 to 15%, 15% and over). After Where am I?, the profile shows your section (the aid stations either side), you on it, the way ahead in blue, and the distance, climb and descent to the next aid station and back to the last. Switch between This section and Whole course. Drag along the profile, or tap the course on the map, to see any point: km, height, steepness, and how far and how much climb from you.
- **Save the map before you leave signal:** until the topo map is saved on the phone, a red card at the top asks for it. One tap saves the topo map 2 km either side of both courses (zoom 8 to 15, about 27 MB, best on wifi), with a progress bar. Then it shrinks to a green "Map saved" line. Zooming in closer enlarges the saved map; with signal, sharper tiles load on top. The saved map stays on the phone through app updates. The street map can't be saved (OpenStreetMap doesn't allow it).
- **Intro the first time** (and from **?**): what it's for, install it, save the map (iPhone users install first, as in the runner app), and how to use it.
- **Map tab:** fills the screen, with the elevation profile pinned at the bottom (no scrolling) and a small round locate button (like Google Maps). After a fix, the line under the profile gives your race km, the next aid station with distance, climb, cut-off and your pace, and the nearest way out; a big map kept to the picked race (its course in orange, its aid stations with cut-offs, the other courses faint), with Safety Officer posts, you and the way out, and the race's profile. The race stays picked until it's changed.
- **Race tab** (handy for sweeps): pick the race (and stage), as in the runner app. Every aid station with its cut-off; after Where am I? during the race, the expected time at each one comes from your position and the clock (or from a target time), and Where am I? adds your race km and the next cut-off. Shares `js/races.js` with the runner app.
- **Safety Officer posts** on the map (yellow SO, from the public `data/safety-officers.js`, no names): tap one for its shifts. During the event, posts not staffed right now are faded (refreshed every 5 minutes).
- **Your trail:** every GPS fix (with Keep updating on, as you move) is kept on the phone for 24 hours and drawn on the map as a dotted purple line, with the distance covered. Clear it any time.
- **Where am I?** One tap uses the phone's GPS: km on the course (the GPT100, or the 14k when that's nearer), between which aid stations, how far off the course, height, GPS accuracy, coordinates and what3words. No GPS? Type the km.
- **Off the course,** the answer depends on how far: up to 50 m is on the course; 50 to 300 m says "Just off the course. The course is 120 m south-west of you"; 300 m to 2 km names the access point or aid station you're at, gives the direction back, and notes that the walk-out times assume you get back onto the course first; 2 to 10 km gives the distance and nearest course point (and the base, if you're at one) with no walking times; over 10 km gives no course answers at all. The map draws a dashed line back to the course. A GPS fix worse than ±100 m says to stand in the open and try again.
- **Send my location** or **Urgent: casualty here** opens WhatsApp with the message ready (km, place, coordinates, map link, what3words, nearest vehicle access, and for urgent, the fastest team), plus an optional note.
- **Nearest way out:** the closest vehicle access by walking time (gated or not) and the drive from there to each base, and the aid stations either side.
- **Track and carry-out:** the same card as the staff app's Find, for where you are: the Parks Victoria track grade and stretcher type, what a carry-out crosses to the nearest way out and to the aid stations either side, the road grade at that access, and the nearest emergency marker (GNP code for 000), the nearest helicopter landing sites, assembly area and track hazards. The map colours the course by grade between the aid stations either side. Send my location and Urgent carry the grade, emergency marker and nearest landing site.
- **Weather here:** now and the next 3 hours, triggers, BOM warnings and fires nearby. The map shows you and the way out.
- Works offline once opened with signal (what3words and fresh weather need signal). Add it to the home screen: it opens straight to the field app.
- **Live tracking:** when the tracking link is known, put it in `data/config.js` (`tracking.url`) and a Live tracking button appears here and on the Race Control board.

**Admin** (`admin.html`, for the Race Director or safety lead)

- Password protected. Each device asks once. To change the password, follow the note at the top of `admin.html`.

- The original planning map, with the access point editor and adjustable assumptions.
- Staff never see this. Edits stay on your device until you publish them (see below).

## Using it offline

Open the app once with signal and it saves itself to the device. After that, Find works with no signal. Map tiles are saved as you view them, so it's worth zooming along the course once before race day. what3words lookups need signal.

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

The update script replaces the route, re-measures the km of every access point, and marks the aid stations from the GPX waypoints (any waypoint with "Aid Station" in its name). If an aid station has no access point nearby, it prints a warning. Add that point with its drive times, then run it again. Check a few km in Find afterwards and commit `data/course.js`.

Where the course passes the same spot twice, such as the out and back to Jimmy Creek Camp, the app works that out automatically and shows both km.

## Live runner tracking

The tracking provider gives a public link like `https://tulospalvelu.fi/gps/20260328buffalostamp/`. In `data/config.js`:

```
tracking: { url: 'https://tulospalvelu.fi/gps/<event>/', label: 'Live tracking', gps: '<event>' },
```

`url` is the Live tracking button; `gps` (the last part of the link) turns on the runner positions in the apps. The positions come through the Worker's `/gps/` relay, so the Worker needs the current `tools/refresh-worker.js` pasted in (no new secrets). Each phone fetches the whole position file once (a few MB by late in the race), then only the new bytes every 15 seconds.

### Demo: run the race in the browser

To rehearse or train before the links exist, open any of the apps with `?demo=1` (for example [the map page](https://singletrackevents.github.io/GPT100Safety/map.html?demo=1), or `index.html?demo=1`, `field.html?demo=1`). The made-up field in `data/demo-runners.js` (70 Miler runners and 18 in Stage 2, each at their own pace from the pacing table) runs the course live, as if the Miler had started 9 hours ago. Both feeds are played: `js/demo.js` answers the apps' GPS and timing requests itself, in the shapes the real feeds send, so the tracking code runs exactly as it will on the day. Nothing is fetched from the providers and nothing needs to be installed.

The bar at the bottom shows the race time, pauses, runs at 1x, 10x or 60x, jumps ahead 30 minutes, and lists **Who to find**: the runners with something going on, with a Find button each. Everyone else is running normally.

- no tracker (the chips place them), a tracker that went quiet (the chips carry on), a runner who stopped with the tracker still sending (not moving, then late at the next checkpoint), a tracker lost hours ago with the runner stopped (overdue), a withdrawal, a checkpoint that missed a runner, and a runner who wandered 300 m off the course.
- **Control** opens without the medical password while the demo is on, with its own incident log: a carry-out under way, a sweep with a sick runner, a Stage 2 runner whose tracker stopped, two closed incidents, and more calls coming in as the race runs (a collapse at 9 h 12 min, an overdue runner at 9 h 31 min). Teams go on scene and incidents close on their own timeline; anything you log, step or close on the board is kept on top for the tab.
- The race carries on across the staff app, the map page and the field app in the same browser tab. **Exit** takes the demo away. A real feed (`?gps=`, `?chip=` or the config) always wins over the demo.
- The demo feeds are read every few seconds (the real feeds keep their providers' cadence of 15 and 30 seconds), so the runners move smoothly at 10x and 60x. Even so, a runner at 5 km/h covers 5 km a minute at 60x, which is a few pixels on the whole-course view: zoom in to a section to watch them go.
- `?demo=12h` starts 12 hours into the Miler; `?demo=sat09:30` at a day and time; `&speed=10` starts fast. Not moving and late count real minutes (as they will on the day), so run at 1x to watch them come up as they would, and use 10x or 60x to watch the field move.
- `node tools/make_demo_runners.mjs [miler] [stage 2] [seed]` makes a new field; or edit the file by hand for a particular runner or case.

The older way still works, and is handy for a feed in the provider's exact files: `node tools/gps_demo_feed.mjs out/demo-gps 60 9`, then `python3 -m http.server 8765` and open `index.html?gps=http://localhost:8765/out/demo-gps/` (the folder's `timing.json` is picked up too). `?gps=` also takes an event id, which goes through the relay, so a past event (for example the Buffalo one) can be replayed on the live site without changing the config. Setting up the real timing feed: [`tools/TIMING.md`](tools/TIMING.md).

## Track grades and emergency markers

`data/track-grades.js` holds the Parks Victoria track grades along the GPT100 (by km), the road grade at each access point, and the emergency markers, helipads, assembly areas, campsites and track hazards near the course. It was read straight from the vector lines and symbols in the ten Parks Victoria "Walking track and road grades" PDFs (Mt Zero/Barigar, Gar, Werdug/Wartook, Halls Gap, Barbican, Mt William, Yarram Gap, Mt Christabel, Cassidy Gap and Mt Abrupt), each fitted to the course GPX to within a few metres, then checked by eye against the maps. To regenerate it (new maps from Parks Victoria, or a course change after `tools/update_course.py`):

```
pip install pdfplumber numpy scipy pyproj
python3 tools/track_grades/extract_maps.py path/to/pdfs out data/course.js   # one JSON per map, with the fit quality
python3 tools/track_grades/merge.py out data/course.js data/track-grades.js   # merge, apply fixes.json, write the data file
```

`extract_maps.py` needs the PDFs named as in `EXPECT` at the top of the script (the course km each map is expected around; `None` searches the whole course). `tools/track_grades/fixes.json` holds the hand corrections from the visual check (campsite names, emergency marker codes the script couldn't read, grade overrides by km range).

## Helicopter landing sites

`data/helipads.js` holds the helicopter landing sites (HLS) near the course, with the nearest GPT100 km and how far off the course each is. It comes from two files in `tools/helipads/`: the DEECA "Wimmera District Helipads" spreadsheet and A3 map (6 October 2026) that Parks Victoria sent on 20 October 2026, and `used-oct-2026.json`, the sites a Parks Victoria helicopter used in October 2026 with their precise positions (from the table in that email; two of them, Redman Road Trailhead and the bee site near Yarram Gap, aren't on the DEECA list). The spreadsheet's positions are to about 100 m. To rebuild after a new list from DEECA or Parks Victoria, or a course change:

```
pip install openpyxl
python3 tools/import_helipads.py
```

## Adding a course

```
python3 tools/add_course.py path/to/course.gpx 14k GPT14k "14k and 6k" "The 6k runs on part of this course."
```

The GPX waypoints (aid stations, water points, checkpoints) become the course's sections, with what3words addresses. For every access point near the course, the tool works out the real walk to the course along OpenStreetMap footpaths, tracks and streets (up to 2.5 km), once for each time the course passes nearby. No straight-line guesses. Running it again with the same ID replaces that course. An access point that only makes sense for one course can be limited to it with `"courses": ["14k"]` in `data/course.js` (for example Mt Victory Rd at Barrys Creek); the tool then needs running again to work out its walks.

## Updating the medical plan or its password

```
MEDPLAN_PASSWORD='new password' node tools/encrypt_medplan.mjs path/to/GPT100_MedicalPlan_Interactive.html
```

This replaces `data/medplan.enc.js` and `data/safety-officers.js` (the public Safety Officer posts, no names). Commit those two files only, never the plan itself (`.gitignore` blocks it). Changing the password asks every device for the new one.

## Weather watch

`.github/workflows/weather.yml` runs `tools/weather_watch.mjs` on GitHub Actions, trying four times an hour because GitHub sometimes drops scheduled runs. It fetches the forecast models from Open-Meteo every 3 hours (they only update a few times a day), and the CFA fire ratings, BOM warnings (from the Bureau's anonymous FTP service) and the air quality forecast every hour. It publishes the results to the `weather-data` branch, which the Weather tab reads. The branch holds only the latest results, so it doesn't grow.

- **Phone alerts:** install the ntfy app (iPhone or Android), subscribe to a private topic name only you know, then add that name as a repository secret called `NTFY_TOPIC` (Settings, Secrets and variables, Actions). Anyone who should get alerts subscribes to the same topic. To check it works: Actions, Weather watch, Run workflow, tick "Send a test phone alert".
- **Refresh now button and a reliable timer:** GitHub's own timer misses most runs, so a small free Cloudflare Worker (`tools/refresh-worker.js`) starts the watch every 15 minutes and lets anyone press **Refresh now** in the Weather tab. It holds the GitHub key as a secret, so the key is never in the app. Setup: [`tools/REFRESH_WORKER.md`](tools/REFRESH_WORKER.md). Put the Worker's address in `data/config.js` as `refreshUrl` to show the button.
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
| `index.html` | Staff app (Find, Weather, Medical and Control) |
| `js/rc.js` | Race Control board |
| `field.html`, `js/field.js`, `css/field.css` | Field app |
| `tools/CUSTOM_DOMAIN.md` | Steps to move the apps to app.gpt100.com.au |
| `tools/refresh-worker.js` | Cloudflare Worker: weather refresh relay and the Race Control database |
| `admin.html` | Planning map and access point editor |
| `js/engine.js` | Response calculations for Find, the Medical tab and Race Control |
| `js/app.js` | Staff app screens |
| `runner.html`, `js/runner.js`, `css/runner.css` | Runner app |
| `data/runner-courses.js` | Runner app courses from GPX (6k, 5k, 2k) |
| `data/races.js`, `data/runner-info.js` | Races from the course sheet, and the runner app's contact, gear and notices |
| `data/safety-cards.js` | The runner app's Help tab in five languages: the international runners' emergency card around the app's tools, and the tab's labels |
| `js/races.js` | Races, cut-offs and expected times, shared by the runner and field apps |
| `js/intro.js` | First-time intro and how-to for the staff and field apps |
| `js/viewport.js` | Keeps the bottom tabs on the real bottom of the screen (iPhone home screen apps can open with the layout the wrong height the first time) |
| `js/profile.js` | Elevation profile (Find tab and field app) |
| `js/basemap.js` | Topo and street map backgrounds for every map, and saving the topo map for offline |
| `tiles/topo/`, `data/tiles.js` | Our copy of the OpenTopoMap tiles along the course (CC-BY-SA), made once with `tools/fetch_topo_tiles.mjs` |
| `map.html`, `js/map.js` | The map page: the whole course and every tracked runner on one screen |
| `js/fullscreen.js` | Full screen button on the maps |
| `js/demo.js`, `data/demo-runners.js`, `tools/make_demo_runners.mjs` | The in-app demo: made-up runners, GPS and chips, played live (`?demo=1`) |
| `css/app.css` | Staff app styles |
| `data/course.js` | Course route, bases, access points and crossings |
| `data/access-edits.js` | Published access point changes |
| `data/config.js` | Bases, assumptions and thresholds |
| `js/weather.js`, `js/weather-core.js` | Weather tab, and the trigger logic shared with the weather watch |
| `data/pacing.js` | Fastest and slowest runner times for the simulator |
| `tools/weather_watch.mjs`, `.github/workflows/weather.yml` | Hourly weather watch and phone alerts |
| `tools/weather_extra.mjs`, `tools/weather_verify.mjs` | Ensembles, BOM observations and forecasts, VicEmergency and EPA; the model check against the BOM stations |
| `icons/` | GPT100 Miler logo: header mark, full logo (admin login) and app icons |
| `sw.js`, `manifest.webmanifest` | Offline support and Add to Home Screen |

## Coming later

- **Race Control board**: incident log with timers, team status and an end-of-day export.
- **Field pocket app**: GPS "you are at km X", nearest way out, and send-my-location by SMS.
