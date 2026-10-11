// Runner app details that aren't in the course sheet.
// Schedule from https://www.gpt100.com.au/schedule (2026). Times are Melbourne local time.
window.GPT_RUNNER_INFO = {
  // Race medical: shown as Call race medical. 1300 numbers can't take texts, so locations are shared instead.
  medicalPhone: '1300 375 352',
  // How a runner withdraws (only through an aid station manager).
  withdraw: 'To withdraw, tell the aid station manager at the next aid station. Never leave the course without telling them: we will search for you.',
  // Shuttle-only crew points. Placeholder until the shuttle plan is set.
  shuttleNote: 'Crew access by shuttle only. Shuttles run every 30 minutes from the crew car park (pick-up point to be confirmed).',
  // Mandatory gear, by race id (miler, stage, 50k, 33k, 14k, 6k, 5k, 2k). Each item is one line.
  gear: {},
  // Short notices shown at the top, e.g. course changes. { text: '...' }
  notices: [],
  // Event village.
  village: 'Event Village: Halls Gap Information Centre forecourt and Centenary Hall, 115 Grampians Rd, Halls Gap',
  // for: which races see it ('all', race ids, or 'crew' for crews of any race).
  schedule: [
    { day: '2026-11-04', items: [
      ['09:00', 'ASICS Shakeout Run', 'all'],
      ['10:00', 'Gear check, bib collection, tracker and drop bags (until 3 pm), Centenary Hall', 'stage 50k'],
      ['10:00', 'Gear check and bib collection (until 3 pm), Event Village', '33k 14k 6k'],
      ['11:00', 'Morning race briefing, Centenary Hall', 'stage 50k'],
      ['15:00', 'Opening Smoking Ceremony', 'all'],
      ['16:00', '50k elite panels (female 4 pm, male 4:30 pm)', 'all'],
      ['17:00', 'Stage race elite panel', 'all'],
      ['17:30', 'Afternoon race briefing, Centenary Hall', 'stage 50k'],
      ['18:00', 'Nightly meals (pasta party, book on Race Roster), Event Village forecourt', 'all'],
      ['18:30', 'Gear check, bib collection, tracker and drop bags (until 8 pm), Centenary Hall', 'stage 50k'],
      ['18:30', 'Gear check and bib collection (until 8 pm), Event Village', '33k 14k 6k']
    ] },
    { day: '2026-11-05', items: [
      ['04:15', 'Shuttle to Mount Zero departs Halls Gap', 'stage 50k'],
      ['05:00', 'Gear check and bib collection (until 7 am), Event Village', '14k 6k'],
      ['06:00', 'Race start, Mount Zero', 'stage 50k'],
      ['06:15', 'Race briefing', '14k'],
      ['06:30', 'Race start, Halls Gap', '14k'],
      ['07:00', 'Race briefing', '6k'],
      ['07:15', 'Race start, Halls Gap', '6k'],
      ['08:30', 'Prize presentations', '6k'],
      ['09:00', 'Prize presentations', '14k'],
      ['10:00', 'Course cut-off', '14k 6k'],
      ['10:15', 'Podium finishers (until 11:30 am), Halls Gap', 'stage 50k'],
      ['12:00', 'Gear check, bib collection and drop bags (until 4 pm), Centenary Hall', 'miler'],
      ['12:00', 'Gear check and bib collection (until 4 pm), Event Village', '33k'],
      ['16:30', 'Miler elite panels (female 4:30 pm, male 5 pm)', 'all'],
      ['17:30', 'Race briefing, Centenary Hall', 'miler'],
      ['18:00', 'Nightly meals (book on Race Roster), Event Village forecourt', 'all'],
      ['18:30', 'Gear check, bib collection and drop bags (until 8 pm), Centenary Hall', 'miler'],
      ['19:00', 'Course cut-off', 'stage 50k'],
      ['19:00', 'Prize presentation and age group winners, Event Village forecourt', '50k']
    ] },
    { day: '2026-11-06', items: [
      ['05:00', 'Drop bags and tracker allocation (until 5:40 am), Halls Gap', 'stage'],
      ['05:50', 'Stage 2 start, Halls Gap', 'stage'],
      ['06:00', 'Shuttle to Mount Zero departs Halls Gap', 'miler'],
      ['06:30', 'Tracker allocation (until 7:30 am), Mount Zero', 'miler'],
      ['08:00', 'Race start, Mount Zero', 'miler'],
      ['08:30', 'Crew and spectator shuttle to Halls Gap departs Mount Zero (book on Race Roster)', 'crew'],
      ['09:45', 'First Stage 2 finishers arrive, Mt William', 'stage'],
      ['12:30', 'Halls Gap aid station "High Vibes" (until 8 pm), Event Village forecourt', 'miler crew'],
      ['16:00', 'Gear check and bib collection (until 6 pm), Event Village', '33k'],
      ['18:00', 'Stage 2 course cut-off, Mt William', 'stage'],
      ['18:00', 'Nightly meals (book on Race Roster), Event Village forecourt', 'all']
    ] },
    { day: '2026-11-07', items: [
      ['05:00', 'Podium finishers (until 1 pm), Dunkeld', 'miler'],
      ['05:00', 'Shuttle to Mt William departs Halls Gap', 'stage'],
      ['05:30', 'Drop bags and tracker allocation, Mt William', 'stage'],
      ['06:00', 'Stage 3 start, Mt William', 'stage'],
      ['10:00', 'First Stage 3 finishers arrive, Griffin Fireline', 'stage'],
      ['14:00', 'Gear check and bib collection (until 7 pm), Dunkeld Info Centre', '33k'],
      ['18:00', 'Stage 3 course cut-off, Griffin Fireline', 'stage'],
      ['18:00', 'Nightly meals (book on Race Roster), Event Village forecourt', 'all']
    ] },
    { day: '2026-11-08', items: [
      ['05:15', 'Shuttle to Griffin Fireline departs Halls Gap', 'stage'],
      ['05:15', 'Last-minute gear check and bib collection (limited, until 5:45 am), Dunkeld Sterling Place Community Centre', '33k'],
      ['06:00', 'Drop bags and tracker allocation, Griffin Fireline', 'stage'],
      ['06:00', 'Race briefing, Dunkeld Sterling Place Community Centre', '33k'],
      ['06:20', 'Shuttles to Griffin Fireline depart Dunkeld (waves 1 to 4: 6:20, 6:25, 6:30, 6:35)', '33k'],
      ['06:30', 'Bib collection (until 8:15 am), Dunkeld Info Centre', '5k 2k'],
      ['06:30', 'Stage 4 start, Griffin Fireline', 'stage'],
      ['06:45', 'Race starts, Griffin Fireline (waves 1 to 4: 6:45, 6:50, 6:55, 7:00)', '33k'],
      ['07:20', 'Race briefing', '5k'],
      ['07:30', 'Race start, Sterling St near the Info Centre, Dunkeld', '5k'],
      ['08:20', 'Race briefing', '2k'],
      ['08:30', 'Race start, Sterling St near the Info Centre, Dunkeld', '2k'],
      ['09:00', 'Prize presentations, Dunkeld', '5k 2k'],
      ['10:00', 'Course cut-off, Dunkeld', 'miler'],
      ['10:00', 'First Stage 4 and 33k finishers arrive, Dunkeld', 'stage 33k'],
      ['12:00', 'Prize presentations, Dunkeld', '33k'],
      ['17:00', 'Course cut-off, Dunkeld', 'stage 33k'],
      ['17:00', 'Nightly meals (book on Race Roster), Event Village forecourt', 'all'],
      ['19:00', 'Prize presentation and age group winners, Event Village forecourt', 'miler stage'],
      ['20:00', 'Large finishers photo, then the event concludes', 'all']
    ] }
  ]
};
