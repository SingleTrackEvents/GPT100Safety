// Races for the runner app, from the GPT Course Details sheet (tools/import_races.mjs). Melbourne local time.
// km, up and down are the official race figures; the app maps them onto the course line by aid station.
window.GPT_RACES = {
 "stages": {
  "miler": {
   "id": "miler",
   "label": "Miler",
   "points": [
    {
     "name": "Mount Zero",
     "kind": "start",
     "km": 0,
     "up": 0,
     "down": 0,
     "first": "2026-11-06T08:00",
     "cutoff": "2026-11-06T08:00",
     "drop": false,
     "crew": "yes"
    },
    {
     "name": "Copper Mine Track",
     "kind": "water",
     "km": 6.35,
     "up": 315,
     "down": 235,
     "first": "2026-11-06T08:37",
     "cutoff": "2026-11-06T09:30",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "GAR Trailhead",
     "kind": "aid",
     "km": 15.5,
     "up": 600,
     "down": 600,
     "first": "2026-11-06T09:26",
     "cutoff": "2026-11-06T12:00",
     "drop": false,
     "crew": "yes"
    },
    {
     "name": "Ridgeline Water Point",
     "kind": "water",
     "km": 28.7,
     "up": 1360,
     "down": 900,
     "first": "2026-11-06T10:56",
     "cutoff": "2026-11-06T16:30",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "Mt Difficult Rd",
     "kind": "aid",
     "km": 35.5,
     "up": 1700,
     "down": 1270,
     "first": "2026-11-06T11:34",
     "cutoff": "2026-11-06T17:00",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "Halls Gap",
     "kind": "aid",
     "km": 49.5,
     "up": 2000,
     "down": 2040,
     "first": "2026-11-06T12:49",
     "cutoff": "2026-11-06T20:00",
     "drop": true,
     "crew": "yes"
    },
    {
     "name": "Rosea car park",
     "kind": "aid",
     "km": 59.2,
     "up": 2650,
     "down": 2310,
     "first": "2026-11-06T14:06",
     "cutoff": "2026-11-06T23:00",
     "drop": false,
     "crew": "yes"
    },
    {
     "name": "Borough Huts camp",
     "kind": "aid",
     "km": 72,
     "up": 3090,
     "down": 3055,
     "first": "2026-11-06T15:31",
     "cutoff": "2026-11-07T02:15",
     "drop": false,
     "crew": "yes"
    },
    {
     "name": "Mt William car park",
     "kind": "aid",
     "km": 86.6,
     "up": 4350,
     "down": 3665,
     "first": "2026-11-06T17:52",
     "cutoff": "2026-11-07T08:15",
     "drop": true,
     "crew": "yes"
    },
    {
     "name": "Stockyard Track",
     "kind": "checkpoint",
     "km": 99.5,
     "up": 5058,
     "down": 4395,
     "first": "2026-11-06T19:52",
     "cutoff": "2026-11-07T12:45",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "Jimmy Creek Camp",
     "kind": "aid",
     "km": 106.7,
     "up": 5125,
     "down": 5065,
     "first": "2026-11-06T20:27",
     "cutoff": "2026-11-07T14:30",
     "drop": true,
     "crew": "yes"
    },
    {
     "name": "Yarram Gap Rd",
     "kind": "emergency",
     "km": 118.5,
     "up": 5705,
     "down": 5625,
     "first": "2026-11-06T22:10",
     "cutoff": "2026-11-07T18:30",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "Griffin Fireline",
     "kind": "aid",
     "km": 130.7,
     "up": 6145,
     "down": 6115,
     "first": "2026-11-06T23:53",
     "cutoff": "2026-11-07T22:15",
     "drop": true,
     "crew": "shuttle"
    },
    {
     "name": "Cassidys Gap Rd",
     "kind": "aid",
     "km": 142,
     "up": 6595,
     "down": 6485,
     "first": "2026-11-07T01:28",
     "cutoff": "2026-11-08T02:00",
     "drop": false,
     "crew": "shuttle"
    },
    {
     "name": "Bainggug car park",
     "kind": "aid",
     "km": 152.8,
     "up": 7245,
     "down": 7215,
     "first": "2026-11-07T03:23",
     "cutoff": "2026-11-08T06:30",
     "drop": false,
     "crew": "shuttle"
    },
    {
     "name": "Dunkeld",
     "kind": "finish",
     "km": 163,
     "up": 7700,
     "down": 7700,
     "first": "2026-11-07T04:47",
     "cutoff": "2026-11-08T10:00",
     "drop": true,
     "crew": "yes"
    }
   ]
  },
  "s1": {
   "id": "s1",
   "label": "Stage 1",
   "points": [
    {
     "name": "Mount Zero",
     "kind": "start",
     "km": 0,
     "up": 0,
     "down": 0,
     "first": "2026-11-05T06:00",
     "cutoff": "2026-11-05T06:00",
     "drop": false,
     "crew": "yes"
    },
    {
     "name": "Copper Mine Track",
     "kind": "water",
     "km": 6.35,
     "up": 315,
     "down": 235,
     "first": "2026-11-05T06:32",
     "cutoff": "2026-11-05T07:45",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "GAR Trailhead",
     "kind": "aid",
     "km": 15.5,
     "up": 600,
     "down": 600,
     "first": "2026-11-05T07:15",
     "cutoff": "2026-11-05T10:00",
     "drop": false,
     "crew": "yes"
    },
    {
     "name": "Ridgeline Water Point",
     "kind": "water",
     "km": 28.7,
     "up": 1360,
     "down": 900,
     "first": "2026-11-05T08:45",
     "cutoff": "2026-11-05T15:00",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "Mt Difficult Rd",
     "kind": "aid",
     "km": 35.5,
     "up": 1700,
     "down": 1270,
     "first": "2026-11-05T09:05",
     "cutoff": "2026-11-05T16:00",
     "drop": true,
     "crew": "no"
    },
    {
     "name": "Halls Gap",
     "kind": "finish",
     "km": 49.5,
     "up": 2000,
     "down": 2040,
     "first": "2026-11-05T10:05",
     "cutoff": "2026-11-05T19:00",
     "drop": true,
     "crew": "yes"
    }
   ]
  },
  "s2": {
   "id": "s2",
   "label": "Stage 2",
   "points": [
    {
     "name": "Halls Gap",
     "kind": "start",
     "km": 0,
     "up": 0,
     "down": 0,
     "first": "2026-11-06T05:50",
     "cutoff": "2026-11-06T05:50",
     "drop": false,
     "crew": "yes"
    },
    {
     "name": "Rosea car park",
     "kind": "aid",
     "km": 9.7,
     "up": 650,
     "down": 270,
     "first": "2026-11-06T06:40",
     "cutoff": "2026-11-06T08:50",
     "drop": false,
     "crew": "yes"
    },
    {
     "name": "Borough Huts camp",
     "kind": "aid",
     "km": 22.5,
     "up": 1090,
     "down": 1015,
     "first": "2026-11-06T07:40",
     "cutoff": "2026-11-06T12:20",
     "drop": false,
     "crew": "yes"
    },
    {
     "name": "Mt William car park",
     "kind": "finish",
     "km": 37.1,
     "up": 2350,
     "down": 1625,
     "first": "2026-11-06T09:20",
     "cutoff": "2026-11-06T18:00",
     "drop": true,
     "crew": "yes"
    }
   ]
  },
  "s3": {
   "id": "s3",
   "label": "Stage 3",
   "points": [
    {
     "name": "Mt William car park",
     "kind": "start",
     "km": 0,
     "up": 0,
     "down": 0,
     "first": "2026-11-07T06:00",
     "cutoff": "2026-11-07T06:00",
     "drop": false,
     "crew": "yes"
    },
    {
     "name": "Stockyard Track",
     "kind": "checkpoint",
     "km": 12.9,
     "up": 708,
     "down": 730,
     "first": "2026-11-07T07:40",
     "cutoff": "2026-11-07T10:30",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "Jimmy Creek Rd",
     "kind": "aid",
     "km": 20.1,
     "up": 775,
     "down": 1400,
     "first": "2026-11-07T07:55",
     "cutoff": "2026-11-07T12:00",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "Yarram Gap Rd",
     "kind": "emergency",
     "km": 31.9,
     "up": 1355,
     "down": 1960,
     "first": "2026-11-07T08:45",
     "cutoff": "2026-11-07T15:00",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "Griffin Fireline",
     "kind": "finish",
     "km": 44,
     "up": 1795,
     "down": 2450,
     "first": "2026-11-07T09:40",
     "cutoff": "2026-11-07T18:00",
     "drop": true,
     "crew": "no"
    }
   ]
  },
  "s4": {
   "id": "s4",
   "label": "Stage 4",
   "points": [
    {
     "name": "Griffin Fireline",
     "kind": "start",
     "km": 0,
     "up": 0,
     "down": 0,
     "first": "2026-11-08T06:30",
     "cutoff": "2026-11-08T07:00",
     "drop": false,
     "crew": "yes"
    },
    {
     "name": "Cassidys Gap Rd",
     "kind": "aid",
     "km": 11.3,
     "up": 450,
     "down": 370,
     "first": "2026-11-08T07:20",
     "cutoff": "2026-11-08T10:00",
     "drop": false,
     "crew": "yes"
    },
    {
     "name": "Bainggug car park",
     "kind": "aid",
     "km": 22.1,
     "up": 1100,
     "down": 1100,
     "first": "2026-11-08T08:30",
     "cutoff": "2026-11-08T13:30",
     "drop": false,
     "crew": "yes"
    },
    {
     "name": "Dunkeld",
     "kind": "finish",
     "km": 32.3,
     "up": 1555,
     "down": 1585,
     "first": "2026-11-08T09:20",
     "cutoff": "2026-11-08T17:00",
     "drop": true,
     "crew": "yes"
    }
   ]
  },
  "14k": {
   "id": "14k",
   "label": "14k",
   "points": [
    {
     "name": "Halls Gap",
     "kind": "start",
     "km": 0,
     "up": 0,
     "down": 0,
     "first": "2026-11-05T06:30",
     "cutoff": "2026-11-05T06:30",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "Wonderland Trailhead",
     "kind": "water",
     "km": 5.4,
     "up": 185,
     "down": 177,
     "first": "2026-11-05T06:54",
     "cutoff": "2026-11-05T07:40",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "Wonderland Carpark",
     "kind": "aid",
     "km": 10.6,
     "up": 666,
     "down": 482,
     "first": "2026-11-05T07:24",
     "cutoff": "2026-11-05T08:55",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "Halls Gap",
     "kind": "finish",
     "km": 13.8,
     "up": 700,
     "down": 700,
     "first": "2026-11-05T07:37",
     "cutoff": "2026-11-05T10:00",
     "drop": false,
     "crew": "no"
    }
   ]
  },
  "6k": {
   "id": "6k",
   "label": "6k",
   "points": [
    {
     "name": "Halls Gap",
     "kind": "start",
     "km": 0,
     "up": 0,
     "down": 0,
     "first": "2026-11-05T07:15",
     "cutoff": "2026-11-05T07:15",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "Halls Gap",
     "kind": "finish",
     "km": 5.8,
     "up": 187,
     "down": 187,
     "first": "2026-11-05T07:40",
     "cutoff": "2026-11-05T10:00",
     "drop": false,
     "crew": "no"
    }
   ]
  },
  "5k": {
   "id": "5k",
   "label": "5k",
   "points": [
    {
     "name": "Dunkeld",
     "kind": "start",
     "km": 0,
     "up": 0,
     "down": 0,
     "first": "2026-11-08T07:30",
     "cutoff": "2026-11-08T07:30",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "Dunkeld",
     "kind": "finish",
     "km": 5,
     "up": 30,
     "down": 30,
     "first": "2026-11-08T07:48",
     "cutoff": "2026-11-08T09:00",
     "drop": false,
     "crew": "no"
    }
   ]
  },
  "2k": {
   "id": "2k",
   "label": "2k",
   "points": [
    {
     "name": "Dunkeld",
     "kind": "start",
     "km": 0,
     "up": 0,
     "down": 0,
     "first": "2026-11-08T08:30",
     "cutoff": "2026-11-08T08:30",
     "drop": false,
     "crew": "no"
    },
    {
     "name": "Dunkeld",
     "kind": "finish",
     "km": 2,
     "up": 18,
     "down": 18,
     "first": "2026-11-08T08:38",
     "cutoff": "2026-11-08T09:30",
     "drop": false,
     "crew": "no"
    }
   ]
  }
 },
 "races": [
  {
   "id": "miler",
   "label": "GPT100 Miler",
   "short": "Miler",
   "course": "100",
   "stages": [
    "miler"
   ]
  },
  {
   "id": "stage",
   "label": "Stage race (4 days)",
   "short": "Stage race",
   "course": "100",
   "stages": [
    "s1",
    "s2",
    "s3",
    "s4"
   ]
  },
  {
   "id": "50k",
   "label": "GPT50k",
   "short": "50k",
   "course": "100",
   "stages": [
    "s1"
   ]
  },
  {
   "id": "33k",
   "label": "GPT33k",
   "short": "33k",
   "course": "100",
   "stages": [
    "s4"
   ]
  },
  {
   "id": "14k",
   "label": "GPT14k",
   "short": "14k",
   "course": "14k",
   "stages": [
    "14k"
   ]
  },
  {
   "id": "6k",
   "label": "GPT6k",
   "short": "6k",
   "course": "6k",
   "stages": [
    "6k"
   ]
  },
  {
   "id": "5k",
   "label": "5k Family Race",
   "short": "5k",
   "course": "5k",
   "stages": [
    "5k"
   ]
  },
  {
   "id": "2k",
   "label": "2k Kids Trail",
   "short": "2k",
   "course": "2k",
   "stages": [
    "2k"
   ]
  }
 ]
};
