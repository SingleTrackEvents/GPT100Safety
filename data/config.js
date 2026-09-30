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
  evacPace: 30,     // stretcher / carry-out, min per km
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
  // what3words API key. It's locked in the what3words dashboard to singletrackevents.github.io,
  // so it only works from the live site. Leave blank to be asked once on each device instead.
  what3wordsKey: 'LBTPEWCQ'
};
