// Runner pacing for the weather simulator and the "runners on course" checks.
// From the GPT_2026 Course Details sheet (Miler): fastest = first runner's time of day, slowest = cut-off.
// km is GPT100 km in this app. The sheet's km for Ridgeline Water Point (28.7) and Stockyard Track (99)
// are placed between their neighbouring aid stations in proportion. Times are Melbourne local time.
window.GPT100_PACING = {
  miler: {
    label: 'GPT100 Miler',
    points: [
      { km: 0, name: 'Mt Zero', fast: '2026-11-06T08:00', slow: '2026-11-06T08:00' },
      { km: 6.45, name: 'Copper Mine', fast: '2026-11-06T08:37', slow: '2026-11-06T09:30' },
      { km: 15.62, name: 'GAR', fast: '2026-11-06T09:26', slow: '2026-11-06T12:00' },
      { km: 28.61, name: 'Ridgeline Water Point', fast: '2026-11-06T10:56', slow: '2026-11-06T16:30' },
      { km: 35.31, name: 'Mt Difficult Rd', fast: '2026-11-06T11:35', slow: '2026-11-06T17:00' },
      { km: 49.17, name: 'Halls Gap', fast: '2026-11-06T12:50', slow: '2026-11-06T20:00' },
      { km: 58.94, name: 'Mt Rosea', fast: '2026-11-06T14:07', slow: '2026-11-06T23:00' },
      { km: 71.67, name: 'Borough Huts', fast: '2026-11-06T15:33', slow: '2026-11-07T02:15' },
      { km: 86.36, name: 'Mt William', fast: '2026-11-06T17:54', slow: '2026-11-07T08:15' },
      { km: 98.41, name: 'Stockyard Track', fast: '2026-11-06T19:54', slow: '2026-11-07T12:45' },
      { km: 106.45, name: 'Jimmy Creek Camp', fast: '2026-11-06T20:36', slow: '2026-11-07T14:30' },
      { km: 118.21, name: 'Yarram Gap', fast: '2026-11-06T22:21', slow: '2026-11-07T18:30' },
      { km: 130.22, name: 'Griffin', fast: '2026-11-07T00:06', slow: '2026-11-07T22:15' },
      { km: 141.48, name: 'Cassidys', fast: '2026-11-07T01:41', slow: '2026-11-08T02:00' },
      { km: 152.22, name: 'Bainggug', fast: '2026-11-07T03:36', slow: '2026-11-08T06:30' },
      { km: 162.55, name: 'Dunkeld', fast: '2026-11-07T05:00', slow: '2026-11-08T10:00' }
    ]
  }
};
