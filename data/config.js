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
  // Run sheet ratings, in minutes to reach a casualty.
  amberMin: 60,
  redMin: 120,
  // what3words API key. It's locked in the what3words dashboard to singletrackevents.github.io,
  // so it only works from the live site. Leave blank to be asked once on each device instead.
  what3wordsKey: 'LBTPEWCQ'
};
