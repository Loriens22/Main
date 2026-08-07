/* =====================================================================
 * 80_eggs.js — the easter egg registry.
 *
 * Defined up front so the pause menu can honestly say "7 of 26" and show a
 * redacted hint for the ones still out there. Levels mark them found via
 * ctx.egg(id). Rewards for curiosity, not for a scavenger hunt.
 * ===================================================================== */
(function (SG) {
  'use strict';

  var E = SG.eggs;

  var LIST = [
    /* --- the shop --- */
    ['duck', 'Rubber duck debugging',
      'Every technician has one. Squeeze it and he will explain himself.'],
    ['duckSix', 'The duck is a good listener',
      'Keep talking to it. It never gets bored.'],
    ['cat1', 'Kernel',
      'There is a cat asleep on the warmest object in the building.'],
    ['cat3', 'Kernel has decided',
      'Pet him three times and he will make a decision about you.'],
    ['cat10', 'Kernel does tech support',
      'Ten times. He will want to help.'],
    ['coffee', "World's okayest tech",
      'It is cold. Drink it anyway.'],
    ['y2k', 'The century byte',
      'The BIOS will let you set any year you like. One of them is funnier.'],
    ['adventure', 'A small text adventure',
      'Somebody left something on that drive in 1998. Boot it and type.'],
    ['whiteboard', 'A network diagram, drawn in March',
      'Read the board behind the bench. Check the date.'],
    ['floppy', 'TAXES_FINAL_final_v3.DOC',
      'Look through the box of floppies on the museum shelf.'],
    ['passports', 'Every name he has used',
      'The bottom drawer. Open it twice.'],
    ['sticky', 'Her password',
      'Something is taped under the keyboard.'],
    ['toolchest', 'The bottom drawer is heavier than it looks',
      'Open the tool chest.'],
    ['storeroom', 'Not for customers',
      'There is a second door behind the bench.'],
    ['register', 'Cash only',
      'Check the till.'],
    ['konami', 'Up up down down',
      'An old code, on a keyboard, in a shop full of old machines.'],

    /* --- the Meridian Grand --- */
    ['minibar', 'Eighteen euro',
      'The lobby minibar is priced for people who do not read prices.'],
    ['painting', 'The real one is in Vienna',
      'Look properly at the painting by the lifts.'],
    ['bell', 'Ringing the bell four times',
      'There is a bell on the reception desk. Do not.'],
    ['cctv', 'Hung too high',
      'Somebody spent real money on that camera and then installed it badly.'],

    /* --- the vault --- */
    ['prodRack', 'TOLD YOU',
      'One rack has a laminated sign on it. Ignore the sign. Eight times.'],
    ['breaker', 'Do not isolate',
      'Read circuit 14 on the breaker panel.'],
    ['tapes', 'Nine years of names',
      'Check the dates on the tape library.'],

    /* --- checkout --- */
    ['roofSleeper', 'Somebody sleeps up here',
      'Look behind the vent on the roof, if you have the time.']
  ];

  for (var i = 0; i < LIST.length; i++) {
    E.define(LIST[i][0], LIST[i][1], LIST[i][2]);
  }

  /* Convenience for the pause menu: found first, then redacted. */
  E.list = function () {
    var out = [];
    for (var k in E.all) {
      if (!Object.prototype.hasOwnProperty.call(E.all, k)) continue;
      var e = E.all[k];
      out.push({
        id: e.id,
        title: e.title,
        hint: e.hint,
        found: !!SG.state.eggs[e.id]
      });
    }
    out.sort(function (a, b) {
      if (a.found !== b.found) return a.found ? -1 : 1;
      return a.title < b.title ? -1 : 1;
    });
    return out;
  };

  E.summary = function () {
    return SG.eggs.found() + ' / ' + SG.eggs.total();
  };

})(window.SG);
