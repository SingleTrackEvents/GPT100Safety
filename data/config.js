// Race-day settings shared by the staff app and the admin page.
window.GPT100_CONFIG = {
  event: 'GPT100',
  // Response bases. Keys match the drive_<key>_s fields on each access point.
  bases: [
    { key: 'hg', name: 'Halls Gap', color: '#c0392b' },
    { key: 'jc', name: 'Jimmy Creek', color: '#1b6ca8' },
    { key: 'dk', name: 'Dunkeld', color: '#1f6f4a' }
  ],
  // Estimate assumptions (same defaults as the original access map).
  walkPace: 12,     // responder on foot, min per km
  evacPace: 30,     // stretcher / carry-out, min per km on Medium or Easy track
  // Carry-out slows on the harder Parks Victoria track grades (data/track-grades.js): multiplier on evacPace by grade.
  carryFactor: { hard: 1.75, unassessed: 1.5 },
  climbPenalty: 0.10, // min per metre of ascent
  driveFactor: 1.2, // multiplier on measured drive times for access roads
  // Races on the GPT100 course, for converting a runner's race km to GPT100 km.
  // from/to are aid stations on the GPT100 course (their names in the app).
  races: [
    { id: 'miler', label: 'GPT100 Miler', from: 'Mt Zero (Start)', to: 'Dunkeld (Finish)' },
    { id: '50k', label: '50k or Stage 1', from: 'Mt Zero (Start)', to: 'Halls Gap' },
    { id: 's2', label: 'Stage 2', from: 'Halls Gap', to: 'Mt William Carpark' },
    { id: 's3', label: 'Stage 3', from: 'Mt William Carpark', to: 'Griffin Fireline' },
    { id: 's4', label: 'Stage 4 or 33k', from: 'Griffin Fireline', to: 'Dunkeld (Finish)' }
  ],
  // Run sheet ratings, in minutes to reach a casualty.
  amberMin: 60,
  redMin: 120,
  // Weather tab and the hourly weather watch (tools/weather_watch.mjs, run by GitHub Actions).
  // Triggers follow the Risk Management Plan v3.2, section 5. "close" is the getting-close level.
  weather: {
    // Where the hourly watch publishes its results (a separate branch, so the site isn't rebuilt every hour).
    dataUrl: 'https://raw.githubusercontent.com/SingleTrackEvents/GPT100Safety/weather-data/',
    // The weather refresh relay (Cloudflare Worker, tools/REFRESH_WORKER.md). Blank hides the Refresh now button.
    refreshUrl: 'https://gpt100-refresh.chad-ad3.workers.dev',
    event: { start: '2026-11-05T06:00', end: '2026-11-08T17:00' },  // first start to last cut-off
    alertsFrom: '2026-10-30T00:00',  // phone alerts from course marking onwards
    dailyUpdate: { from: '2026-10-29', hour: 9 },  // a draft of the 10 am weather update to your phone each morning, race week
    districts: ['Wimmera', 'South West'],  // CFA fire districts and BOM warning areas for the course
    ridgeMinEle: 600,  // course points at or above this height (m) count as ridges and high ground
    staleHours: 3,     // warn when the latest data is older than this
    // Forecast models on Open-Meteo. Models with nothing for the course are skipped automatically.
    // (BOM ACCESS-G is on Open-Meteo but has no data for the Grampians, so it's left out. ECMWF AI has no gusts or storm energy.)
    models: ['ecmwf_ifs025', 'ecmwf_aifs025_single', 'gfs_seamless', 'icon_seamless', 'ukmo_seamless',
      'meteofrance_seamless', 'gem_seamless', 'jma_seamless', 'cma_grapes_global'],
    modelEveryHours: 3,  // the models update a few times a day, so fetch them every 3 hours
    replayYears: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],  // past race dates for the simulator
    // Ensemble forecasts (about 210 versions of the ECMWF, ECMWF AI, GFS, UK Met Office, ICON and GEM forecasts) give the
    // chance of each trigger. A trigger shows "getting close" when at least closeChance % of them reach it.
    // Only ECMWF, GFS and the UK Met Office carry gusts, and only those plus GEM carry storm energy.
    ensembles: { models: ['ecmwf_ifs025', 'ecmwf_aifs025', 'gfs025', 'ukmo_global_ensemble_20km', 'icon_seamless', 'gem_global'], everyHours: 6, closeChance: 30 },
    // Model check: each model's forecasts are compared with the BOM stations near the course over the last `days` days.
    // A model with at least minHours checked hours is weighted in the consensus by its error against the best model, no lower than minWeight.
    verify: { days: 7, minHours: 48, minWeight: 0.4 },
    obsRadiusKm: 60,        // live BOM observations from weather stations this close to the course
    incidentKm: 40,         // VicEmergency fires, burns and incidents this close to the course
    fireNearKm: 20,         // a bushfire this close counts as the fire trigger met; a planned burn as smoke getting close
    bomForecastPlaces: ['Halls Gap', 'Stawell', 'Ararat', 'Horsham', 'Dunkeld', 'Hamilton'],
    epaSites: 3, epaMaxKm: 60,  // EPA AirWatch monitors: the nearest, plus others within 60 km (needs the EPA_KEY secret)
    // BOM warnings that name any of these count as near the course.
    warningWords: ['Wimmera', 'South West', 'Grampians', 'Glenelg', 'Wannon', 'Halls Gap', 'Dunkeld', 'Stawell', 'Horsham', 'Hamilton', 'Ararat'],
    triggers: {
      heat: { met: 36, close: 32, wbgtMet: 30, wbgtClose: 28 },
      wind: { met: 60, close: 50, proposed: true },       // gusts km/h on ridges
      rain: { met: 40, close: 20 },                       // mm in 24 hours
      cold: { met: 0, close: 3, rainMm: 1, windKmh: 40, hours: 3, proposed: true }, // feels-like °C on ridges overnight
      storm: { close: 2, met: 3, capeClose: 800, proposed: true }, // models showing a thunderstorm
      smoke: { met: 150, close: 100, proposed: true },    // PM2.5 air quality index
      // Advisory, not an RMP trigger: the high ground (course above 850 m in each zone) in cloud for 3 hours or more,
      // in at least half the models, while runners are there. rh = humidity that counts as cloud.
      cloud: { hours: 3, agree: 50, rh: 93, minEle: 850, advisory: true,
        zones: [{ name: 'Mt Rosea', fromKm: 61, toKm: 65.5 }, { name: 'Mt William and the Major Mitchell Plateau', fromKm: 79, toKm: 100 }] },
      fire: {}                                            // Total Fire Ban, or Extreme / Catastrophic rating
    }
  },
  // Live runner positions, from two feeds that cover for each other (js/tracking.js, js/timing.js, tools/TIMING.md).
  // GPS trackers (GPS-seuranta, tulospalvelu.fi): url is the public tracking page, for the Live tracking button.
  // gps is the event's id from that link (the last part of the address, e.g. 20260328buffalostamp); the app then
  // reads the runners' positions through the Worker's /gps/ relay. Leave it blank until the event's link exists.
  // Timing chips (RaceResult): chip is 'relay' once the timing team's Simple API link is in the Worker as the
  // TIMING_URL secret (the link never goes in the app), or blank for none. chipEvery: seconds between reads.
  // chipPoints: timing point names the app couldn't match to a course stop by itself, e.g. { 'TP3': { km: 99.5 } }
  // (course '14k' for that course; the GPT100 otherwise). chipFields: column names, only if the feed sends rows
  // without them. For a rehearsal: node tools/gps_demo_feed.mjs, then open the app with
  // ?gps=<full address of the folder> (timing.json in the same folder is picked up), or ?chip=<address of the list>.
  tracking: { url: '', label: 'Live tracking', gps: '', chip: '', chipEvery: 30, chipPoints: {} },
  // what3words API key. It's locked in the what3words dashboard to singletrackevents.github.io,
  // so it only works from the live site. Leave blank to be asked once on each device instead.
  what3wordsKey: 'LBTPEWCQ'
};
