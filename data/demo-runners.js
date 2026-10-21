// The made-up field for the in-app demo (js/demo.js): open any app with ?demo=1 and the race plays live in the
// browser, GPS trackers and timing chips both, with no feed links, Worker or local server. Made by
// tools/make_demo_runners.mjs (seed 2026); edit by hand if you want, the demo reads only this file.
//
// pace: where the runner sits between the fastest runner (0) and the cut-offs (1) in data/pacing.js.
// case (and the course km it happens at), to show what the apps do when a feed drops out:
//   nogps    no tracker, the chips place them
//   quiet    tracker went quiet, the chips carry on
//   stopped  stopped, tracker still sending (not moving, then late at the next checkpoint)
//   lost     tracker lost and stopped (overdue at the next checkpoint)
//   dnf      withdrew at a checkpoint
//   missed   missed by the chip reader at a checkpoint
//   off      wandered off the course and stopped
// Everyone else runs normally with a tracker and chips. The km for each case is chosen so that it has just happened,
// or is about to, 9 hours into the Miler (the demo's default time).
// contests: each race in the list, its start time (Melbourne) and its start and finish aid stations on the GPT100.
window.GPT100_DEMO = {
  contests: {
    'GPT100 Miler': { start: '2026-11-06T08:00', from: 'Mt Zero (Start)', to: 'Dunkeld (Finish)' },
    'Stage 2': { start: '2026-11-06T05:50', from: 'Halls Gap', to: 'Mt William Carpark' }
  },
  runners: [
  { bib: 1001, name: "Lucas Nguyen", contest: "GPT100 Miler", pace: 0.63 },
  { bib: 1002, name: "Taylor Fox", contest: "GPT100 Miler", pace: 0.72 },
  { bib: 1003, name: "Blake Nair", contest: "GPT100 Miler", pace: 0.38 },
  { bib: 1004, name: "Chloe Hill", contest: "GPT100 Miler", pace: 0.30, case: 'nogps' },
  { bib: 1005, name: "Noah Webb", contest: "GPT100 Miler", pace: 0.32 },
  { bib: 1006, name: "Harper Shaw", contest: "GPT100 Miler", pace: 0.82, case: 'quiet', km: 36.7 },
  { bib: 1007, name: "Tess King", contest: "GPT100 Miler", pace: 0.32 },
  { bib: 1008, name: "Noah Moore", contest: "GPT100 Miler", pace: 0.73, case: 'missed', km: 30.1 },
  { bib: 1009, name: "Mia Vance", contest: "GPT100 Miler", pace: 0.13 },
  { bib: 1010, name: "Liam King", contest: "GPT100 Miler", pace: 0.57 },
  { bib: 1011, name: "Angus Dale", contest: "GPT100 Miler", pace: 0.51 },
  { bib: 1012, name: "Sam Adler", contest: "GPT100 Miler", pace: 0.57 },
  { bib: 1013, name: "Hannah Shaw", contest: "GPT100 Miler", pace: 0.37, case: 'nogps' },
  { bib: 1014, name: "Angus Ricci", contest: "GPT100 Miler", pace: 0.78 },
  { bib: 1015, name: "Nina Russo", contest: "GPT100 Miler", pace: 0.64, case: 'stopped', km: 43.2 },
  { bib: 1016, name: "Dan Novak", contest: "GPT100 Miler", pace: 0.79 },
  { bib: 1017, name: "Ethan Tan", contest: "GPT100 Miler", pace: 0.19, case: 'missed', km: 49.2 },
  { bib: 1018, name: "Tess Webb", contest: "GPT100 Miler", pace: 0.23 },
  { bib: 1019, name: "Oscar Okafor", contest: "GPT100 Miler", pace: 0.61 },
  { bib: 1020, name: "Marcus Tan", contest: "GPT100 Miler", pace: 0.76 },
  { bib: 1021, name: "Marcus Fox", contest: "GPT100 Miler", pace: 0.57 },
  { bib: 1022, name: "Alex Vance", contest: "GPT100 Miler", pace: 0.87, case: 'nogps' },
  { bib: 1023, name: "Jess Reid", contest: "GPT100 Miler", pace: 0.89 },
  { bib: 1024, name: "Isla Russo", contest: "GPT100 Miler", pace: 0.18, case: 'stopped', km: 63.9 },
  { bib: 1025, name: "Hannah Vance", contest: "GPT100 Miler", pace: 0.40 },
  { bib: 1026, name: "Casey Ward", contest: "GPT100 Miler", pace: 0.87, case: 'off', km: 36.3 },
  { bib: 1027, name: "Quinn Taylor", contest: "GPT100 Miler", pace: 0.75 },
  { bib: 1028, name: "Drew Ricci", contest: "GPT100 Miler", pace: 0.50 },
  { bib: 1029, name: "Freya Chen", contest: "GPT100 Miler", pace: 0.61 },
  { bib: 1030, name: "Harper Fox", contest: "GPT100 Miler", pace: 0.29 },
  { bib: 1031, name: "Elena Murphy", contest: "GPT100 Miler", pace: 0.28, case: 'nogps' },
  { bib: 1032, name: "Ethan Vance", contest: "GPT100 Miler", pace: 0.72 },
  { bib: 1033, name: "Kate Murphy", contest: "GPT100 Miler", pace: 0.39, case: 'stopped', km: 53 },
  { bib: 1034, name: "Quinn Nair", contest: "GPT100 Miler", pace: 0.54 },
  { bib: 1035, name: "Riley Mahoney", contest: "GPT100 Miler", pace: 0.55 },
  { bib: 1036, name: "Jamie Kelly", contest: "GPT100 Miler", pace: 0.60 },
  { bib: 1037, name: "Casey Moore", contest: "GPT100 Miler", pace: 0.35 },
  { bib: 1038, name: "Kai Adler", contest: "GPT100 Miler", pace: 0.46 },
  { bib: 1039, name: "Nina Dale", contest: "GPT100 Miler", pace: 0.67 },
  { bib: 1040, name: "Noah Burke", contest: "GPT100 Miler", pace: 0.46, case: 'nogps' },
  { bib: 1041, name: "Liam Bell", contest: "GPT100 Miler", pace: 0.32 },
  { bib: 1042, name: "Jamie Patel", contest: "GPT100 Miler", pace: 0.30, case: 'lost', km: 41.5 },
  { bib: 1043, name: "Isla Singh", contest: "GPT100 Miler", pace: 0.29 },
  { bib: 1044, name: "Emma Fraser", contest: "GPT100 Miler", pace: 0.26 },
  { bib: 1045, name: "Harper Ross", contest: "GPT100 Miler", pace: 0.86 },
  { bib: 1046, name: "Sarah Singh", contest: "GPT100 Miler", pace: 0.37 },
  { bib: 1047, name: "Maeve Novak", contest: "GPT100 Miler", pace: 0.63 },
  { bib: 1048, name: "Oscar Bell", contest: "GPT100 Miler", pace: 0.64 },
  { bib: 1049, name: "Kate Kelly", contest: "GPT100 Miler", pace: 0.56, case: 'nogps' },
  { bib: 1050, name: "Casey Patel", contest: "GPT100 Miler", pace: 0.18 },
  { bib: 1051, name: "Alex Nguyen", contest: "GPT100 Miler", pace: 0.38, case: 'lost', km: 37.9 },
  { bib: 1052, name: "Ruby Nair", contest: "GPT100 Miler", pace: 0.36 },
  { bib: 1053, name: "Ethan Walsh", contest: "GPT100 Miler", pace: 0.40 },
  { bib: 1054, name: "Oscar McLeod", contest: "GPT100 Miler", pace: 0.69 },
  { bib: 1055, name: "Chloe Costa", contest: "GPT100 Miler", pace: 0.46 },
  { bib: 1056, name: "Jess Mahoney", contest: "GPT100 Miler", pace: 0.49 },
  { bib: 1057, name: "Matt Hart", contest: "GPT100 Miler", pace: 0.44 },
  { bib: 1058, name: "Ben Ferrari", contest: "GPT100 Miler", pace: 0.56, case: 'quiet', km: 45.8 },
  { bib: 1059, name: "Ava Ferrari", contest: "GPT100 Miler", pace: 0.56 },
  { bib: 1060, name: "Sarah Young", contest: "GPT100 Miler", pace: 0.41, case: 'dnf', km: 35.3 },
  { bib: 1061, name: "Kate Stone", contest: "GPT100 Miler", pace: 0.52 },
  { bib: 1062, name: "Freya Singh", contest: "GPT100 Miler", pace: 0.62 },
  { bib: 1063, name: "Nina Pike", contest: "GPT100 Miler", pace: 0.87 },
  { bib: 1064, name: "Elena Shaw", contest: "GPT100 Miler", pace: 0.53 },
  { bib: 1065, name: "Riley Patel", contest: "GPT100 Miler", pace: 0.55 },
  { bib: 1066, name: "Jack Taylor", contest: "GPT100 Miler", pace: 0.45 },
  { bib: 1067, name: "Lily King", contest: "GPT100 Miler", pace: 0.40, case: 'quiet', km: 52.1 },
  { bib: 1068, name: "Sam Ferrari", contest: "GPT100 Miler", pace: 0.49 },
  { bib: 1069, name: "Hugo Sato", contest: "GPT100 Miler", pace: 0.71, case: 'dnf', km: 30.1 },
  { bib: 1070, name: "Zoe Hughes", contest: "GPT100 Miler", pace: 0.90 },
  { bib: 2201, name: "Marcus Ferrari", contest: "Stage 2", pace: 0.87 },
  { bib: 2202, name: "Tess Reid", contest: "Stage 2", pace: 0.39 },
  { bib: 2203, name: "Quinn Hill", contest: "Stage 2", pace: 0.32 },
  { bib: 2204, name: "Freya Hill", contest: "Stage 2", pace: 0.68, case: 'nogps' },
  { bib: 2205, name: "Chloe Okafor", contest: "Stage 2", pace: 0.22 },
  { bib: 2206, name: "Nina Ferrari", contest: "Stage 2", pace: 0.81 },
  { bib: 2207, name: "Chloe Hughes", contest: "Stage 2", pace: 0.60 },
  { bib: 2208, name: "Ethan Wright", contest: "Stage 2", pace: 0.37 },
  { bib: 2209, name: "Bec Patel", contest: "Stage 2", pace: 0.15 },
  { bib: 2210, name: "Freya Ferrari", contest: "Stage 2", pace: 0.31 },
  { bib: 2211, name: "Angus Burke", contest: "Stage 2", pace: 0.44, case: 'stopped', km: 80.8 },
  { bib: 2212, name: "Bec Burke", contest: "Stage 2", pace: 0.21 },
  { bib: 2213, name: "Lucas Stone", contest: "Stage 2", pace: 0.59 },
  { bib: 2214, name: "Casey Lowe", contest: "Stage 2", pace: 0.78 },
  { bib: 2215, name: "Matt Pike", contest: "Stage 2", pace: 0.47 },
  { bib: 2216, name: "Taylor Fraser", contest: "Stage 2", pace: 0.59 },
  { bib: 2217, name: "Marcus Wright", contest: "Stage 2", pace: 0.44 },
  { bib: 2218, name: "Chloe Blake", contest: "Stage 2", pace: 0.49 }
  ]
};
