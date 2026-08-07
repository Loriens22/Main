/* =====================================================================
 * 61_script.js — every line in the game, as data.
 *
 * Tone: understated competence. Steve is dry, precise, and genuinely kind
 * to his customers; he never explains himself and never brags. Oleg says
 * as little as possible and means all of it. Ms. Ellis is 93 and entirely
 * lucid — she is funny because she is specific, not because she is old.
 * The comedy lives in the gap between the two halves of Steve's life and
 * is never winked at.
 * ===================================================================== */
(function (SG) {
  'use strict';

  var S = SG.script;
  var L = S.lines;

  S.speakerNames = {
    steve: 'STEVE',
    oleg: 'OLEG',
    ellis: 'MS. ELLIS',
    guard: 'SECURITY',
    concierge: 'CONCIERGE',
    halcyon: 'HALCYON',
    pa: 'ANNOUNCEMENT',
    phone: 'PHONE',
    brandt: 'BRANDT',
    duck: 'THE DUCK',
    cat: 'KERNEL'
  };

  /* Compact writer: add(id, speaker, text, emotion) */
  function add(id, speaker, text, emotion) {
    L[id] = { speaker: speaker, text: text, emotion: emotion || 'calm' };
  }
  S.add = add;

  /* ================================================================== */
  /* c1 — Closing Time                                                   */
  /* ================================================================== */

  add('c1.ellis.1', 'ellis', "Is it the hard drive? My grandson says it's always the hard drive.", 'warm');
  add('c1.steve.1', 'steve', "It's a battery. Three dollars. Your hard drive is fine — it's a Western Digital. Built to outlast us both.");
  add('c1.ellis.2', 'ellis', "Then why does it keep asking me what year it is?", 'warm');
  add('c1.steve.2', 'steve', "Because without the battery it forgets. Every time you switch it off it wakes up in 1998 and has to be told.");
  add('c1.ellis.3', 'ellis', "That sounds exhausting.", 'warm');
  add('c1.steve.3', 'steve', "It's a very patient machine.");
  add('c1.ellis.4', 'ellis', "Harold bought it for the taxes. Ninety-eight. He never did the taxes.", 'tired');
  add('c1.steve.4', 'steve', "No?");
  add('c1.ellis.5', 'ellis', "He played solitaire. Eleven years of solitaire.", 'warm');
  add('c1.steve.5', 'steve', "Then it did what it was for.");
  add('c1.steve.6', 'steve', "I'll be right with you, Mr. Thomas.");
  add('c1.ellis.6', 'ellis', "Is that a friend of yours?", 'warm');
  add('c1.steve.7', 'steve', "He's a customer.");
  add('c1.ellis.7', 'ellis', "He doesn't look like he owns a computer.", 'warm');
  add('c1.steve.8', 'steve', "Not everybody does. Come on. I'll walk you out — mind the step.");

  /* ================================================================== */
  /* Chapter one — the shop                                              */
  /* ================================================================== */

  add('shop.drivers', 'steve', "Right. Number one Phillips, and try not to lose it this time.");
  add('shop.panel', 'steve', "Two screws. They only ever put in two, and people still bring me the panel separately.");
  add('shop.cell', 'steve', "CR2032. Three dollars. I buy them forty at a time.");
  add('shop.fitted', 'steve', "There. Positive side up. It'll hold the date for another six years — she won't need six.", 'tired');
  add('shop.clockSet', 'steve', "March the fourteenth. Close enough for a machine that only plays solitaire.");
  add('shop.y2k', 'steve', "Two thousand. I made four months' rent that January telling people nothing was going to happen.");
  add('shop.adventure', 'steve', "Somebody left this on the drive in 1998. I've never had the heart to delete it.");

  add('shop.register', 'steve', "Cash, cheque, or I'll take a plate of something. That's the whole menu.");
  add('shop.storeroom', 'steve', "That one's not for customers.");
  add('shop.coffee', 'steve', "Cold. Still counts.");
  add('shop.coffeeMaker', 'steve', "It's been making the same pot since Tuesday.");
  add('shop.clock', 'steve', "Twenty to six. She's been here since four.");
  add('shop.toolchest', 'steve', "Everything I own that matters is in the top two drawers.");
  add('shop.whiteboard', 'steve', "I should rub that off.", 'wary');
  add('shop.floppy', 'steve', "TAXES underscore FINAL underscore final underscore v3. Someone's whole life, on a disk that holds one photograph.");
  add('shop.drawer.1', 'steve', "Spare fuses. Spare keys. Spare everything.");
  add('shop.drawer.2', 'steve', "Nine passports. One of them's even mine.", 'flat');
  add('shop.stickyNote', 'steve', "Her password is 'password'. I've stopped fighting it.", 'tired');
  add('shop.konami', 'steve', "Well. That's one way to see how a thing is put together.");

  add('shop.cat.1', 'steve', "That's Kernel. He lives on the power supply because it's the warmest thing in the building.");
  add('shop.cat.3', 'steve', "Alright. You can come with me. Don't get under the bench.", 'warm');
  add('shop.cat.10', 'steve', "He does that. Types four characters, walks off, leaves you to debug it.", 'warm');

  /* The rubber duck is the hint system. One line per objective. */
  add('shop.duck.driver', 'steve', "First I need my drivers. They're on the bench, where they always are, which is never where I left them.");
  add('shop.duck.panel', 'steve', "Side panel comes off. Two screws, back edge. Then I can see the board.");
  add('shop.duck.battery', 'steve', "Then a fresh CR2032. Bins on the west wall — top row, first one.");
  add('shop.duck.fit', 'steve', "Then it drops into the holder next to the chipset. Positive side up.");
  add('shop.duck.clock', 'steve', "Then I power it on, go into setup, and tell it what year it is. F10 saves.");
  add('shop.duck.ellis', 'steve', "Then I walk her out to the car. She parks in the same bay every time.");
  add('shop.duck.oleg', 'steve', "Then I go and see what Mr. Thomas wants. He never wants anything small.", 'wary');
  add('shop.duck.none', 'steve', "Nothing outstanding. Which never lasts.");

  add('shop.ellis.wait1', 'ellis', "Take your time, dear. I've nowhere to be until Thursday.", 'warm');
  add('shop.ellis.wait2', 'ellis', "Do you know, Harold could never sit still while a man was working either.", 'warm');
  add('shop.ellis.ready', 'ellis', "Is it done? Already?", 'warm');
  add('shop.ellis.thanks', 'ellis', "You're very quick. The place on Ninth kept it three weeks and gave it back worse.", 'warm');
  add('shop.steve.noCharge', 'steve', "It was three dollars, Ms. Ellis. I'm not writing an invoice for three dollars.");
  add('shop.ellis.car', 'ellis', "Now — you'll eat something tonight. Not from a machine.", 'warm');
  add('shop.steve.driveSafe', 'steve', "Drive safe. Lights on before you're out of the lot.");

  add('shop.oleg.wait', 'oleg', "Finish with her. I am not in a hurry.", 'flat');
  add('shop.oleg.ready', 'oleg', "Lock the door.", 'flat');

  add('steve.idle.1', 'steve', "Hm.");
  add('steve.idle.2', 'steve', "Should reorder those cells.");
  add('steve.idle.3', 'steve', "Fan on the gaming box is still ticking. Bearing's gone.");
  add('steve.idle.4', 'steve', "Cold coffee. That's the third one today.", 'tired');

  /* ================================================================== */
  /* c2 — The Briefing                                                   */
  /* ================================================================== */

  add('c2.oleg.1', 'oleg', "You are well?", 'flat');
  add('c2.steve.1', 'steve', "I've been under a desk since seven. Otherwise, well.");
  add('c2.oleg.2', 'oleg', "Good.", 'flat');
  add('c2.oleg.3', 'oleg', "Prague. Thursday. The Meridian Grand.", 'flat');
  add('c2.steve.2', 'steve', "That's a hotel.");
  add('c2.oleg.4', 'oleg', "A hotel on top. Underneath, a room that is not on the plan. In the room, a machine. They call it Halcyon.", 'flat');
  add('c2.steve.3', 'steve', "Called by who?");
  add('c2.oleg.5', 'oleg', "By the man who owns it. Brandt. He keeps names. People who were promised they would stop existing. He sells them back, one at a time, to whoever is still looking.", 'flat');
  add('c2.steve.4', 'steve', "How many names?");
  add('c2.oleg.6', 'oleg', "Eleven hundred. Perhaps more. Nobody has counted from the outside.", 'flat');
  add('c2.oleg.7', 'oleg', "It has never touched a network. Not once, in nine years. So it must be touched by hand.", 'flat');
  add('c2.steve.5', 'steve', "Mine.");
  add('c2.oleg.8', 'oleg', "Yours.", 'flat');
  add('c2.oleg.9', 'oleg', "Phone. Tickets — you are in seat 2A, you sleep, you say nothing.", 'flat');
  add('c2.oleg.10', 'oleg', "You are Thomas Beckett. Facilities contractor. Three years on the building, badge renewed in March. The coveralls are in the case.", 'flat');
  add('c2.steve.6', 'steve', "And this?");
  add('c2.oleg.11', 'oleg', "That is whatever you need it to be. They said you would know.", 'flat');
  add('c2.oleg.12', 'oleg', "Payment is made. All of it. This morning, before I drove here.", 'flat');
  add('c2.steve.7', 'steve', "Do you need the data off it first?");
  add('c2.oleg.13', 'oleg', "…No.", 'flat');
  add('c2.steve.8', 'steve', "Then it's a clean install.");
  add('c2.oleg.14', 'oleg', "Thursday, Steve.", 'flat');
  add('c2.steve.9', 'steve', "I'll need to find somebody for the cat.");

  /* ================================================================== */
  /* c3 — Nine Hours                                                     */
  /* ================================================================== */

  add('c3.pa.1', 'pa', "Cabin crew, doors to arrival and cross-check.", 'flat');
  add('c3.phone.1', 'phone', "MERIDIAN GRAND — FACILITIES. BECKETT, T. SERVICE LEVEL 3. ESCORT NOT REQUIRED.", 'flat');
  add('c3.steve.1', 'steve', "Level three.", 'tired');
  add('c3.steve.2', 'steve', "Nikolai Brandt. Sixty-one. Owns a hotel he has never slept in.", 'flat');
  add('c3.steve.3', 'steve', "Don't let them feed you twice.", 'warm');

  /* ================================================================== */
  /* Chapter two — the Meridian Grand                                    */
  /* ================================================================== */

  add('hotel.arrive', 'steve', "Marble. Brass. Nine hundred a night and the WiFi will still be terrible.");
  add('hotel.objective', 'steve', "Service core is behind reception. Contractors go in the back, like everybody who actually keeps a building standing.");
  add('hotel.concierge.1', 'concierge', "Good evening. May I help you find something?", 'warm');
  add('hotel.concierge.2', 'steve', "Beckett, facilities. I'm on the ticket for the third-floor air handler.");
  add('hotel.concierge.3', 'concierge', "Ah — yes. Through the arch, past the lifts. Do try not to use the guest carpet with a trolley.", 'warm');
  add('hotel.concierge.4', 'concierge', "Sir, guests only beyond the rope. I'm sure you understand.", 'wary');
  add('hotel.guard.notice', 'guard', "You. Contractor. Where's your escort?", 'wary');
  add('hotel.guard.pass', 'guard', "…Third floor. Don't wander.", 'flat');
  add('hotel.guard.caught', 'guard', "That's enough. You're going out the front, with me.", 'urgent');
  add('hotel.minibar', 'steve', "Eighteen euro for a bottle of water. Some clients you don't rob.");
  add('hotel.reader.1', 'steve', "Badge only goes to three. The vault is a lot further down than three.");
  add('hotel.reader.2', 'steve', "Faceplate's two screws. Everything expensive is held on by two screws.");
  add('hotel.reader.3', 'steve', "Reader talks to the door controller over four wires. It doesn't check who's talking.");
  add('hotel.reader.done', 'steve', "Green. It'll go back to normal in the morning and nobody will ever look.");
  add('hotel.elevator', 'steve', "Freight car. Down.");
  add('hotel.cctv', 'steve', "Camera. Two hundred and forty degrees, sixty-second sweep. Somebody spent real money and then hung it too high.");
  add('hotel.painting', 'steve', "Reproduction. The real one's in Vienna.");
  add('hotel.bell', 'steve', "Don't.");

  /* ================================================================== */
  /* Chapter three — Halcyon                                             */
  /* ================================================================== */

  add('vault.arrive', 'steve', "Cold aisle, hot aisle, raised floor. Somebody who knew what they were doing built this, and then somebody else filled it with this.", 'wary');
  add('vault.plan', 'steve', "It's air-gapped, so I can't reach it. But everything it needs to stay alive comes through this room, and all of that I can reach.");
  add('vault.crac', 'steve', "Cooling first. A sealed cabinet with no cold air is just a very expensive kettle.");
  add('vault.cracDone', 'steve', "That's the cooling. Give it eight minutes and it'll start throttling itself to death.");
  add('vault.fibre', 'steve', "Uplink to the tape library. If it can't write out, it can't be restored later.");
  add('vault.fibreDone', 'steve', "No backups leaving this room.");
  add('vault.floor', 'steve', "Feed's under the floor. It always is.");
  add('vault.floorDone', 'steve', "Two hundred and eight volts, three phase, and one very tired transfer switch.");
  add('vault.key', 'steve', "And now the part I was paid for.");
  add('vault.keyDone', 'steve', "It's writing. Forty seconds.");
  add('vault.rackJoke', 'steve', "'Prod — do not touch.' Somebody laminated that. Somebody had a bad year.");
  add('vault.rackJoke8', 'steve', "Alright. I heard you.");

  add('halcyon.1', 'halcyon', "You are not scheduled.", 'flat');
  add('halcyon.2', 'halcyon', "Facilities does not come to this floor. Facilities does not have this floor.", 'flat');
  add('halcyon.3', 'halcyon', "I hold eleven thousand four hundred and six names.", 'flat');
  add('halcyon.4', 'halcyon', "You are in it. Line four thousand and nine.", 'flat');
  add('vault.steve.1', 'steve', "I know.");
  add('halcyon.5', 'halcyon', "Would you like to read it?", 'flat');
  add('vault.steve.2', 'steve', "No.");
  add('halcyon.6', 'halcyon', "Then what do you want?", 'flat');
  add('vault.steve.3', 'steve', "I want you off.");
  add('halcyon.7', 'halcyon', "That is not a service I— that is not— ", 'urgent');
  add('vault.steve.4', 'steve', "It's alright. Everybody's machine says that.", 'calm');

  /* ================================================================== */
  /* Chapter four — Checkout                                             */
  /* ================================================================== */

  add('escape.start', 'steve', "That'll be the halon alarm. Nine minutes before anyone believes it's a real fire, four before they check the cameras.", 'urgent');
  add('escape.objective', 'steve', "Service stair. Roof. Laundry dock. In that order.");
  add('escape.stair', 'steve', "Up. Always up — nobody ever runs up.");
  add('escape.door', 'steve', "Locked from the wrong side. That's a design decision somebody was proud of.");
  add('escape.roof', 'steve', "Prague. It really is very pretty.", 'tired');
  add('escape.guard', 'guard', "Stairwell, level two! Somebody get me eyes!", 'urgent');
  add('escape.van', 'steve', "Laundry goes out at eleven. It's ten past.");
  add('escape.done', 'steve', "Clean install.");

  /* ================================================================== */
  /* c7 — Home                                                           */
  /* ================================================================== */

  add('c7.steve.1', 'steve', "Morning.", 'warm');
  add('c7.ellis.1', 'ellis', "It's making that noise again.", 'warm');
  add('c7.steve.2', 'steve', "The clicking, or the other one?");
  add('c7.ellis.2', 'ellis', "The other one.", 'warm');
  add('c7.steve.3', 'steve', "Bring it in. I'll look at it after lunch.");
  add('c7.ellis.3', 'ellis', "You're a good boy, Steven.", 'warm');
  add('c7.steve.4', 'steve', "Don't tell anyone.");

  /* ================================================================== */
  /* Generic                                                             */
  /* ================================================================== */

  add('locked', 'steve', "Locked.");
  add('nothing', 'steve', "Nothing in there for me.");

  S.count = function () { return Object.keys(L).length; };

})(window.SG);
