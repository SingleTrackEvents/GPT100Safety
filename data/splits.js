// Expected splits fitted to how the field actually runs, for the runner and field apps (js/races.js).
// For each checkpoint, the share of a runner's finish time they have used when they get there is a straight line
// in their finish time: share = a + b × finish hours. Fitted to the GPT100 Miler 2025 results (Barefoot Sport export,
// 107 finishers with checkpoint times; 60 at Jimmy Creek, where the timing mat missed runners) on 23 Oct 2026.
// Points not listed (water points, Stockyard Track) are placed in proportion by race km between the fitted ones.
// Races without an entry here keep the blend of the first runner's time and the cut-off.
//
// The 2026 course adds about 1 km of flat, easy trail on the Mt William to Jimmy Creek leg and another on the
// Jimmy Creek to Yarram Gap leg (newKm, per leg). The 2025 times don't include them, so a 2026 runner with finish
// time T is taken as a 2025 runner with the time for those km taken off, and it is added back where the km sit:
// flat.minPerKm for the leader (flat.leaderHours finish), scaling with finish time.
window.GPT_SPLITS = {
  miler: {
    source: 'GPT100 Miler 2025 results, Barefoot Sport export, 107 finishers',
    flat: { minPerKm: 6, leaderHours: 20.78 },
    points: {
      'GAR Trailhead': { a: 0.0794, b: -0.00057 },
      'Mt Difficult Rd': { a: 0.1901, b: -0.00100 },
      'Halls Gap': { a: 0.2586, b: -0.00132 },
      'Rosea car park': { a: 0.3276, b: -0.00152 },
      'Borough Huts camp': { a: 0.3874, b: -0.00129 },
      'Mt William car park': { a: 0.4846, b: -0.00066 },
      'Jimmy Creek Camp': { a: 0.5973, b: 0.00017, newKm: 1 },
      'Yarram Gap Rd': { a: 0.7518, b: -0.00154, newKm: 1 },
      'Griffin Fireline': { a: 0.8135, b: -0.00143 },
      'Cassidys Gap Rd': { a: 0.8786, b: -0.00114 },
      'Bainggug car park': { a: 0.9526, b: -0.00068 },
      'Dunkeld': { a: 1, b: 0 }
    }
  }
};
