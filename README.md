# GPT100 Safety

A race-day app for GPT100 event staff. It answers one question fast: **a runner needs help at this spot, who do we send and how long will it take?**

It works on a phone, tablet or laptop, and keeps working when there's no signal.

## What's in it

**Find** (for whoever takes the call)

- Type a km (`87.3`), coordinates (`-37.294, 142.601`) or what3words (`///word.word.word`). You can also use your phone's GPS or tap the map.
- You get one clear answer: which team to send, where to park (with gated roads flagged), the walk in, and the ETA.
- It also shows the backup team, the nearest aid stations either side, and how long a stretcher carry-out would take.
- **WhatsApp** opens WhatsApp with the message ready to send. Pick the safety group or a person. It includes map links for the casualty and the parking spot. The same message shows on screen, so it can also be read out over the radio.
- **Directions** opens Google Maps to the parking spot.
- If a spot takes more than 2 hours to reach, a red warning tells you to escalate early.

**Run sheet** (for briefings, aid station captains and sweeps)

- The course from aid station to aid station, rated green, amber or red by how long it takes to reach the hardest point.
- Open a section to see its access points and a km by km table. Tap any row to open it in Find.
- **Print** gives a clean A4 paper backup for vehicles and aid stations.

**Admin** (`admin.html`, for the Race Director or safety lead)

- The original planning map, with the access point editor and adjustable assumptions.
- Staff never see this. Edits stay on your device until you publish them (see below).

## Using it offline

Open the app once with signal and it saves itself to the device. After that, Find and the Run sheet work with no signal. Map tiles are saved as you view them, so it's worth zooming along the course once before race day. what3words lookups need signal.

On a phone, use **Add to Home Screen** so it opens like an app.

## Hosting

It's a plain static site with no build step. The simplest option is GitHub Pages: in the repository settings, go to **Pages** and publish from this branch's root folder. Offline mode needs the site served over https, which GitHub Pages does.

## Updating access points

1. Open `admin.html`, click **Edit access points**, and add, edit or delete points.
2. Press **Publish file**. This downloads `access-edits.js`.
3. Replace `data/access-edits.js` in the repository with the downloaded file and commit it.

Every staff device picks up the change next time it opens the app with signal.

## Settings

`data/config.js` holds the bases, the timing assumptions (walk pace, stretcher pace, climb penalty, drive factor) and the green, amber and red thresholds.

The what3words API key is left blank on purpose, so it isn't published in the repository. Each device asks for it once and remembers it. If the site is private, or the key is locked to your domain in the what3words dashboard, you can put it in `config.js` instead.

## How the estimates work

For each base (Halls Gap, Jimmy Creek, Dunkeld), the app checks every access point: the measured drive time (x 1.2 for access roads), plus the walk from the car park to the course and along the course to the casualty (12 min/km, plus 0.1 min for every metre climbed). It picks the fastest option for each base, then ranks the bases.

These are planning estimates. Always check access, gates and closures on the day.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Staff app (Find and Run sheet) |
| `admin.html` | Planning map and access point editor |
| `js/engine.js` | Response calculations, shared by Find and Run sheet |
| `js/app.js` | Staff app screens |
| `css/app.css` | Staff app styles, including the print layout |
| `data/course.js` | Course route, bases, access points and crossings |
| `data/access-edits.js` | Published access point changes |
| `data/config.js` | Bases, assumptions and thresholds |
| `sw.js`, `manifest.webmanifest` | Offline support and Add to Home Screen |

## Coming later

- **Race Control board**: incident log with timers, team status and an end-of-day export.
- **Field pocket app**: GPS "you are at km X", nearest way out, and send-my-location by SMS.
