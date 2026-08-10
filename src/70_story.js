/* ==========================================================================
   ISLAND PROTOCOL: PRESIDENTIAL EXTRACTION
   70_story.js - narrative data. Exposes IP.STORY only.
   No DOM, no WebGL, no side effects. ASCII only.
   ========================================================================== */
var IP = (typeof IP !== 'undefined' && IP) || {};
(function () {
  'use strict';

  function lines(a) { return a.join('\n'); }

  /* ------------------------------------------------------------ CAST --- */

  var characters = {
    callen: {
      name: 'Callen Reyes',
      callsign: 'WARDEN',
      role: 'USSTRATCOM Special Activities, detached',
      age: 38,
      bio: lines([
        'Ten years of work that appears in no citation. Speaks in imperative',
        'sentences. Not cold - narrowed. He is very good at exactly one thing',
        'and has built a life around being needed for it.',
        'He calls Elena the asset because if she is a person he has to survive',
        'the arithmetic of failing her. He has failed a package before.'
      ])
    },
    elena: {
      name: 'Elena Voss',
      callsign: 'PHOENIX',
      role: 'Graduate student, benthic ecology. Daughter of the President.',
      age: 21,
      bio: lines([
        'Grew up with agents in the driveway and learned early how to be small',
        'and agreeable to keep a room calm. That skill kept her alive for eleven',
        'days in a cell, and it is the exact skill she has to break tonight.',
        'There is a four-centimeter sutured incision at the base of her skull.',
        'Arc: panic, then compliance, then competence, then agency.'
      ])
    },
    kowalski: {
      name: 'Major Irene Kowalski',
      callsign: 'ANVIL',
      role: 'Mission handler, USS Fitzgerald, 90km east',
      age: 44,
      bio: lines([
        'Runs the clock and the lie. The only person who talks to Callen like a',
        'colleague instead of a tool. Also the person who will order him to leave',
        'Elena if the ovule matures. Both of those are sincere.'
      ])
    },
    dubois: {
      name: 'Warrant Officer Marc Dubois',
      callsign: 'CARRION-6',
      role: 'Pilot, 160th SOAR (A)',
      age: 31,
      bio: lines([
        'Terrible jokes, immaculate airmanship. Every transmission from him is',
        'oxygen. He will fly into a storm the weather shop has red-lined, and he',
        'will complain the entire way about a thermos.'
      ])
    },
    serrano: {
      name: 'Father Amador Serrano',
      callsign: 'EL PADRE',
      role: 'Patriarch, Los Sembradores. Mature Verdigris host.',
      age: 71,
      bio: lines([
        'Was the village schoolteacher in 1974. The oldest continuous',
        'colonization on record. Enormous patience, zero doubt. He does not hate',
        'Callen - he thinks Callen is weather. He is genuinely gentle with Elena,',
        'which is worse.'
      ])
    },
    merse: {
      name: 'Colonel Viktor Merse',
      callsign: 'GATEKEEPER',
      role: 'Contracted security commander, ARGOS perimeter',
      age: 52,
      bio: lines([
        'Sold the island access architecture to Serrano for a lump sum, was paid',
        'forty percent, and has spent three months trying to invoice a cult.',
        'Not a believer. Worse: an administrator with a rifle. His men are',
        'unpaid, cold, and increasingly the first course.'
      ])
    },
    haldane: {
      name: 'Doctor Miren Haldane',
      callsign: 'GREENHOUSE',
      role: 'Chief researcher, Station Verdadera',
      age: 49,
      bio: lines([
        'Engineered strain V-09 for vertical stability - a parasite that breeds',
        'true - because wild Verdigris burns a host in nine days and takes a',
        'coastline with it. She is telling the truth. She is also the reason',
        'Elena has an incision. Every terrible thing she did has a defensible',
        'paper trail, and the paper trail is the horror. She has two doses of',
        'inhibitor and will not hand them over for free.'
      ])
    },
    peddler: {
      name: 'unknown',
      callsign: 'PEDDLER',
      role: 'Smuggler on a pirate frequency. Nine years of caches on this rock.',
      age: 0,
      bio: lines([
        'Sells out of buried drums, takes ARGOS scrip and loose ammunition,',
        'and never once asks what is happening. Amused, transactional,',
        'unbothered. Currently trapped on the island and handling it better',
        'than anyone else on it.'
      ])
    }
  };

  /* ------------------------------------------------------------ ACTS --- */

  var acts = [
    {
      id: 'prologue',
      name: 'PROLOGUE',
      subtitle: 'GROUND TRUTH',
      objective: 'p_reach_lift',
      sections: ['cells', 'sublevel', 'lift_shaft'],
      beats: [
        { id: 'b_open', trigger: 'game_start', title: 'SUBLEVEL 4 - HOLDING', text: lines([
          'Ninety seconds since the lock came off. The cell block runs on battery',
          'lighting and the battery is old. Eleven rounds in the pistol, one spare',
          'magazine, a flashlight with a bad contact.',
          'Somewhere above them a bell is ringing and it is not ringing for prayer.'
        ]) },
        { id: 'b_first_kill', trigger: 'first_enemy', title: 'IT GETS UP', text: lines([
          'Two rounds center mass. He sits down. He gets up. He apologizes while',
          'he does it - the words are intact, that is what the words are for now.'
        ]) },
        { id: 'b_lift', trigger: 'power_restored', title: 'THE SERVICE LIFT', text: lines([
          'Twenty-two meters of cable and a car that has not been serviced since',
          'the audit. It goes up. That is the entire requirement.'
        ]) }
      ]
    },
    {
      id: 'act1',
      name: 'ACT I',
      subtitle: 'FACILITY BREACH',
      objective: 'a1_cross_labs',
      sections: ['west_labs', 'containment_b', 'vent_warrens', 'power_station', 'loading_yard'],
      beats: [
        { id: 'b_gas', trigger: 'a1_gas_corridor', title: 'CRYO LINE 3', text: lines([
          'The corridor is at nineteen percent lower explosive limit and climbing.',
          'A muzzle flash in here is a decision about the whole wing.',
          'Knife work, or run.'
        ]) },
        { id: 'b_blackout', trigger: 'a1_blackout', title: 'CONTAINMENT B', text: lines([
          'Mains drop. The only light left is what the tanks make - that specific',
          'green, the color of a penny left in the sea. It is enough to see by.',
          'It is enough to be seen by.'
        ]) },
        { id: 'b_intercom', trigger: 'a1_haldane_first', title: 'A VOICE ON THE OVERHEAD', text: lines([
          'A woman, unhurried, mid-thought. She asks him not to shoot the tanks.',
          'She says please. She does not stop what she is doing to say it.'
        ]) },
        { id: 'b_incision', trigger: 'safe_room', title: 'FOUR CENTIMETERS', text: lines([
          'Under the hairline at the base of her skull: a sutured incision, neat,',
          'nine or ten days healed. Somebody with real training closed it.',
          'Callen puts the light away and says nothing. Kowalski will not do that.'
        ]) }
      ]
    },
    {
      id: 'act2',
      name: 'ACT II',
      subtitle: 'ASH AND RAIN',
      objective: 'a2_motor_pool',
      sections: ['motor_pool', 'chapel_road', 'chapel', 'causeway', 'drowned_village', 'cistern', 'cannery'],
      beats: [
        { id: 'b_outside', trigger: 'act2_start', title: 'OPEN AIR', text: lines([
          'Rain like gravel. Twenty meters of visibility and a wind that takes the',
          'sound of a rifle and moves it somewhere else. Elena stands in it for',
          'four full seconds with her face up before she remembers to be afraid.'
        ]) },
        { id: 'b_bell', trigger: 'a2_chapel_bell', title: 'THE BELL', text: lines([
          'The chapel bell is rung for a sighting, not for an hour. Every time it',
          'goes, the island learns where they are.'
        ]) },
        { id: 'b_tide', trigger: 'a2_causeway', title: 'ELEVEN MINUTES', text: lines([
          'The tide table is bolted to the seawall, sun-bleached, forty years old,',
          'and Elena reads it faster than he does. Spring tide, storm surge, the',
          'causeway floods in eleven minutes, not forty.',
          'He goes the way she says. It is the first order she gives.'
        ]) },
        { id: 'b_merse', trigger: 'a2_cannery', title: 'THE KILL FLOOR', text: lines([
          'Merse has a fortified office, four men who have not been paid since',
          'February, and a printout of an unpaid invoice pinned to the wall',
          'like a grievance.'
        ]) }
      ]
    },
    {
      id: 'act3',
      name: 'ACT III',
      subtitle: 'THE PERIMETER',
      objective: 'a3_cliffs',
      sections: ['sea_cliffs', 'catacombs', 'ossuary', 'trestle_bridge', 'docks', 'helipad'],
      beats: [
        { id: 'b_clock', trigger: 'act3_start', title: 'CLOCK RUNNING', text: lines([
          'CARRION-6 is wheels-up into a storm the weather shop red-lined an hour',
          'ago. He has fuel for one approach and the loiter of a man being honest',
          'with himself. The number in the corner of the display is real now.'
        ]) },
        { id: 'b_name', trigger: 'boss_serrano', title: 'HER NAME', text: lines([
          'In the ossuary, with the old man walking toward them through his own',
          'congregation, Callen says her name out loud for the first time.',
          'Neither of them comments on it. Both of them hear it.'
        ]) },
        { id: 'b_bridge', trigger: 'bridge_collapse', title: 'TRESTLE 3', text: lines([
          'Condemned in 2019. The repair work order was cancelled to save',
          'nineteen thousand dollars. It holds for exactly as long as it takes to',
          'become someone else problem.'
        ]) },
        { id: 'b_pad', trigger: 'final_stand', title: 'THE PAD', text: lines([
          'Rotor wash, rain going sideways, and everything the island has left',
          'coming up the access road in a single unhurried line.',
          'Six minutes. Hold the square.'
        ]) }
      ]
    }
  ];

  /* ------------------------------------------------------ OBJECTIVES --- */

  var objectives = {
    p_reach_lift: { text: 'Reach the service lift', hint: 'East end of the cell block. Keep her behind you.', section: 'cells', next: 'p_restore_lift' },
    p_restore_lift: { text: 'Restore power to the lift', hint: 'The breaker panel is in the sublevel plant room.', section: 'sublevel', next: 'p_safe_room' },
    p_safe_room: { text: 'Reach the safe room', hint: 'Green lamp above the door. They do not come in.', section: 'sublevel', next: 'p_surface' },
    p_surface: { text: 'Ride the lift to the surface levels', hint: 'Hold the car. It is a long twenty-two meters.', section: 'lift_shaft', next: 'a1_cross_labs' },

    a1_cross_labs: { text: 'Cross the west research wing', hint: 'Atrium doors are mag-locked. Find the bypass.', section: 'west_labs', next: 'a1_seal_gas' },
    a1_seal_gas: { text: 'Shut off the ruptured cryo line', hint: 'Do not fire in the corridor. Blade or run.', section: 'west_labs', next: 'a1_containment' },
    a1_containment: { text: 'Cut through Containment Wing B', hint: 'UV emitters still have charge. Use them.', section: 'containment_b', next: 'a1_power' },
    a1_power: { text: 'Restore main power at the station', hint: 'Three feeders. Bring them up in order or trip the whole bus.', section: 'power_station', next: 'a1_intercom' },
    a1_intercom: { text: 'Answer the intercom', hint: 'She is not going to stop calling.', section: 'power_station', next: 'a1_yard' },
    a1_yard: { text: 'Reach the loading yard and get outside', hint: 'Roll door, manual chain hoist. Elena can work the chain.', section: 'loading_yard', next: 'a2_motor_pool' },

    a2_motor_pool: { text: 'Cross the motor pool to the chapel road', hint: 'Open ground. Use the vehicle lanes for cover.', section: 'motor_pool', next: 'a2_mast' },
    a2_mast: { text: 'Raise the mast and restore comms', hint: 'Winch is seized. Two of you on the crank.', section: 'chapel_road', next: 'a2_chapel' },
    a2_chapel: { text: 'Get through the chapel of the Sowers', hint: 'Cut the bell rope before anything else.', section: 'chapel', next: 'a2_causeway' },
    a2_causeway: { text: 'Take the causeway before the tide', hint: 'Listen to her. She read the table.', section: 'causeway', next: 'a2_sluice' },
    a2_sluice: { text: 'Recover the sluice keys', hint: 'Harbormaster house, upper floor, under the boards.', section: 'drowned_village', next: 'a2_cistern' },
    a2_cistern: { text: 'Drain the cistern', hint: 'It will not like being drained.', section: 'cistern', next: 'a2_cannery' },
    a2_cannery: { text: 'Cut through the cannery', hint: 'Cold rooms first. The kill floor is a killbox by design.', section: 'cannery', next: 'a2_merse' },
    a2_merse: { text: 'Settle with Colonel Merse', hint: 'He wants to be paid. You have nothing he can spend.', section: 'cannery', next: 'a3_cliffs' },

    a3_cliffs: { text: 'Climb the sea cliffs to the catacomb mouth', hint: 'Fixed line is rotten in two places. She goes first.', section: 'sea_cliffs', next: 'a3_catacombs' },
    a3_catacombs: { text: 'Cross the catacombs', hint: 'Follow the water. It always leaves.', section: 'catacombs', next: 'a3_serrano' },
    a3_serrano: { text: 'End Father Serrano', hint: 'He is the broadcast. Kill the broadcast, kill the sowing.', section: 'ossuary', next: 'a3_bridge' },
    a3_bridge: { text: 'Cross Trestle 3 before it goes', hint: 'Do not stop on the span. It was condemned in 2019.', section: 'trestle_bridge', next: 'a3_signal' },
    a3_signal: { text: 'Signal CARRION-6 from the dock lamp', hint: 'Three long. He will know.', section: 'docks', next: 'a3_hold' },
    a3_hold: { text: 'Hold the helipad until pickup', hint: 'Six minutes. Fight the road, not the field.', section: 'helipad', next: 'a3_board' },
    a3_board: { text: 'Board the helicopter', hint: 'Her first. Always her first.', section: 'helipad', next: null },

    opt_okonkwo: { text: 'OPTIONAL: Free the survivor in the power station', hint: 'Somebody welded that locker shut from outside.', section: 'power_station', next: null },
    opt_stanek: { text: 'OPTIONAL: Reach the man in the cold room', hint: 'He is counting his rounds out loud. He is down to three.', section: 'cannery', next: null },
    opt_tomas: { text: 'OPTIONAL: Check the bell tower', hint: 'Somebody has been drawing on the wall up there.', section: 'drowned_village', next: null },
    opt_archive: { text: 'OPTIONAL: Burn the research archive', hint: 'Ossuary annex. Thermite is where Haldane said it would be.', section: 'ossuary', next: null },
    opt_inhibitor: { text: 'OPTIONAL: Secure the second inhibitor dose', hint: 'She has two. She has only ever offered one.', section: 'ossuary', next: null }
  };

  /* -------------------------------------------------------- DIALOGUE --- */
  /* dur is seconds, sized to line length. Recomputed and verified. */

  var dialogue = {
    game_start: [
      { speaker: 'CALLEN', text: "Elevator is east. Stay on my back. Eyes down.", dur: 2.5 },
      { speaker: 'ELENA', text: "Okay. Okay. I'm okay. Okay.", dur: 1.8, fear: 'panic' },
      { speaker: 'CALLEN', text: "The asset stays within arm's reach. Always.", dur: 2.4 },
      { speaker: 'ANVIL', text: "WARDEN, ANVIL. I have you on sublevel four. Whole island just woke up. Move.", dur: 4.2 }
    ],
    first_enemy: [
      { speaker: 'ELENA', text: "That's - that's Doctor Ferro. He signed my intake.", dur: 2.8, fear: 'panic' },
      { speaker: 'CALLEN', text: "Not anymore. Head or knees. Nothing else stops them.", dur: 2.9 },
      { speaker: 'ELENA', text: "He's still saying words.", dur: 1.8, fear: 'panic' }
    ],
    first_grab_elena: [
      { speaker: 'ELENA', text: "Off - get it off - GET IT OFF ME -", dur: 1.9, fear: 'panic' },
      { speaker: 'CALLEN', text: "Hold still. Hold still. Do not fight the arm.", dur: 2.5 },
      { speaker: 'ANVIL', text: "WARDEN, asset vitals are spiking. Whatever you are doing, do it faster.", dur: 3.9 }
    ],
    elena_rescued: [
      { speaker: 'CALLEN', text: "Package is intact. Breathe out slow. Four counts.", dur: 2.7 },
      { speaker: 'ELENA', text: "It said my name. It said my whole name.", dur: 2.1, fear: 'panic' },
      { speaker: 'CALLEN', text: "They all know it. That is not new information. Move.", dur: 2.9 }
    ],
    safe_room: [
      { speaker: 'ANVIL', text: "Green lamp is a hard room. Take four minutes. You have four.", dur: 3.3 },
      { speaker: 'ELENA', text: "Is it quiet in here or did I stop hearing things?", dur: 2.7, fear: 'tense' },
      { speaker: 'CALLEN', text: "It is quiet. Sit. Drink the whole thing, not half.", dur: 2.8 },
      { speaker: 'ELENA', text: "There's a cut on my neck. I keep touching it. I don't remember getting it.", dur: 4.1, fear: 'tense' },
      { speaker: 'CALLEN', text: "Ten days healed. Somebody with training closed it.", dur: 2.8 },
      { speaker: 'ANVIL', text: "Elena. This is Major Kowalski. I am not going to lie to you about that incision, so ask me when you are ready.", dur: 6.1 }
    ],
    low_health: [
      { speaker: 'ELENA', text: "You're leaving a trail. That's yours, right? Tell me that's yours.", dur: 3.6, fear: 'tense' },
      { speaker: 'CALLEN', text: "Green case. Front pouch. Do not look at it, just hand it over.", dur: 3.4 },
      { speaker: 'ANVIL', text: "WARDEN, your telemetry is ugly. Break contact and patch.", dur: 3.1 }
    ],
    elena_low: [
      { speaker: 'ELENA', text: "I'm fine. I'm fine. I can walk. I can - I can walk.", dur: 2.8, fear: 'hurt' },
      { speaker: 'CALLEN', text: "Sit down. That is not a request.", dur: 1.8 },
      { speaker: 'ANVIL', text: "Asset is below threshold. Stabilize her or the mission is already over.", dur: 3.9 }
    ],
    power_restored: [
      { speaker: 'ANVIL', text: "Bus is up. I have facility cameras. Give me sixty seconds to find you a road.", dur: 4.2 },
      { speaker: 'ELENA', text: "God, the lights. I forgot what color things are.", dur: 2.6, fear: 'tense' },
      { speaker: 'HALDANE', text: "That is my grid you are throwing switches on. Do not touch the third feeder. Please.", dur: 4.6 },
      { speaker: 'CALLEN', text: "Who is on this line.", dur: 1.8 },
      { speaker: 'HALDANE', text: "Someone with two doses of something you are going to need. Keep walking east.", dur: 4.2 }
    ],
    act2_start: [
      { speaker: 'CALLEN', text: "Outside. Rain. Stay in the vehicle lanes.", dur: 2.3 },
      { speaker: 'ELENA', text: "Sorry. Sorry - one second. I just want one second of this.", dur: 3.2, fear: 'tense' },
      { speaker: 'CALLEN', text: "You get four.", dur: 1.8 },
      { speaker: 'ANVIL', text: "WARDEN, status on PHOENIX.", dur: 1.8 },
      { speaker: 'CALLEN', text: "She's holding.", dur: 1.8 },
      { speaker: 'ANVIL', text: "Copy. Noted.", dur: 1.8 }
    ],
    act3_start: [
      { speaker: 'CARRION-6', text: "WARDEN, CARRION-6, wheels up out of the boat. I am flying into something the weather shop calls unsurvivable, so let us all be brief.", dur: 7.3 },
      { speaker: 'ANVIL', text: "Clock is live. Thirty-eight minutes to the pad or he turns for fuel and does not come back.", dur: 5.0 },
      { speaker: 'CALLEN', text: "She goes first. I cover.", dur: 1.8 },
      { speaker: 'ELENA', text: "Copy. Fixed line, two rotten sections, I'll call them.", dur: 3.0, fear: 'calm' }
    ],
    bridge_collapse: [
      { speaker: 'ELENA', text: "It's going - it's GOING -", dur: 1.8, fear: 'panic' },
      { speaker: 'CALLEN', text: "Do not stop. Do not look at the water. Run the sleepers.", dur: 3.1 },
      { speaker: 'CARRION-6', text: "I just watched a bridge leave the island on my thermal. Please tell me you were not the reason.", dur: 5.2 },
      { speaker: 'CALLEN', text: "We were the reason.", dur: 1.8 }
    ],
    boss_serrano: [
      { speaker: 'SERRANO', text: "You walked her through my whole house. Every door. Do you understand what you have been doing?", dur: 5.2 },
      { speaker: 'SERRANO', text: "You have been carrying the seed to the field. Thank you, soldier. Truly.", dur: 4.0 },
      { speaker: 'CALLEN', text: "Elena. Behind me. Now.", dur: 1.8 },
      { speaker: 'ELENA', text: "...You said my name.", dur: 1.8, fear: 'calm' },
      { speaker: 'CALLEN', text: "Reload the shotgun. Four shells. Hand it back closed.", dur: 2.9 }
    ],
    final_stand: [
      { speaker: 'ANVIL', text: "Six minutes. He is on final. Hold the square, WARDEN. Hold the square.", dur: 3.9 },
      { speaker: 'CALLEN', text: "Elena Voss is on that pad and she is walking onto that bird.", dur: 3.3 },
      { speaker: 'ELENA', text: "Access road, two groups, the big one is on the left. Take the left.", dur: 3.7, fear: 'calm' },
      { speaker: 'CALLEN', text: "Taking the left.", dur: 1.8 }
    ],
    extraction: [
      { speaker: 'CARRION-6', text: "Skids are down, skids are down, forty seconds and I am leaving with whoever is aboard. That is not a threat, it is arithmetic.", dur: 6.9 },
      { speaker: 'CALLEN', text: "Her first. Go. Go.", dur: 1.8 },
      { speaker: 'ANVIL', text: "WARDEN, confirm you have PHOENIX.", dur: 1.8 },
      { speaker: 'CALLEN', text: "Her name is Elena Voss. Put it in the report right.", dur: 2.8 },
      { speaker: 'ANVIL', text: "...Copy that, Callen. Come home.", dur: 1.8 }
    ],
    elena_death: [
      { speaker: 'CALLEN', text: "No. No. Get up. Elena. Elena, get up.", dur: 2.0 },
      { speaker: 'ANVIL', text: "WARDEN. WARDEN, respond. Say status on PHOENIX. Say status.", dur: 3.2 },
      { speaker: 'CALLEN', text: "...Asset is down.", dur: 1.8 }
    ],
    player_death: [
      { speaker: 'ELENA', text: "Get up. Get up, please, please get up, I don't know how to do this -", dur: 3.7, fear: 'panic' },
      { speaker: 'ANVIL', text: "WARDEN is off telemetry. PHOENIX, if you can hear me, run east. Just run east.", dur: 4.3 }
    ],

    /* -- non-mandatory triggers below; integrator may wire freely -- */
    first_document: [
      { speaker: 'CALLEN', text: "They kept records. They always keep records.", dur: 2.4 }
    ],
    first_grab_player: [
      { speaker: 'CALLEN', text: "Off. OFF.", dur: 1.8 },
      { speaker: 'ELENA', text: "I can't help - I don't know how to help -", dur: 2.3, fear: 'panic' }
    ],
    first_merchant: [
      { speaker: 'PEDDLER', text: "Well now. Somebody new on the dead channel. I have got drums buried all over this rock and nothing to spend it on. Interested?", dur: 6.9 }
    ],
    a1_gas_corridor: [
      { speaker: 'ANVIL', text: "Sniffer says nineteen percent LEL in that corridor and climbing. Do not fire. I mean it, do not fire.", dur: 5.6 },
      { speaker: 'ELENA', text: "So we just... walk past them.", dur: 1.8, fear: 'tense' },
      { speaker: 'CALLEN', text: "We walk past them. Blade only. Match my pace.", dur: 2.5 }
    ],
    a1_blackout: [
      { speaker: 'ELENA', text: "Why is the water green. Why is everything green.", dur: 2.6, fear: 'panic' },
      { speaker: 'CALLEN', text: "Tank light. Do not touch the glass. Hand on my belt.", dur: 2.9 }
    ],
    a1_haldane_first: [
      { speaker: 'HALDANE', text: "Whoever is in Wing B - please do not shoot the containment glass. I am aware of the irony of the request.", dur: 5.8 },
      { speaker: 'CALLEN', text: "Identify.", dur: 1.8 },
      { speaker: 'HALDANE', text: "Haldane. I built the thing that is trying to eat you. I am also the only person on this island who can keep the girl from turning. Keep walking.", dur: 7.9 }
    ],
    a1_boss_intro: [
      { speaker: 'ELENA', text: "That was Ruiz. Specimen handling. He - he brought me food.", dur: 3.2, fear: 'panic' },
      { speaker: 'CALLEN', text: "Then he will forgive us. Get behind the tank line and stay small.", dur: 3.6 }
    ],
    a2_chapel_bell: [
      { speaker: 'ANVIL', text: "That bell is a sighting report. Every time it rings the whole island re-tasks on your position.", dur: 5.2 },
      { speaker: 'ELENA', text: "Then cut the rope.", dur: 1.8, fear: 'tense' },
      { speaker: 'CALLEN', text: "Cutting the rope.", dur: 1.8 }
    ],
    a2_causeway: [
      { speaker: 'ELENA', text: "Wait. Wait. That table says spring tide and there is a surge on top of it.", dur: 4.1, fear: 'calm' },
      { speaker: 'CALLEN', text: "ANVIL gave us forty minutes on that crossing.", dur: 2.5 },
      { speaker: 'ELENA', text: "ANVIL is reading a chart. I'm reading the water. We have eleven minutes. Maybe nine.", dur: 4.6, fear: 'calm' },
      { speaker: 'CALLEN', text: "...Do it her way. Go.", dur: 1.8 },
      { speaker: 'ANVIL', text: "For the record, she is right and I am updating the plot. Nice work, PHOENIX.", dur: 4.2 }
    ],
    a2_stanek: [
      { speaker: 'STANEK', text: "Three rounds. I have got three rounds and I have been doing the math on three rounds for a while now.", dur: 5.6 },
      { speaker: 'CALLEN', text: "Give me the weapon. You are walking out.", dur: 2.2 },
      { speaker: 'STANEK', text: "I opened the gate for them. That is what I did. That is the whole thing I did.", dur: 4.3 }
    ],
    a2_cannery: [
      { speaker: 'MERSE', text: "American. You are the reason my quarterly is a disaster. Do you know what they still owe me? Do you?", dur: 5.5 },
      { speaker: 'CALLEN', text: "Not my department.", dur: 1.8 },
      { speaker: 'MERSE', text: "Everything is somebody's department. That is the tragedy of the whole profession.", dur: 4.5 }
    ],
    a2_merse_down: [
      { speaker: 'MERSE', text: "Take the codes. Third pocket. Tell them... tell them I invoiced.", dur: 3.5 },
      { speaker: 'ELENA', text: "He wasn't even one of them.", dur: 1.8, fear: 'calm' },
      { speaker: 'CALLEN', text: "No. He just did the paperwork.", dur: 1.8 }
    ],
    a3_haldane_meet: [
      { speaker: 'HALDANE', text: "Two doses. One goes in her neck tonight or the ovule opens on a runway in Virginia. The other is my leverage, and I am not embarrassed about that.", dur: 8.0 },
      { speaker: 'ELENA', text: "You put it in me.", dur: 1.8, fear: 'calm' },
      { speaker: 'HALDANE', text: "I did. With a waiver, a reference number, and a supervisor's signature. That is what I have instead of a conscience. Roll up your sleeve.", dur: 7.5 }
    ],
    a3_archive: [
      { speaker: 'HALDANE', text: "Everything is on that core. Twelve years. If you burn it, nobody can cure this and nobody can build it either. Choose fast.", dur: 6.8 },
      { speaker: 'ELENA', text: "Burn it.", dur: 1.8, fear: 'calm' },
      { speaker: 'HALDANE', text: "I was asking him.", dur: 1.8 },
      { speaker: 'ELENA', text: "I know. Burn it.", dur: 1.8, fear: 'calm' }
    ],
    a3_serrano_down: [
      { speaker: 'SERRANO', text: "Child. Do you know how long I have been awake? Fifty-one years without one hour of quiet.", dur: 4.9 },
      { speaker: 'SERRANO', text: "You could have been the last thing I ever had to teach.", dur: 3.0 },
      { speaker: 'ELENA', text: "You were a schoolteacher.", dur: 1.8, fear: 'calm' },
      { speaker: 'SERRANO', text: "I was a very good one.", dur: 1.8 }
    ],
    survivor_rescued: [
      { speaker: 'ELENA', text: "How many is that now?", dur: 1.8, fear: 'calm' },
      { speaker: 'CALLEN', text: "More than none. Keep them behind you.", dur: 2.0 }
    ],
    boss_harvest: [
      { speaker: 'CARRION-6', text: "WARDEN, I am seeing something on the pad approach that my display does not have a category for. Please engage it away from my rotor disk.", dur: 7.5 },
      { speaker: 'CALLEN', text: "Elena. Magazines. Keep them coming.", dur: 1.9 },
      { speaker: 'ELENA', text: "Already in your hand.", dur: 1.8, fear: 'calm' }
    ],
    inventory_full: [
      { speaker: 'ELENA', text: "I can carry something. I have hands.", dur: 2.0, fear: 'calm' }
    ],
    elena_saves_callen: [
      { speaker: 'ELENA', text: "DOWN -", dur: 1.8, fear: 'calm' },
      { speaker: 'CALLEN', text: "...Good call.", dur: 1.8 },
      { speaker: 'ELENA', text: "I've been watching you do it for six hours.", dur: 2.4, fear: 'calm' }
    ]
  };

  /* ----------------------------------------------------------- RADIO --- */

  var radio = [
    { id: 'r_p01', speaker: 'ANVIL', trigger: 'game_start', dur: 4.9, text: "WARDEN, ANVIL. Confirming custody of PHOENIX. Do not transmit her name on this net again." },
    { id: 'r_p02', speaker: 'ANVIL', trigger: 'p_reach_lift', dur: 4.6, text: "Your exfil window moved. I want to say weather. It is not weather. Keep moving east." },
    { id: 'r_p03', speaker: 'CARRION-6', trigger: 'p_reach_lift', dur: 5.8, text: "WARDEN, CARRION-6 on the boat, cold and dry and drinking coffee from a thermos that leaks. Life is unfair." },
    { id: 'r_p04', speaker: 'ANVIL', trigger: 'p_restore_lift', dur: 5.9, text: "Facility schematic has three sublevel breakers. The one marked in red is the one you want. Of course it is." },
    { id: 'r_p05', speaker: 'ANVIL', trigger: 'p_safe_room', dur: 4.2, text: "Hard room. Sit her down. She has been standing on adrenaline for eleven days." },
    { id: 'r_p06', speaker: 'ANVIL', trigger: 'p_surface', dur: 4.8, text: "Lift shaft is a shooting gallery in both directions. Ride it with your back to the gate." },

    { id: 'r_a101', speaker: 'ANVIL', trigger: 'a1_cross_labs', dur: 5.8, text: "West research is ARGOS proper. Hostiles in there wore lab coats this morning. It will not slow them down." },
    { id: 'r_a102', speaker: 'ANVIL', trigger: 'a1_seal_gas', dur: 6.7, text: "Cryo line three ruptured at oh-one-fifty. That is thirty minutes before you cut her lock. Somebody vented it deliberately." },
    { id: 'r_a103', speaker: 'CARRION-6', trigger: 'a1_seal_gas', dur: 5.3, text: "Reminder from the aviation community: fuel-air explosions are indoor sports. Do not play indoors." },
    { id: 'r_a104', speaker: 'ANVIL', trigger: 'a1_containment', dur: 6.3, text: "Containment B has hard UV emitters on the ceiling rail. They still hold charge. The organism hates 265 nanometers." },
    { id: 'r_a105', speaker: 'ANVIL', trigger: 'a1_power', dur: 5.8, text: "Feeders in order: yard, then plant, then main. Wrong order trips the bus and I lose you for four minutes." },
    { id: 'r_a106', speaker: 'ANVIL', trigger: 'power_restored', dur: 4.6, text: "Cameras are live. I have eyes on you for the first time tonight. You look terrible." },
    { id: 'r_a107', speaker: 'ANVIL', trigger: 'a1_intercom', dur: 6.3, text: "That voice on the overhead is Doctor Miren Haldane. She is a named subject on three warrants and I want her alive." },
    { id: 'r_a108', speaker: 'ANVIL', trigger: 'opt_okonkwo', dur: 5.9, text: "There is a heat signature in a locker down there and lockers do not have heat signatures. Your call, WARDEN." },
    { id: 'r_a109', speaker: 'ANVIL', trigger: 'safe_room', dur: 7.4, text: "Elena. The incision at your brainstem is a delivery site. It is dormant. Dormant is not the same as safe and I will not tell you it is." },
    { id: 'r_a110', speaker: 'ANVIL', trigger: 'a1_yard', dur: 5.0, text: "Roll door is chain-hoist. Two people, one minute. Put her on the chain and cover the ramp." },
    { id: 'r_a111', speaker: 'CARRION-6', trigger: 'a1_yard', dur: 5.8, text: "Weather is walking in from the southeast like it owns the place. If you are going outside, go outside now." },
    { id: 'r_a112', speaker: 'ANVIL', trigger: 'a1_boss', dur: 4.6, text: "Whatever that is, it was a person at shift change. Aim for the growth, not the man." },

    { id: 'r_a201', speaker: 'ANVIL', trigger: 'act2_start', dur: 6.0, text: "Rain is going to cost you twenty meters of sight and every footstep you have. It costs them the same. Use it." },
    { id: 'r_a202', speaker: 'ANVIL', trigger: 'a2_motor_pool', dur: 6.1, text: "Motor pool is open ground with sight lines from the tower. Do not cross the middle. Nobody crosses the middle." },
    { id: 'r_a203', speaker: 'ANVIL', trigger: 'a2_mast', dur: 5.9, text: "I am losing you on the primary. Get that mast vertical or the next thirty minutes are you alone in the dark." },
    { id: 'r_a204', speaker: 'ANVIL', trigger: 'a2_mast_down', dur: 3.9, text: "WARDEN, say again. WARDEN. ...Static. All stations, hold this net open." },
    { id: 'r_a205', speaker: 'CARRION-6', trigger: 'a2_comms_restored', dur: 5.7, text: "There he is. There he is. Twenty-two minutes of nothing and I aged a year, WARDEN. Do not do that again." },
    { id: 'r_a206', speaker: 'ANVIL', trigger: 'a2_chapel', dur: 6.3, text: "That is not a church, it is a switchboard. Serrano preaches into a PA loop and the whole island hears him at once." },
    { id: 'r_a207', speaker: 'ANVIL', trigger: 'a2_causeway', dur: 5.0, text: "Correction to my last: PHOENIX has the tide right and I had it wrong. Plot updated. Go now." },
    { id: 'r_a208', speaker: 'ANVIL', trigger: 'a2_sluice', dur: 5.4, text: "The village drowned in 1974 on purpose. Somebody opened those sluices to bury a quarantine failure." },
    { id: 'r_a209', speaker: 'ANVIL', trigger: 'a2_cistern', dur: 6.2, text: "Sonar off the Fitzgerald says the cistern has a mass in it that is moving against the current. Just so you know." },
    { id: 'r_a210', speaker: 'ANVIL', trigger: 'a2_cannery', dur: 6.0, text: "Merse has forty men and a payroll problem. Half of them will run if he goes down. The other half already ran." },
    { id: 'r_a211', speaker: 'ANVIL', trigger: 'a2_merse', dur: 5.7, text: "Viktor Merse. Six years on the ARGOS gate, one very bad decision, and a spreadsheet he will die holding." },
    { id: 'r_a212', speaker: 'CARRION-6', trigger: 'a2_merse_down', dur: 4.7, text: "Thermal shows the compound quieting down. That was the man with the radio, then. Nice." },
    { id: 'r_a213', speaker: 'ANVIL', trigger: 'opt_tomas', dur: 5.0, text: "There is a kid in that tower, WARDEN. Eleven years old. I am not going to make it an order." },
    { id: 'r_a214', speaker: 'ANVIL', trigger: 'a2_quiet', dur: 5.7, text: "You have not asked me about the abort criteria. I know you read the OPORD annex. I am aware you read it." },
    { id: 'r_a215', speaker: 'ANVIL', trigger: 'a2_quiet2', dur: 6.1, text: "Section four says if the ovule matures you leave her. I wrote that section. I would like you to know I argued." },

    { id: 'r_a301', speaker: 'CARRION-6', trigger: 'act3_start', dur: 6.5, text: "CARRION-6 is airborne. Ceiling four hundred, viz garbage, and a headwind with a personal grudge. Thirty-eight minutes." },
    { id: 'r_a302', speaker: 'ANVIL', trigger: 'act3_start', dur: 5.7, text: "Clock is on your display now. It is real. Everything you do from here costs seconds you do not get back." },
    { id: 'r_a303', speaker: 'ANVIL', trigger: 'a3_cliffs', dur: 5.7, text: "Fixed line on that cliff is 1990s Spanish Navy. Two sections are rotten. Send the lighter climber first." },
    { id: 'r_a304', speaker: 'ANVIL', trigger: 'a3_catacombs', dur: 6.2, text: "The catacombs predate everything. Monastery ossuary, sixteenth century. Serrano moved the archive into the annex." },
    { id: 'r_a305', speaker: 'ANVIL', trigger: 'a3_serrano', dur: 6.8, text: "Serrano is the broadcaster. Every dormant ovule on this rock is waiting on his voice. Take the voice, you take the harvest." },
    { id: 'r_a306', speaker: 'ANVIL', trigger: 'opt_archive', dur: 6.4, text: "If you burn that core, ARGOS loses twelve years and so does everybody else. Command wants it intact. I want it gone." },
    { id: 'r_a307', speaker: 'ANVIL', trigger: 'a3_bridge', dur: 6.0, text: "Trestle 3 was condemned in 2019 and never repaired. It is the only span. I am sorry, that is the whole brief." },
    { id: 'r_a308', speaker: 'CARRION-6', trigger: 'bridge_collapse', dur: 3.8, text: "Yeah, I saw that. I am going to pretend I did not see that. Continue." },
    { id: 'r_a309', speaker: 'ANVIL', trigger: 'a3_signal', dur: 5.1, text: "Dock lamp, three long flashes. He will pick it out of the storm. He is better than he sounds." },
    { id: 'r_a310', speaker: 'CARRION-6', trigger: 'a3_signal_ack', dur: 4.9, text: "I have your lamp. Three long, tally. Turning inbound. Do not die in the next six minutes." },
    { id: 'r_a311', speaker: 'ANVIL', trigger: 'a3_hold', dur: 6.3, text: "Everything left on that island is walking up the access road in one column. Fight the road. Do not fight the field." },
    { id: 'r_a312', speaker: 'CARRION-6', trigger: 'final_stand', dur: 6.1, text: "Two minutes. I am going to put this thing down in a place that will look reckless. It is reckless. Stand clear." },
    { id: 'r_a313', speaker: 'ANVIL', trigger: 'extraction', dur: 4.3, text: "Skids down. WARDEN, get her aboard and then get yourself aboard. In that order." },
    { id: 'r_a314', speaker: 'CARRION-6', trigger: 'extraction_done', dur: 5.8, text: "Doors closed, we are light on fuel and heavy on people, which is my favorite way to be wrong about weight." },
    { id: 'r_a315', speaker: 'CARRION-6', trigger: 'ending', dur: 5.6, text: "Hey. WARDEN. There is a thermos in the net by your knee. It leaks. It is still coffee. You earned it." },
    { id: 'r_a316', speaker: 'ANVIL', trigger: 'ending', dur: 6.8, text: "Fitzgerald has you inbound. Deck is clear, medical is standing by, and her father is on a phone I am not going to hand you." },

    { id: 'r_x01', speaker: 'ANVIL', trigger: 'low_health', dur: 4.4, text: "WARDEN, your vitals just did something I do not like. Break contact. Patch. Now." },
    { id: 'r_x02', speaker: 'ANVIL', trigger: 'elena_low', dur: 4.5, text: "PHOENIX is bleeding and she is not telling you. Check her left side. Check it now." },
    { id: 'r_x03', speaker: 'ANVIL', trigger: 'low_ammo', dur: 5.0, text: "Ammunition state is critical on my board. There are cached drums on this island. Find one." },
    { id: 'r_x04', speaker: 'ANVIL', trigger: 'save_room', dur: 4.2, text: "Take the room. Log your position. I will hold the net quiet for four minutes." },
    { id: 'r_x05', speaker: 'CARRION-6', trigger: 'idle_long', dur: 5.3, text: "Still here, WARDEN. Still cold. Still holding a thermos with a structural defect. Take your time." },
    { id: 'r_x06', speaker: 'ANVIL', trigger: 'first_document', dur: 5.8, text: "Photograph anything with a reference number on it. Reference numbers are how this ends up in a courtroom." },
    { id: 'r_x07', speaker: 'ANVIL', trigger: 'elena_kill_assist', dur: 4.2, text: "Did PHOENIX just call a flank for you. ...Log it. I want that in the record." },
    { id: 'r_x08', speaker: 'ANVIL', trigger: 'many_kills', dur: 4.2, text: "Body count is past sixty. That is not a compliment, that is a supply concern." }
  ];

  /* ------------------------------------------------------- DOCUMENTS --- */

  var documents = [
    {
      id: 'doc_transfer_4471b', title: 'Detainee Transfer Order 4471-B',
      author: 'ARGOS Bioscience / Site Custody', date: '10 APR 2027', section: 'cells',
      body: lines([
        'STATION VERDADERA - CUSTODY MOVEMENT ORDER 4471-B',
        'FROM: Surface Receiving   TO: Sublevel 4, Cell 11',
        '',
        'SUBJECT: V-27 (F, 21)',
        'DESIGNATION: VESSEL, PRIORITY ONE',
        '',
        'HANDLING NOTES:',
        '1. DO NOT SEDATE. Sedation depresses uptake at the implant site.',
        '2. Feed on schedule. Vessel weight loss is a reportable deviation.',
        '3. No restraint marks above the collarbone. She will be seen.',
        '4. Personnel are reminded that the Vessel is not a specimen and is not',
        '   to be spoken to about the Planting.',
        '',
        'AUTHORIZED: A. Serrano (Pastoral) / M. Haldane (Clinical, under protest,',
        'see attached memo AE-2213-b)',
        '',
        '[handwritten, different pen] she asks what day it is every morning.',
        'somebody just tell her.'
      ])
    },
    {
      id: 'doc_cellblock_scratch', title: 'Wall Scratchings, Cell 11 (transcribed)',
      author: 'Site Security, transcription clerk unlisted', date: '18 APR 2027', section: 'cells',
      body: lines([
        'TRANSCRIPTION - CELL 11 EAST WALL - PARTIAL',
        'Instrument: bed frame rivet. Depth consistent, hand steady.',
        '',
        'ROW 1: eleven vertical marks, evenly spaced.',
        'ROW 2: WATER TEMP 11.4C - TIDE 0412 / 1638 - GULLS AT 0530',
        'ROW 3: SOMEONE IS COUNTING THE SAME DAYS I AM',
        'ROW 4: (partially effaced) ...E. VOSS, R/V CORRIGAN, BENTHIC SURVEY 4',
        'ROW 5: I AM NOT A ROOM. I AM NOT A ROOM. I AM NOT A ROOM.',
        'ROW 6: (small, low, near the floor) dad taught me to float. still can.',
        '',
        'CLERK NOTE: Subject uses the tide times to keep a calendar. Recommend',
        'the porthole in the corridor be plated over. Cost approx 60 EUR.',
        'STATUS: NOT ACTIONED.'
      ])
    },
    {
      id: 'doc_sublevel_placard', title: 'Cryogenic Line Rupture - Immediate Actions',
      author: 'ARGOS Facilities (laminated placard)', date: '02 SEP 2024', section: 'sublevel',
      body: lines([
        'IN THE EVENT OF A CRYOGENIC LINE RUPTURE:',
        '',
        '1. EVACUATE the affected corridor. Do not run.',
        '2. NOTIFY plant supervision on extension 4. Do not use the PA.',
        '3. NO IGNITION SOURCES. This includes handheld radios, torches, and',
        '   firearms discharge. Assume the atmosphere is flammable.',
        '4. Isolation valves are located at 20m intervals, RED WHEEL, TURN LEFT.',
        '5. Do not attempt rescue without a second person on the line.',
        '',
        '[sticker over item 4] VALVES 3 AND 4 SEIZED - WORK ORDER 8871 - PENDING',
        '[sticker over the sticker] WORK ORDER 8871 CLOSED - NO BUDGET FY27'
      ])
    },

    {
      id: 'doc_rl_001', title: 'Research Log, Entry 001',
      author: 'Dr. M. Haldane', date: '14 JAN 2023', section: 'west_labs',
      body: lines([
        'ENTRY 001. Station Verdadera. Day one.',
        '',
        'The organism recovered from the Cortadura in 1961 has been kept alive',
        'for sixty-two years in a tank the size of a bathtub. Nobody has ever',
        'characterized it properly. Everyone who tried worked for a defense',
        'contractor and asked the wrong question, which was always: what can it do',
        'to a person.',
        '',
        'The right question is: what does it want. It is an organism. It wants',
        'what organisms want. If I can find the appetite, I can find the leash.',
        '',
        'Wild strain kills the host in nine days and sheds aerosol for six more.',
        'A stable strain would not kill. A stable strain could be studied,',
        'bounded, and eventually erased. That is the work.',
        '',
        'I have three years and a very good centrifuge. Begin.'
      ])
    },
    {
      id: 'doc_rl_014', title: 'Research Log, Entry 014',
      author: 'Dr. M. Haldane', date: '30 AUG 2023', section: 'west_labs',
      body: lines([
        'ENTRY 014.',
        '',
        'The ethics board will not approve human tissue. Fine. The ethics board',
        'is four people on a call from Rotterdam who have never smelled this.',
        '',
        'Serrano has offered me volunteers. He uses that word. I asked him to',
        'define it and he said: they have already said yes, doctor, they said yes',
        'in 1974, you are simply arriving late to the conversation.',
        '',
        'I filed AE-2213 requesting a waiver on autologous graft material.',
        'I expect it to be denied.',
        '',
        'ADDENDUM 04 SEP: It was approved in eleven hours. Nobody asked a single',
        'question. I sat with that for the rest of the day.'
      ])
    },
    {
      id: 'doc_argos_ethics', title: 'Ethics Board Waiver AE-2213',
      author: 'ARGOS Bioscience Compliance, Rotterdam', date: '04 SEP 2023', section: 'west_labs',
      body: lines([
        'REF: AE-2213    STATUS: APPROVED    REVIEW TIME: 11h 04m',
        'REQUESTOR: HALDANE, M. (Station Verdadera)',
        'SUBJECT: Waiver, human-derived graft material, Protocol V.',
        '',
        'FINDING: The Board notes the site operates under Annex C of the client',
        'agreement and is therefore outside the jurisdiction of the Board for',
        'matters of subject sourcing.',
        '',
        'DETERMINATION: No objection. The Board declines to review.',
        '',
        'SIGNATORY: [electronic] R. Feld, Chair',
        'DISTRIBUTION: Requestor. Client liaison. File.',
        '',
        '[margin, blue ink, Haldane hand] "declines to review". eleven hours.',
        'they did not read it. nobody has ever read it.'
      ])
    },
    {
      id: 'doc_v09_autopsy', title: 'Necropsy Summary - Subject V-09',
      author: 'Dr. M. Haldane / A. Ruiz, specimen handling', date: '11 NOV 2025', section: 'containment_b',
      body: lines([
        'NECROPSY - SUBJECT V-09 - THIRD GENERATION HOST',
        '',
        'GROSS: Adult male, 44. Musculature hypertrophied at the shoulder girdle',
        'and cervical spine beyond any training history. Skin over the trapezius',
        'is discolored to a green-black consistent with copper oxidation.',
        '',
        'CRANIAL: Ovule seated against the brainstem, 41mm major axis. Filament',
        'network extends bilaterally into the motor cortex without displacing it.',
        'The organism does not destroy tissue. It reroutes it.',
        '',
        'NOTE ON EMERGENCE: On cranial trauma the ovule expresses a secondary',
        'structure through the wound within 1.2 seconds. This is not a death',
        'reflex. It is an investment being protected.',
        '',
        'HANDLER NOTE (Ruiz): The smell is not decay. It is low tide. It is',
        'exactly low tide. I have stopped being able to eat shellfish.',
        '',
        'CONCLUSION: V-09 is stable. Vertical transmission confirmed. We have',
        'what we set out to make. God help us, it worked.'
      ])
    },
    {
      id: 'doc_okonkwo_note', title: 'Note on a Barcode Roll',
      author: 'J. Okonkwo, comms tech', date: 'undated', section: 'power_station',
      body: lines([
        '[written along a roll of adhesive barcode labels, one word per label]',
        '',
        'DAY 1 - locker. someone welded it. thank you whoever you are.',
        'DAY 1 - they walk past every 40 min. i counted. i have nothing but counting.',
        'DAY 2 - drank the coolant reservoir. it was water. i checked. mostly.',
        'DAY 3 - i can hear them talking. they are having normal conversations.',
        '        one of them was complaining about his back.',
        'DAY 3 - that is the worst part. nobody tells you that is the worst part.',
        'DAY 4 - if you are reading this i am either out or i am not.',
        'DAY 4 - my name is June Okonkwo. i fix radios. tell somebody i was here.'
      ])
    },
    {
      id: 'doc_rl_031', title: 'Research Log, Entry 031',
      author: 'Dr. M. Haldane', date: '02 FEB 2026', section: 'containment_b',
      body: lines([
        'ENTRY 031.',
        '',
        'Serrano can call them. I have now measured it. Fundamental at 47Hz with',
        'a harmonic structure I cannot reproduce with a speaker cone. It is not',
        'a signal. It is a resonance. He is not a priest, he is a tuning fork',
        'that somebody left in a man for fifty-one years.',
        '',
        'Every dormant ovule within four kilometers responds. Every one. They',
        'stand up at the same time and they all lift their heads the same amount.',
        '',
        'I have stopped sleeping in the residence. I sleep in Wing B, between',
        'the tanks, because the UV rail runs all night and the light means',
        'nothing can be in the room with me that should not be.',
        '',
        'I am aware of how this sentence reads. I am leaving it in.'
      ])
    },
    {
      id: 'doc_containment_placard', title: 'Containment Wing B - Standing Order 7',
      author: 'ARGOS Biosafety', date: '19 MAR 2025', section: 'containment_b',
      body: lines([
        'STANDING ORDER 7 - UV DISCIPLINE',
        '',
        'The overhead rail emits at 265nm. This wavelength is lethal to the',
        'organism at 40 seconds of continuous exposure and harmful to you at',
        'considerably less.',
        '',
        '- Rail runs 2200 to 0600 automatically.',
        '- Manual triggers at each bulkhead. GREEN HOUSING. Pull down, hold.',
        '- Charge is finite. Each emitter holds four discharges.',
        '- Eye protection is mandatory. Eye protection is in the cabinet.',
        '- The cabinet is empty. This has been reported. See WO-8871.',
        '',
        'IF THE RAIL FAILS: leave the wing. Do not investigate. Leave the wing.'
      ])
    },
    {
      id: 'doc_merse_invoice', title: 'Invoice 22-P (OUTSTANDING)',
      author: 'V. Merse, Merse Security Solutions Kft.', date: '01 MAR 2027', section: 'loading_yard',
      body: lines([
        'MERSE SECURITY SOLUTIONS Kft.   INVOICE 22-P',
        'BILL TO: Congregation of the Sowers, c/o A. Serrano',
        'TERMS: NET 30. THIS INVOICE IS 47 DAYS OVERDUE.',
        '',
        'LINE 1  Perimeter access architecture, full transfer .... 4,000,000',
        'LINE 2  Gate code rotation schedule, 6yr .................. 750,000',
        'LINE 3  Personnel discretion, 41 contractors ............ 1,250,000',
        'LINE 4  Late fee, statutory ............................... 122,400',
        '                                          TOTAL DUE:    6,122,400',
        'RECEIVED TO DATE: 2,400,000 (39.2%)',
        '',
        '[handwritten across the bottom, heavy pen]',
        'I have sent this eleven times. He writes back about the harvest.',
        'THE HARVEST IS NOT A PAYMENT METHOD.',
        'My men have not been paid since February. Two of them are gone and I do',
        'not think they deserted. I think they were spent.'
      ])
    },

    {
      id: 'doc_house_rules', title: 'Rules of the House (barracks card)',
      author: 'Merse Security Solutions, laminated', date: '12 JAN 2027', section: 'motor_pool',
      body: lines([
        'RULES OF THE HOUSE - READ IT, LIVE LONGER',
        '',
        '1. You do not go past the chapel road after dark. Not for anything.',
        '2. If a local says your name and you did not tell it to him, walk away.',
        '3. Nobody drinks the village water. Nobody swims. Nobody fishes.',
        '4. If a man you know stops blinking, he is not a man you know.',
        '5. Two in the chest is a courtesy. One in the head is the job.',
        '6. If it grows a second head, back up and let the machine gun work.',
        '7. Do not look in the tanks. There is nothing in there for you.',
        '8. Payday is the 1st. Complaints to the Colonel.',
        '',
        '[under rule 8, in three different hands]',
        'ITS THE 14TH',
        'ITS THE 22ND',
        'ITS MARCH'
      ])
    },
    {
      id: 'doc_merse_aar', title: 'After Action Report - Breach 04 FEB',
      author: 'Col. V. Merse', date: '05 FEB 2027', section: 'motor_pool',
      body: lines([
        'AFTER ACTION - CONTAINMENT BREACH, 04 FEB 2027, 0340L',
        'PREPARED BY: Merse, V., Commanding',
        '',
        '1. SUMMARY. Wing B lost UV rail power at 0331. Six specimens ambulatory',
        'by 0340. Nine contractors engaged. Four contractors lost.',
        '',
        '2. WHAT WORKED. Massed automatic fire at 30m. Vehicle lights. Doors.',
        '',
        '3. WHAT DID NOT WORK. Pistols. Single aimed shots. Radios, because men',
        'will not report calmly when the thing chasing them uses their name.',
        '',
        '4. FINDING. This site is not a facility with a hazard in it. It is a',
        'hazard with a facility built on top. I have written this before.',
        '',
        '5. RECOMMENDATION. Full withdrawal of contract personnel, immediate,',
        'and a sea-based option for the site.',
        '',
        '6. DISPOSITION OF RECOMMENDATION: Denied by client. Client states the',
        'planting is scheduled and cannot be moved.',
        '',
        '[handwritten] I sold them the gate for six million and I cannot buy',
        'a boat with it because there is nowhere to go that is not downwind.'
      ])
    },
    {
      id: 'doc_catechism', title: 'The Sowers Catechism - Third Planting',
      author: 'Congregation of the Sowers', date: 'no date, printed', section: 'chapel',
      body: lines([
        'THE THIRD PLANTING - QUESTIONS FOR THE CHILDREN',
        '',
        'Q. What was the world before?',
        'A. A field nobody sowed.',
        '',
        'Q. What did the sea give us?',
        'A. A seed, and the patience to keep it.',
        '',
        'Q. Why did the water take our houses?',
        'A. Because men with clean hands wanted the field to stay empty.',
        '',
        'Q. What is a vessel?',
        'A. A person the world is already looking at.',
        '',
        'Q. Is a vessel afraid?',
        'A. Yes. That is how we know it is a person and not a pot.',
        '',
        'Q. What do we owe a vessel?',
        'A. Kindness. Food on time. Her own name spoken correctly.',
        '',
        'Q. And after the planting?',
        'A. Nothing is owed. There is only the field, and we are in it.'
      ])
    },
    {
      id: 'doc_serrano_sermon', title: 'Sermon Transcript (security mic 4)',
      author: 'A. Serrano, recorded incidentally', date: '19 APR 2027', section: 'chapel',
      body: lines([
        '[MIC 4 - CHAPEL NAVE - PARTIAL - 0510L]',
        '',
        'SERRANO: ...and I taught in that room for nine years. Fractions. The',
        'names of the clouds. Which of you was in that room? Hands. Yes. Yes.',
        '',
        'SERRANO: They came in the spring with clipboards and they wrote our',
        'names down and then they opened the sluices. That is the whole of it.',
        'They did not hate us. Hate would have been a relationship.',
        '',
        'SERRANO: Now. The girl. You will not frighten her. You will not touch',
        'her hair or her face. When she asks the day, you will tell her the day.',
        '',
        'SERRANO: She is going home. That is the point of her. She goes home and',
        'she is loved and she is photographed and she is welcomed into every',
        'clean room on that continent, and the field goes with her.',
        '',
        'SERRANO: Fifty-one years I have not slept. Soon, all of it will be one',
        'thing, and it will be quiet, and I will put my head down.',
        '',
        '[END OF USABLE AUDIO]'
      ])
    },
    {
      id: 'doc_evac_1974', title: 'Provincial Evacuation Notice - Puerto Sombra',
      author: 'Direccion Provincial de Sanidad', date: '22 MAY 1974', section: 'drowned_village',
      body: lines([
        'AVISO / NOTICE - PUERTO SOMBRA, ISLA VERDADERA',
        '',
        'By order of the Provincial Health Directorate, the settlement of Puerto',
        'Sombra is under quarantine effective immediately.',
        '',
        '- No vessel may depart the harbor. Harbor chain is set.',
        '- Residents will assemble at the chapel at 0800 daily for inspection.',
        '- Livestock will be destroyed. Compensation forms at the harbormaster.',
        '- The lower village will be flooded for sanitary reasons on 04 JUNE.',
        '  Residents of the lower village will be relocated. Details to follow.',
        '',
        'DETAILS DID NOT FOLLOW.',
        'THE SLUICES WERE OPENED ON 29 MAY AT NIGHT.',
        'NINETY-ONE PEOPLE WERE STILL IN THE LOWER VILLAGE.',
        '',
        '[the last three lines are in chisel, cut into the stone beneath the',
        'original posted notice, by someone who took a long time over it]'
      ])
    },
    {
      id: 'doc_fisherman_ledger', title: 'Catch Ledger, Trawler AURELIA - final page',
      author: 'D. Arellano, master', date: '08 NOV 1961', section: 'drowned_village',
      body: lines([
        'AURELIA - CATCH LEDGER - NOVEMBER',
        '',
        '05 NOV  hake 400kg  monkfish 60kg   good day',
        '06 NOV  hake 380kg  squid 90kg      good day',
        '07 NOV  nothing. nets down 900m on the trench wall. nothing at all.',
        '',
        '08 NOV  Brought up the deep net at 1140m and there is a thing in it.',
        'Not a fish. Green-black, size of a man curled up, and warm. Warm in',
        'November out of 1100 meters. That is not possible and I am writing it',
        'down so that later I know I saw it.',
        '',
        'The mate wants to cut it loose. I have told him no. The people from the',
        'mainland pay for curiosities and we have had a bad autumn.',
        '',
        'It is in the ice hold. It is not moving. My son keeps going down to',
        'look at it and I have told him three times.',
        '',
        '[no further entries in this ledger]'
      ])
    },
    {
      id: 'doc_evidence_0093c', title: 'Evidence Tag 0093-C',
      author: 'Site Security, evidence clerk', date: '13 APR 2027', section: 'drowned_village',
      body: lines([
        'EVIDENCE TAG 0093-C',
        'RECOVERED: bell tower, upper platform, village grid F4.',
        'ITEM: One (1) sheet, ruled paper, approx A5, folded twice.',
        'MEDIUM: Wax crayon, three colors (blue, brown, green).',
        '',
        'DESCRIPTION OF MARKINGS: Upper third, horizontal blue band, likely',
        'water. Center, brown rectangular structure with four apertures,',
        'consistent with the bell tower itself. Lower third, eleven brown',
        'stick figures arranged in a row, each with the arms extended',
        'downward. One (1) additional figure, smaller, positioned inside the',
        'tower structure, arms extended upward.',
        '',
        'Green crayon used only for the eyes of the eleven figures. Applied',
        'with sufficient pressure to tear the paper in four places.',
        '',
        'ANNOTATION IN CHILD HAND, LOWER RIGHT: "mama esta en la fila"',
        '(translation: mama is in the line)',
        '',
        'DISPOSITION: No intelligence value. Retain 30 days. Destroy.',
        'CLERK INITIALS: R.T.'
      ])
    },
    {
      id: 'doc_cannery_inspection', title: 'Health Inspection - Puerto Sombra Cannery',
      author: 'Inspector J. Belmonte', date: '17 JUL 1972', section: 'cannery',
      body: lines([
        'INSPECCION SANITARIA - CONSERVERA PUERTO SOMBRA',
        'FILE 72/441',
        '',
        'FINDINGS:',
        '1. Cold rooms 1-3 operating at correct temperature. Satisfactory.',
        '2. Kill floor drainage adequate. Satisfactory.',
        '3. Brine tanks: an unidentified organic mass adhering to the interior',
        '   of tank 4, approx 30kg, dark green. Plant manager states it is',
        '   "from the deep boat" and declines to remove it.',
        '4. Six (6) plant workers presenting with conjunctival discoloration.',
        '   All six declined examination. All six were cooperative and polite.',
        '5. Plant manager unable to produce a staff register for the night shift.',
        '   States the night shift "does not need a register, they know."',
        '',
        'RECOMMENDATION: Immediate closure pending laboratory analysis of the',
        'material in tank 4.',
        '',
        'ACTION TAKEN: None. Inspector Belmonte did not file a follow-up and',
        'did not return to the island. File closed administratively 1974.'
      ])
    },
    {
      id: 'doc_stanek_letter', title: 'Unsent Letter (Cpl. I. Stanek)',
      author: 'Cpl. Ivo Stanek', date: '28 FEB 2027', section: 'cannery',
      body: lines([
        'To: Ceska Sporitelna, Branch 0184',
        'Re: Account 44-9013820257, standing order',
        '',
        'Dear Sir or Madam,',
        '',
        'I am writing to ask that the standing order on the above account be',
        'suspended for three months. My employer is late with wages and I do',
        'not wish the payment to my mother to fail and cause her to telephone',
        'the bank, as she will worry.',
        '',
        'Please do not write to her about this. Please write only to me.',
        '',
        'If the payments cannot be suspended then let them run the account',
        'empty and let it close. She will think it is a mistake. That is fine.',
        'It is better than the other thing.',
        '',
        'Yours faithfully,',
        'I. Stanek',
        '',
        '[unsealed, unsent, found in a cold room with three rifle rounds]'
      ])
    },
    {
      id: 'doc_bell_inscription', title: 'Chapel Bell - Cast Inscription',
      author: 'Foundry of San Ildefonso, and one other hand', date: '1847 / after', section: 'chapel',
      body: lines([
        'CAST INTO THE CROWN, 1847:',
        '',
        '  I CALL THE LIVING',
        '  I MOURN THE DEAD',
        '  I BREAK THE LIGHTNING',
        '',
        'CUT INTO THE WAIST WITH A COLD CHISEL, DATE UNKNOWN,',
        'BY SOMEONE WORKING FROM BELOW AND IN A HURRY:',
        '',
        '  I DO NOT CALL YOU',
        '  I COUNT YOU'
      ])
    },

    {
      id: 'doc_rl_047', title: 'Research Log, Entry 047',
      author: 'Dr. M. Haldane', date: 'no date given', section: 'catacombs',
      body: lines([
        'ENTRY 047.',
        '',
        'Stopped dating these. The dates were for a review board and there is no',
        'review board, there is a man in a cassock and forty men with rifles who',
        'have not been paid.',
        '',
        'V-09 is stable. That is the thing I set out to do and I did it. Write',
        'that down somewhere it counts. I made a parasite that does not kill its',
        'host and I did it in thirty-one months.',
        '',
        'Serrano wants the girl planted on the 21st. He says the 21st the way my',
        'mother said Sunday.',
        '',
        'I have made two doses of an inhibitor. Two. There is not material for a',
        'third and there will not be. One dose stops an ovule at rest. Two doses',
        'stop an ovule that has heard him.',
        '',
        'I keep them on me. I keep them on me at all times and I have started',
        'sleeping with my hand on the case, which is a thing a person does when',
        'they have decided something and have not admitted it yet.'
      ])
    },
    {
      id: 'doc_rl_058', title: 'Research Log, Entry 058',
      author: 'Dr. M. Haldane', date: 'no date given', section: 'ossuary',
      body: lines([
        'ENTRY 058.',
        '',
        '',
        'It was never a leash.'
      ])
    },
    {
      id: 'doc_haldane_sister', title: 'Unsent Letter to Anneke',
      author: 'Dr. M. Haldane', date: '20 APR 2027', section: 'ossuary',
      body: lines([
        'Anneke,',
        '',
        'You asked me at the funeral what I actually do and I gave you the',
        'answer I give people at funerals. Here is the real one.',
        '',
        'I took something out of the sea that kills a person in nine days and I',
        'made it into something that does not kill anybody at all. Every step',
        'was documented. Every step had a reference number and a signature from',
        'somebody in Rotterdam who had eleven hours and did not use them.',
        '',
        'I want you to understand that I never lied. Not once. I filled in the',
        'form honestly and the form said yes. That is the entire crime and it',
        'is not a crime, and I have not slept properly since October.',
        '',
        'There is a girl in a cell downstairs who says thank you when they bring',
        'her food. Twenty-one. She thanks them. Every time.',
        '',
        'I am going to do something about it and it will not be brave, it will',
        'be late.',
        '',
        'Tell mum I called. I did not call.',
        '',
        'M.'
      ])
    },
    {
      id: 'doc_bridge_condemned', title: 'Structural Condemnation - Trestle 3',
      author: 'Marin & Sons Ingenieria, for ARGOS Facilities', date: '08 OCT 2019', section: 'trestle_bridge',
      body: lines([
        'STRUCTURAL ASSESSMENT - TRESTLE 3, QUARRY SPUR',
        'REF: MS-19-0442',
        '',
        'CONDITION: Bents 4 through 9 exhibit advanced section loss at the',
        'waterline. Salt spray and sixty years. Bent 7 has lost an estimated',
        '60% of its cross section and is carrying load it should not be.',
        '',
        'RATING: CONDEMNED. Structure is not fit for foot traffic.',
        '',
        'RECOMMENDATION: Immediate closure, barricade both approaches, and',
        'replacement of bents 4-9. Estimate attached (19,400 EUR).',
        '',
        'CLIENT RESPONSE, 14 OCT 2019: Work order raised, then cancelled.',
        'Reason code: DEFER-FY20. Barricade approved in lieu.',
        '',
        '[stapled note] barricade was installed. someone has moved it.',
        'someone moves it every few months. i have stopped reinstalling it.'
      ])
    },
    {
      id: 'doc_helipad_log', title: 'Helipad Operations Log - last entries',
      author: 'Site Aviation (unsigned after 04 FEB)', date: '04 FEB - 21 APR 2027', section: 'helipad',
      body: lines([
        'PAD OPS LOG - STATION VERDADERA - EXTRACT',
        '',
        '04 FEB 0410  MEDEVAC req. 4 casualties. No airframe available. LOGGED.',
        '04 FEB 0630  MEDEVAC req. repeated. Client declines to task. LOGGED.',
        '11 FEB 1200  Resupply, routine. Cancelled by client.',
        '02 MAR 0900  Personnel rotation, 41 pax outbound. CANCELLED BY CLIENT.',
        '02 MAR 0915  [handwritten] they cancelled our ride home',
        '19 MAR ----  pad lighting fails. no work order raised. no point.',
        '10 APR 0230  Unscheduled arrival. 1 pax inbound, female, restrained.',
        '             Manifest not provided. I did not ask. I want that written.',
        '21 APR ----  [in a different hand, large, across the whole page]',
        '             THE FIELD IS SOWN ON THE 21ST. NOBODY FLIES ON THE 21ST.'
      ])
    },
    {
      id: 'doc_elena_note', title: 'Folded Paper, Safe Room 3',
      author: 'E. Voss', date: '21 APR 2027', section: 'catacombs',
      body: lines([
        '[torn from a supply manifest, written in pencil, folded small and left',
        'under a first aid tin]',
        '',
        'If you find this and I am not with you:',
        '',
        'His callsign is WARDEN. He carried me for six hours and he never once',
        'said my name, and I worked out why on the causeway. It is not cruelty.',
        'It is a load rating.',
        '',
        'Tell him it was fine. Tell him I was not scared the whole time, only',
        'most of it, and that is different.',
        '',
        'Tell my dad the water temperature was 11.4 and I checked it every day',
        'and I never stopped being a scientist about it. He will know what',
        'that means.',
        '',
        'Elena Voss. R/V Corrigan. Benthic Survey 4.'
      ])
    },
    {
      id: 'doc_opord_frag', title: 'OPORD 27-114 ANNEX C (fragment)',
      author: 'Maj. I. Kowalski', date: '19 APR 2027', section: 'helipad',
      body: lines([
        'OPERATION ORDER 27-114 - ANNEX C - CONTINGENCIES',
        'CLASSIFICATION: [redacted] // NOFORN',
        '',
        '4. ABORT AND ABANDONMENT CRITERIA.',
        '',
        '4.1 If PHOENIX exhibits confirmed colonization indicators (see 4.4),',
        'PHOENIX is reclassified CONTAMINATED MATERIAL and is not to be',
        'introduced to the extraction airframe under any circumstance.',
        '',
        '4.2 WARDEN will attempt recovery of biological samples and will',
        'egress alone.',
        '',
        '4.3 WARDEN is not authorized to make the determination at 4.1.',
        'The determination is made by ANVIL. WARDEN complies.',
        '',
        '4.4 INDICATORS: pupillary non-response, conjunctival discoloration,',
        'absence of pain reflex, use of the operator name he has not given.',
        '',
        '[margin, pen, Kowalski hand] I wrote 4.3 so it would not be his.',
        'That is the only kindness this annex contains and he will not read it',
        'as one.'
      ])
    },
    {
      id: 'doc_peddler_card', title: 'Card Nailed to a Buried Drum',
      author: 'unsigned', date: 'undated', section: 'motor_pool',
      body: lines([
        'YOU FOUND ONE. GOOD FOR YOU.',
        '',
        'HOUSE RULES:',
        '- I take ARGOS scrip, gold, and loose brass. I do not take promises.',
        '- Prices are what they are. There is no competition on this island,',
        '  which is a market condition and not a personality flaw.',
        '- Nine drums. Some are better than others. That is also a market',
        '  condition.',
        '- The frequency is 41.550. Whistle first. If I do not answer I am',
        '  either asleep or I have been eaten, and either way, wait.',
        '',
        'I have been here nine years and I have never once asked what is in',
        'the tanks. Recommend the same policy.',
        '',
        '- P.'
      ])
    }
  ];

  /* ------------------------------------------------------ ELENA BARKS --- */

  var elenaBarks = {
    calm: [
      "Clear on your right.",
      "I've got the case. Just tell me when.",
      "Two rooms back there was a door I didn't like. Noted it.",
      "Rain's easing. That's probably bad for us.",
      "I'm good. Genuinely. Ask me again in ten minutes.",
      "You breathe out before you shoot. I've started doing it too.",
      "If we live, I'm going to sleep for a calendar month.",
      "Ammo's in your left pouch now. I moved it. It was stupid where it was.",
      "Water's coming in from somewhere. Follow it, it always leaves."
    ],
    tense: [
      "Something moved. Left side. I'm not imagining it.",
      "How many was that? I lost count at nine.",
      "Okay. Okay, that's a lot of them.",
      "I hate this room. I hate this specific room.",
      "Tell me when to move and I'll move.",
      "They keep saying the same word. What is that word?",
      "Don't get far ahead. Please don't get far ahead.",
      "I can smell the low tide again."
    ],
    panic: [
      "Okay. Okay. Okay. Okay.",
      "I can't - my hands won't -",
      "Where do I go, where do I go, where do I -",
      "It said my name. It said my name.",
      "I'm sorry. I'm sorry, I'm sorry, I'm being slow -",
      "Don't leave. Don't leave. Don't leave.",
      "That's a person. That's a person, that's still a person -",
      "I'm going to be sick and then I'm going to be fine."
    ],
    hurt: [
      "That's - okay, that's bad.",
      "I'm up. I'm up. Give me one second.",
      "Don't stop for me. Don't - okay, stop for me.",
      "It's shallow. I think it's shallow.",
      "It doesn't hurt yet. That's the wrong thing, isn't it.",
      "Hand. Give me your hand."
    ],
    combat: [
      "Behind you!",
      "Left! Left!",
      "Reloading, you have four seconds!",
      "Big one, the big one, the big one!",
      "There's more coming up the stairs!",
      "I'm down, I'm down, I'm behind the drums!",
      "He's got a shield, go around!",
      "Grenade - is that a grenade -",
      "It got back up. It got back UP."
    ],
    reassured: [
      "Yeah. Yeah, okay. I'm with you.",
      "Copy. On you.",
      "Say it again. It helps when you say it.",
      "I'm not going to fall apart. Not yet, anyway.",
      "Okay. Four counts out. I remember.",
      "Thank you. I'll say it properly later."
    ],
    commandAck: {
      follow: ["On you.", "Right behind.", "Following.", "Yep. Moving.", "Glued to you."],
      stay: ["Staying.", "I'll hold here.", "Not moving. Come back.", "Okay. Okay, I'll wait."],
      hide: ["Hiding.", "In the locker. Go.", "Down and quiet.", "I'm small. I'm good at small."],
      come: ["Coming!", "Moving to you!", "On my way, don't shoot me.", "Here. I'm here."],
      interact: ["Got it.", "On the crank.", "Working it.", "Give me eight seconds.", "It's stiff - it's coming."]
    },
    idleChatter: [
      "My supervisor is going to be so annoyed about the survey data.",
      "There were eleven days. I counted them on the wall like a cartoon.",
      "Nobody in my family has ever been shot at. I've broken a streak.",
      "The water here is 11.4 degrees. That's warm for this depth. That's wrong.",
      "You don't have to talk. I just do this when it's quiet.",
      "You've got a callsign. I've got a codename. Neither of us has a name tonight.",
      "The old man kept telling me the day of the week. Like it was a gift.",
      "I keep planning what I'll eat. It's a very short list and it's all toast."
    ]
  };

  /* ----------------------------------------------------- CALLEN LINES --- */

  var callenLines = {
    combat: [
      "Contact front.",
      "On me.",
      "Stay behind the concrete.",
      "Two moving left.",
      "Don't cross the open.",
      "I've got the big one.",
      "Down. Now.",
      "Working."
    ],
    reload: [
      "Reloading.",
      "Dry. Cover.",
      "Swapping.",
      "Give me four seconds."
    ],
    lowAmmo: [
      "Running low.",
      "Almost dry. Making them count.",
      "Need brass. Anything.",
      "Last magazine."
    ],
    elenaDown: [
      "Get up.",
      "Not tonight. Get up.",
      "Hand. Take my hand.",
      "You're fine. Look at me. You're fine.",
      "I've got you. I've got you."
    ],
    kill: [
      "Down.",
      "Clear.",
      "That's one.",
      "Stay down this time.",
      "Next."
    ],
    hurt: [
      "Nnh.",
      "Fine.",
      "Still up.",
      "That one counted.",
      "Keep moving."
    ]
  };

  /* ---------------------------------------------------- ENEMY VOCALS --- */

  var enemyVocals = {
    ganado: [
      "Semilla! La semilla camina!",
      "Ahi! Ahi esta!",
      "Detras de ti!",
      "No la toques! Es del Padre!",
      "Por el Padre.",
      "Ven, hija. Ven.",
      "Se mueve! Se mueve!",
      "Cierra la puerta!",
      "Agarra al hombre!",
      "Te oigo respirar."
    ],
    brute: [
      "CARNE.",
      "RRRAAH!",
      "TE PARTO.",
      "AQUI. AQUI.",
      "NO CORRAS."
    ],
    shielder: [
      "Aqui no pasas.",
      "Quieto.",
      "Nada pasa.",
      "Cansate."
    ],
    spitter: [
      "Bebe... bebe...",
      "Abre la boca.",
      "Dulce, dulce.",
      "Traga."
    ],
    crawler: [
      "(a wet clicking, four beats, then four again)",
      "(a sound like a name being attempted)",
      "(chittering under the floor grate)",
      "(breathing, far too fast, from below)"
    ]
  };

  /* ---------------------------------------------------------- BOSSES --- */

  var bosses = [
    {
      id: 'boss_jardinero', name: 'SUBJECT V-09 - EL JARDINERO', act: 'act1',
      arena: 'Containment Wing B atrium, tank ring, UV rail overhead',
      phases: [
        { name: 'The Handler', mechanic: 'Charges in straight lines between tanks. Shatters tanks to flood the floor with coolant.', tell: 'Plants the rear foot and drops the shoulder a half second before the charge.' },
        { name: 'Second Growth', mechanic: 'Cranial hit opens the ovule; the growth whips at mid range and must be burned by the UV rail.', tell: 'The growth folds back and the arena hum drops in pitch.' },
        { name: 'Nothing Left of Ruiz', mechanic: 'Full sprint pursuit, no cover, four UV emitters remain, three charges each.', tell: 'It stops using the doorways.' }
      ],
      defeatText: lines([
        'It goes down against the tank glass and stays down.',
        'The nameplate on the coverall says A. RUIZ, SPECIMEN HANDLING.',
        'Elena reads it out loud and then does not say anything for eleven minutes.'
      ])
    },
    {
      id: 'boss_madre', name: 'LA MADRE', act: 'act2',
      arena: 'Flooded cistern, waist-deep, three sluice wheels on the wall',
      phases: [
        { name: 'Under the Water', mechanic: 'Unseen mass. Only wake and displacement visible. Movement noise draws it.', tell: 'The surface goes glassy in a two meter circle.' },
        { name: 'The Brood', mechanic: 'Spawns crawlers from the ceiling as the water drops. Wheels must be turned between waves.', tell: 'A rain of grit from the vault above.' },
        { name: 'Beached', mechanic: 'Water gone. Immobile, enormous, and now everything it does is at range.', tell: 'It inflates before the spray.' }
      ],
      defeatText: lines([
        'The cistern drains and leaves it stranded and folding in on itself in',
        'the bottom of a concrete box, in a village that was drowned on purpose',
        'in 1974 to hide exactly this.'
      ])
    },
    {
      id: 'boss_merse', name: 'COL. VIKTOR MERSE', act: 'act2',
      arena: 'Cannery kill floor - overhead rails, brine tanks, a fortified office',
      phases: [
        { name: 'The Firm', mechanic: 'Merse directs from cover. Two squads work bounding overwatch. Kill the radio, break the coordination.', tell: 'He calls a bound by number before it happens - listen for the number.' },
        { name: 'Personally', mechanic: 'Plate carrier, breaching shotgun, and the overhead rails moving carcasses as cover for both of you.', tell: 'He reloads at the hip and always after four.' },
        { name: 'Unpaid', mechanic: 'Last four men refuse an order. Merse fights alone and better.', tell: 'He stops giving orders.' }
      ],
      defeatText: lines([
        'He sits down against his own office door with the invoice still pinned',
        'above his head and tells Callen the perimeter codes without being asked,',
        'and then complains about the interest rate, and then stops.'
      ])
    },
    {
      id: 'boss_serrano', name: 'FATHER AMADOR SERRANO', act: 'act3',
      arena: 'The ossuary - bone walls, a hundred candles, standing congregation',
      phases: [
        { name: 'The Sermon', mechanic: 'Serrano walks. He does not attack. The congregation attacks on the beats of his voice.', tell: 'Everything in the room inhales at the same time.' },
        { name: 'The Tuning Fork', mechanic: '47Hz pulse staggers the player and calls dormant hosts out of the wall niches. Shooting during the pulse is inaccurate.', tell: 'The candle flames all lean the same way.' },
        { name: 'Fifty-One Years', mechanic: 'The old man is finally, briefly, fast. Close range. Elena must break the two grabs herself.', tell: 'He puts down the censer.' }
      ],
      defeatText: lines([
        'He goes to his knees among the candles, and the noise that has been',
        'under everything since the cell block - the pressure behind the ears,',
        'the thing you stopped noticing an hour ago - stops.',
        '',
        'The silence is so total that Elena puts a hand out to steady herself.',
        '',
        'SERRANO: "Oh. Oh, that is what it is like."'
      ])
    },
    {
      id: 'boss_harvest', name: 'THE HARVEST', act: 'act3',
      arena: 'Helipad, in the rotor wash, storm at full, sixty seconds a wave',
      phases: [
        { name: 'Emergence', mechanic: 'The terminal expression comes up the access road wearing what is left of the congregation.', tell: 'The access road lights go out in order, one at a time, toward you.' },
        { name: 'Rotor Wash', mechanic: 'CARRION-6 holds a hover; the downwash pins the mass and opens the core for a window every twenty seconds.', tell: 'Dubois calls the hover on the net.' },
        { name: 'Board', mechanic: 'Fighting withdrawal to the skids. Elena is already aboard and firing from the door.', tell: 'She calls the last flank of the game.' }
      ],
      defeatText: lines([
        'It comes apart in the downwash and goes over the pad edge in pieces,',
        'and the last of it is a sound going out over the water, and then',
        'the water, and then nothing.'
      ])
    }
  ];

  /* --------------------------------------------------------- ENDINGS --- */

  var endings = [
    {
      id: 'end_dawn_over_water', name: 'DAWN OVER WATER', rank: 'S',
      cond: { elenaAlive: true, survivors: 3, dataDestroyed: true, haldaneResolved: true, inhibitorDoses: 2, timeLeft: 240 },
      title: 'DAWN OVER WATER',
      text: lines([
        'Everyone who could be carried was carried.',
        '',
        'June Okonkwo fixes the cabin intercom before they clear the coast,',
        'because her hands need something and because that is what she does.',
        'Stanek sleeps with his boots on and does not let go of the strap.',
        'Tomas Arellano watches the island go and does not say anything, and',
        'somebody puts a survival blanket around him without being asked.',
        '',
        'The archive burned. Haldane is aboard, cuffed to a stanchion at her own',
        'suggestion, already composing the testimony that will end four careers',
        'in Rotterdam. The second inhibitor dose went into Elena at the cliff',
        'line. She will run a blood panel every ninety days for the rest of her',
        'life and every one of them will come back clean.',
        '',
        'The sun comes up somewhere behind the storm. Nobody sees it. It counts',
        'anyway.',
        '',
        'ELENA: "Callen."',
        'CALLEN: "Yeah."',
        'ELENA: "Nothing. Just checking it works."'
      ])
    },
    {
      id: 'end_clean_break', name: 'CLEAN BREAK', rank: 'A',
      cond: { elenaAlive: true, survivors: 1, dataDestroyed: true, timeLeft: 60 },
      title: 'CLEAN BREAK',
      text: lines([
        'The strain ends on the rock. Some of them end there too.',
        '',
        'Twelve years of work goes up in a thermite bloom under a sixteenth',
        'century vault, and with it every viable path back to Verdigris that',
        'anyone will find in this century. ARGOS will report a fire. The fire',
        'will be true.',
        '',
        'Elena walks off the airframe on the Fitzgerald under her own power and',
        'refuses the stretcher twice. She is still holding an empty magazine.',
        '',
        'There are names Callen does not get to bring home. He writes them out',
        'in the debrief anyway, spelled correctly, in the order he met them.'
      ])
    },
    {
      id: 'end_hot_dust_off', name: 'HOT DUST-OFF', rank: 'B',
      cond: { elenaAlive: true, dataDestroyed: true, timeLeft: 1 },
      title: 'HOT DUST-OFF',
      text: lines([
        'Dubois lifts with two warning lights and a fuel state he will lie about',
        'in the log. The skid strikes the pad lip on the way out. Nobody',
        'mentions it.',
        '',
        'They clear the cliff with the island still coming up the access road',
        'behind them, an unhurried line of people who used to be a village,',
        'stopping exactly at the edge of the light.',
        '',
        'CARRION-6: "For the record, that was the worst approach of my career."',
        'CARRION-6: "For the record, I would like to do it again."'
      ])
    },
    {
      id: 'end_asset_secured', name: 'ASSET SECURED', rank: 'C',
      cond: { elenaAlive: true, dataDestroyed: false },
      title: 'ASSET SECURED',
      text: lines([
        'Mission success. The words appear on a slide in a room Callen is not',
        'cleared for, above a photograph of a girl in a survival blanket.',
        '',
        'The archive core came off the island in a hard case with a different',
        'agency stencil on it. Somebody in Rotterdam has already opened a',
        'requisition. There is a new site in the procurement pipeline and it is',
        'not on an island this time, because islands have proved difficult.',
        '',
        'Elena Voss testifies for six hours in a closed session and is thanked',
        'for her time.',
        '',
        'Somebody will try again. That is not a warning. That is a schedule.'
      ])
    },
    {
      id: 'end_second_growth', name: 'SECOND GROWTH', rank: 'C',
      cond: { elenaAlive: true, inhibitorDoses: 0 },
      title: 'SECOND GROWTH',
      text: lines([
        'She sleeps on the flight. She has earned it, and everyone lets her.',
        '',
        'She keeps sleeping. Eleven hours. Fourteen. On the second day the',
        'medical officer notes a pupillary response that is present but slow,',
        'and files it, and the file goes into a queue.',
        '',
        'On the fourth day she asks a nurse for the date, and thanks her,',
        'and says the nurse name, which she has not been told.',
        '',
        'ANVIL: "WARDEN. Come in. WARDEN, I need you to come in."'
      ])
    },
    {
      id: 'end_the_field', name: 'THE FIELD', rank: 'F',
      cond: { elenaAlive: false },
      title: 'THE FIELD',
      text: lines([
        'The airframe leaves with one passenger.',
        '',
        'The debrief takes forty minutes. Callen answers every question in',
        'complete sentences and does not require a break. The transcript is',
        'clean enough that two people who read it get worried.',
        '',
        'In the section marked DISPOSITION OF PRINCIPAL he writes the codename,',
        'and then crosses it out, and then writes: Elena Voss, 21.',
        '',
        'It is the first time he uses it and it is on a form.'
      ])
    },
    {
      id: 'end_no_bird', name: 'NO BIRD', rank: 'F',
      cond: { timeLeft: 0 },
      title: 'NO BIRD',
      text: lines([
        'CARRION-6: "I am at bingo. I say again, I am at bingo fuel. Turning."',
        'CARRION-6: "...WARDEN. I am sorry. I am turning."',
        '',
        'The rotor noise goes out over the water and takes a long time to stop',
        'being audible.',
        '',
        'On the pad the storm keeps working. The access road lights come back',
        'on one at a time, toward them, and Elena reaches over and takes the',
        'spare magazine off his vest without being asked, and holds it.',
        '',
        'ELENA: "Okay. What is the next thing we do."'
      ])
    },
    {
      id: 'end_warden_down', name: 'WARDEN DOWN', rank: 'F',
      cond: { playerDead: true },
      title: 'WARDEN DOWN',
      text: lines([
        'Telemetry flatlines at 0447 local.',
        '',
        'The net stays open for a long time after that. Kowalski does not close',
        'it, and nobody on the Fitzgerald asks her to.'
      ])
    }
  ];

  /* ----------------------------------------------------- LOADING TIPS --- */

  var loadingTips = [
    'Two in the chest is a courtesy. One in the head is the job.',
    'A staggered host can be kicked. A kicked host takes his neighbors down.',
    'Shooting a knee buys three seconds. Three seconds is a magazine change.',
    'The second growth is the organism, not the man. It is also softer.',
    'UV emitters in Containment B hold four charges each. Count them.',
    'Do not discharge a firearm in a gas corridor. There is a knife for that.',
    'Tell Elena to HIDE before you commit to an open room, not during.',
    'Elena can work a crank, a valve, and a chain hoist. She cannot work a rifle. Yet.',
    'Grabs on Elena are on a timer. The timer is shorter than you think.',
    'Reload before the fight, not in it. Partial magazines are not a sin.',
    'Enemies who use your position by name have already reported it. Move.',
    'The chapel bell is a sighting report. Cut the rope.',
    'Rain costs them twenty meters of sight too. Use the weather, do not just suffer it.',
    'Brutes will body-block rather than strike Elena. That is exploitable and it is horrible.',
    'Shielders do not turn quickly. Nothing on this island turns quickly except you.',
    'Spitter fluid is flammable. So is most of Act Two.',
    'Melee finishers on downed hosts save ammunition and cost time. Pick one.',
    'The Peddler is on 41.550. Whistle first.',
    'Sell nothing that fits in a magazine.',
    'Cached drums are marked with a nail and a card. Look at the nails.',
    'Every document with a reference number is evidence. Evidence changes the ending.',
    'Survivors slow you down and change the last thirty seconds of the game.',
    'The extraction clock only runs in Act Three. Everything before it is free. Use it.',
    'If a fight is going badly, it is because you are fighting the field instead of the road.'
  ];

  /* --------------------------------------------------- MERCHANT LINES --- */

  var merchantLines = [
    "Whistle heard. Come on down, the drum is open and the prices are insulting.",
    "Well now. Somebody new on the dead channel.",
    "Got somethin' that'll put a hole in the day.",
    "That one's got a bent front sight. Knock forty off. I'm not a monster.",
    "Ammunition is the only real currency out here and you keep spending it on people.",
    "You want it upgraded, you leave it in the drum and you come back. That's how a workshop works.",
    "No, I will not come with you. I have nine drums and a routine.",
    "Buy the case. Buy the bigger case. You're carrying it like a man with a bigger case at home.",
    "Now that is a nice piece. Where did you - no. No, I don't ask.",
    "Everything in this drum was somebody's, once. Try not to be sentimental, it's bad for the margin.",
    "Girl's with you, then. Buy her a knife. Not for them. For her.",
    "You come back with brass, I'll come back with prices. Fair is fair.",
    "Nine years I've been out here and you're the third person to say please.",
    "Heard the bell go. Heard it stop. That was good work, that.",
    "Take the drum. Take the whole drum. I've got a feeling about tonight and I'd rather it was in your hands than mine.",
    "Go on then. Try not to die owing me money."
  ];

  /* -------------------------------------------------------- MEMORIAL --- */

  var memorial = {
    deathQuotes: [
      'They kept the words. That was the point of the words.',
      'Fifty-one years without one hour of quiet.',
      'The right question is not what it can do to a person.',
      'A vessel is a person the world is already looking at.',
      'The harvest is not a payment method.',
      'I did not lie. I filled in the form honestly and the form said yes.',
      'It was never a leash.',
      'I call the living. I mourn the dead. I break the lightning.',
      'I do not call you. I count you.',
      'Mama is in the line.',
      'Nobody flies on the 21st.',
      'She thanks them. Every time.',
      'Section four says if the ovule matures you leave her.',
      'Two in the chest is a courtesy.',
      'You have been carrying the seed to the field.',
      'Tell somebody I was here.'
    ]
  };

  /* ----------------------------------------------------------- STORY --- */

  IP.STORY = {
    title: 'ISLAND PROTOCOL',
    subtitle: 'PRESIDENTIAL EXTRACTION',
    logline: lines([
      'The rescue was the easy part. One operator, one twenty-one-year-old',
      'asset, eleven kilometers of hostile island, and a helicopter that will',
      'not wait.'
    ]),
    tagline: 'You already found her. Now get her off the rock.',
    setting: {
      place: 'Isla Verdadera, 340km ESE of the Carolina shelf',
      date: '21 APR 2027, 0212 local',
      weather: 'Storm front inbound from the southeast. Ceiling four hundred feet by 0400.',
      organism: 'VERDIGRIS - dredged from the Cortadura Trench, 1961. Colonizes via an ovule seated at the brainstem. Does not kill. Edits.'
    },
    characters: characters,
    acts: acts,
    objectives: objectives,
    dialogue: dialogue,
    radio: radio,
    documents: documents,
    elenaBarks: elenaBarks,
    callenLines: callenLines,
    enemyVocals: enemyVocals,
    bosses: bosses,
    endings: endings,
    loadingTips: loadingTips,
    merchantLines: merchantLines,
    memorial: memorial
  };
})();
if (typeof window !== 'undefined') { window.IP = IP; }
