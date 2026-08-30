// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Behavioural assertions for chapter 3, run by check.py under JavaScriptCore.

// ---- Predict before the reveal ----
// The device only works if it cannot be skimmed: nothing explains itself until
// a guess is committed, exactly one option is right, and a wrong guess is
// marked wrong rather than quietly corrected. Asserted per bet, and swept, so
// a bet added later without an explanation is caught.
(function () {
  var BETS = [["bet-cost", 4], ["bet-handover", 4]];
  function opts(name, n) {
    var i, out = [];
    for (i = 0; i < n; i++) { out.push(REG[name + "-o" + i]); }
    return out;
  }
  function shown(name, n) {
    var i, on = [];
    for (i = 0; i < n; i++) {
      if (REG[name + "-w" + i].classList.contains("is-on")) { on.push(i); }
    }
    return on.join("+");
  }
  var b, name, n, i, right, o;

  for (b = 0; b < BETS.length; b++) {
    name = BETS[b][0]; n = BETS[b][1];
    o = opts(name, n);
    right = [];
    for (i = 0; i < n; i++) {
      if (o[i].getAttribute("data-ok") === "true") { right.push(i); }
      if (REG[name + "-w" + i].textContent.length < 40) {
        throw new Error(name + " option " + i + " has no reasoning behind it");
      }
    }
    chk(name + " has exactly one right answer", right.length, 1);
    chk(name + " gives nothing away before a guess", shown(name, n), "");
    chk(name + " marks nothing before a guess", (function () {
      var k, m = 0;
      for (k = 0; k < n; k++) {
        if (o[k].className.indexOf("is-") > -1) { m++; }
      }
      return m;
    }()), 0);
  }

  // Guess wrong on the first bet: the wrong one is marked wrong, the right one
  // is revealed beside it, and the reasoning shown is the one for the guess.
  name = BETS[0][0]; n = BETS[0][1]; o = opts(name, n);
  var wrong = o[0].getAttribute("data-ok") === "true" ? 1 : 0;
  var correct = o[0].getAttribute("data-ok") === "true" ? 0 : null;
  for (i = 0; i < n && correct === null; i++) {
    if (o[i].getAttribute("data-ok") === "true") { correct = i; }
  }
  REG[name + "-o" + wrong].fire("click");
  chk(name + ": a wrong guess is marked wrong",
      o[wrong].classList.contains("is-wrong"), true);
  chk(name + ": and the right answer is revealed beside it",
      o[correct].classList.contains("is-right"), true);
  chk(name + ": with the reasoning for the guess that was made",
      shown(name, n), String(wrong));
  REG[name + "-o" + correct].fire("click");
  chk(name + ": and it cannot be answered twice", shown(name, n), String(wrong));

  // Guess right on the second: right is marked right and nothing is wrong.
  name = BETS[1][0]; n = BETS[1][1]; o = opts(name, n);
  correct = null;
  for (i = 0; i < n; i++) {
    if (o[i].getAttribute("data-ok") === "true") { correct = i; }
  }
  REG[name + "-o" + correct].fire("click");
  chk(name + ": a right guess is marked right",
      o[correct].classList.contains("is-right"), true);
  chk(name + ": and nothing is marked wrong", (function () {
    var k, m = 0;
    for (k = 0; k < n; k++) { if (o[k].classList.contains("is-wrong")) { m++; } }
    return m;
  }()), 0);
  chk(name + ": with its own reasoning shown", shown(name, n), String(correct));
}());

// ---- Figure 1: three moments ----
chk("the moments figure opens on the first one",
    REG["mo-0"].getAttribute("aria-pressed"), "true");
chk("and lights that panel", REG["mop-0"].classList.contains("is-on"), true);
REG["mo-2"].fire("click");
chk("picking the third moment presses it",
    REG["mo-2"].getAttribute("aria-pressed"), "true");
chk("and releases the first", REG["mo-0"].getAttribute("aria-pressed"), "false");
(function () {
  var i, lit = 0;
  for (i = 0; i < 3; i++) { if (REG["mop-" + i].classList.contains("is-on")) { lit++; } }
  chk("exactly one moment is ever explained at a time", lit, 1);
}());
REG["mo-0"].fire("click");

// ---- Figure 2: the twenty-eight bytes ----
// Seven words, and the figure exists to say what each one does. Its panels are
// shown one at a time, because seven at once is the wall this series is written
// against; without scripting none of that runs and all seven stay readable.
chk("the block figure opens on the start marker",
    REG["bw-0"].getAttribute("aria-pressed"), "true");
(function () {
  var i, off = 0, on = 0;
  for (i = 0; i < 7; i++) {
    if (REG["bwp-" + i].classList.contains("is-off")) { off++; }
    if (REG["bwp-" + i].classList.contains("is-on")) { on++; }
  }
  chk("six of the seven word panels are put away", off, 6);
  chk("and exactly one is open", on, 1);
}());
(function () {
  var i, seen = {}, count = 0;
  for (i = 0; i < 7; i++) {
    REG["bw-" + i].fire("click");
    if (!REG["bwp-" + i].classList.contains("is-on")) {
      throw new Error("word " + i + " did not open its own panel");
    }
    if (!seen[REG["bwp-" + i].textContent]) {
      seen[REG["bwp-" + i].textContent] = 1; count++;
    }
  }
  chk("each of the seven words says something different", count, 7);
}());
// The word that ties this chapter back to chapter 1's address map.
chk("the fourth word is the address the kernel begins at",
    REG["bw-3"].textContent.indexOf("0x10000400") > -1, true);
chk("and it sits at the fourth word's own address in flash",
    REG["bw-3"].textContent.indexOf("0x1000000C") > -1, true);
chk("and its panel says so",
    REG["bwp-3"].textContent.indexOf("kernel") > -1, true);
// The size field is arithmetic: one word of image type, two of vector table.
chk("the last item's panel gives the count it encodes",
    REG["bwp-4"].textContent.indexOf("three") > -1, true);
REG["bw-0"].fire("click");

// ---- Figure 3: the vector table ----
chk("the table opens on the first entry",
    REG["vt-0"].getAttribute("aria-pressed"), "true");
chk("which is the stack pointer, not code",
    REG["vtp-0"].textContent.indexOf("stack pointer") > -1, true);
REG["vt-1"].fire("click");
chk("the second entry is the reset handler",
    REG["vtp-1"].textContent.indexOf("reset handler") > -1, true);
chk("and the first is put away", REG["vtp-0"].classList.contains("is-off"), true);
REG["vt-0"].fire("click");

// ---- Figure 4: the two loops ----
chk("the loops figure opens on the first loop",
    REG["lp-0"].getAttribute("aria-pressed"), "true");
chk("which is the one that writes zeros",
    REG["lpp-0"].textContent.indexOf("zero") > -1, true);
REG["lp-1"].fire("click");
chk("the second loop is the one that copies",
    REG["lpp-1"].textContent.indexOf("Copies") > -1, true);
chk("and it is the one that ends in main",
    REG["lpp-1"].textContent.indexOf("bl main") > -1, true);
REG["lp-0"].fire("click");

// ---- Figure 5: what a variable costs ----
// The whole point is the flash column, so it is read rather than assumed.
chk("a variable starting at zero costs no flash",
    REG["cost-flash"].textContent, "0 bytes");
chk("and is zeroed by the first loop", REG["cost-by"].textContent, "the first loop");
chk("and lives in bss", REG["cost-sec"].textContent, ".bss");
REG["cs-1"].fire("click");
chk("a variable starting at five costs four bytes",
    REG["cost-flash"].textContent, "4 bytes");
chk("lives in data", REG["cost-sec"].textContent, ".data");
chk("and is copied by the second loop",
    REG["cost-by"].textContent, "the second loop");
REG["cs-2"].fire("click");
chk("a kilobyte of zeros still costs no flash",
    REG["cost-flash"].textContent, "0 bytes");
chk("because it is zeroed, not copied", REG["cost-sec"].textContent, ".bss");
REG["cs-0"].fire("click");

// ---- Figure 4: the two loops, run ----
// Reading the assembly says what the loops are. Running them says what they do,
// and the fact worth producing is that RAM at power-on is not zero but whatever
// it was -- which no static listing can show.
(function () {
  function cells() {
    var i, out = [];
    for (i = 0; i < 6; i++) { out.push(REG["mc-" + i].textContent); }
    return out.join(",");
  }
  function said() {
    var S = ["start", "zero", "copy", "done"], i, on = [];
    for (i = 0; i < S.length; i++) {
      if (REG["lo-" + S[i]].classList.contains("is-on")) { on.push(S[i]); }
    }
    return on.join(",");
  }

  REG["lp-0"].fire("click");
  chk("it powers on holding junk, not zeros",
      cells(), "0x8F2A01C4,0x00000000,0xD41B77E0,0x0000002A,0xB0C3FF19,0x5E00A184");
  chk("and says so", said(), "start");
  chk("with every word still to go", REG["rg4-3"].textContent, "6");
  chk("the flash row is not shown for the zeroing loop",
      REG["fl-row"].classList.contains("is-off"), true);

  REG["lo-step"].fire("click");
  chk("one step zeroes one word",
      cells(), "0x00000000,0x00000000,0xD41B77E0,0x0000002A,0xB0C3FF19,0x5E00A184");
  chk("and moves r0 on by four", REG["rg4-0"].textContent, "0x20000104");
  chk("with one fewer to go", REG["rg4-3"].textContent, "5");

  REG["lo-run"].fire("click");
  chk("running it to the end zeroes all six",
      cells(), "0x00000000,0x00000000,0x00000000,0x00000000,0x00000000,0x00000000");
  chk("and r0 has reached r1, which is what stops it",
      REG["rg4-0"].textContent, REG["rg4-1"].textContent);
  chk("with nothing left to go", REG["rg4-3"].textContent, "0");
  chk("and it says why it stopped", said(), "done");
  chk("stepping past the end is not offered", REG["lo-step"].disabled, true);

  // The second word was already zero and gets written anyway, which is the
  // note's claim about a loop that checks nothing.
  REG["lo-reset"].fire("click");
  chk("a word that was already zero is still in range",
      REG["mc-1"].textContent, "0x00000000");

  // The copying loop is the same store with a different source.
  REG["lp-1"].fire("click");
  chk("choosing the second loop shows where the values come from",
      REG["fl-row"].classList.contains("is-off"), false);
  chk("and puts the memory back to junk", REG["mc-0"].textContent, "0x8F2A01C4");
  REG["lo-run"].fire("click");
  chk("running it copies flash into RAM, in order",
      cells(), "0x00000005,0x0000000C,0x00000007,0x00000063,0x00000001,0x000003E8");
  chk("and every word matches the flash it came from",
      [REG["mc-0"].textContent, REG["mc-3"].textContent].join(","),
      [REG["fc-0"].textContent, REG["fc-3"].textContent].join(","));

  // Switching loops restarts, rather than leaving half a run on screen.
  REG["lp-0"].fire("click");
  chk("switching back starts over", REG["rg4-3"].textContent, "6");
  chk("and r2 is the zero the first loop stores", REG["rg4-2"].textContent, "0");
  REG["lp-1"].fire("click");
  chk("while the second loop's r2 is a flash address",
      REG["rg4-2"].textContent, "0x10008000");
  REG["lp-0"].fire("click");
  REG["lo-reset"].fire("click");
}());

// ---- Figure 5: the two costs, as they scale ----
// The three declarations state the rule at three points. The slider is what
// makes it a shape: RAM grows with the array either way, flash only when the
// initial bytes are not zeros.
(function () {
  function ram() { return REG["cs-ram"].textContent; }
  function flash() { return REG["cs-flash"].textContent; }

  REG["cs-0"].fire("click");
  REG["cs-n"].value = 1024;
  REG["cs-n"].fire("input");
  chk("zeros cost RAM", ram(), "1024 B");
  chk("and no flash at all", flash(), "0 B");

  REG["cs-n"].value = 2048;
  REG["cs-n"].fire("input");
  chk("twice the array is twice the RAM", ram(), "2048 B");
  chk("and still no flash", flash(), "0 B");

  REG["cs-1"].fire("click");
  chk("a non-zero initial value costs flash too", flash(), "2048 B");
  chk("and the same RAM as before", ram(), "2048 B");

  // The rule across the whole range, computed here rather than read back.
  (function () {
    var i, bad = 0;
    for (i = 1; i <= 2048; i += 137) {
      REG["cs-n"].value = i;
      REG["cs-n"].fire("input");
      REG["cs-0"].fire("click");
      if (ram() !== i + " B" || flash() !== "0 B") { bad++; }
      REG["cs-1"].fire("click");
      if (ram() !== i + " B" || flash() !== i + " B") { bad++; }
    }
    chk("RAM tracks the array and flash tracks only the non-zero case", bad, 0);
  }());

  // The declaration is rebuilt as you drag, so it must not go stale.
  REG["cs-n"].value = 64;
  REG["cs-n"].fire("input");
  REG["cs-0"].fire("click");
  chk("the declaration shows the length you dragged to",
      REG["cs-decl"].textContent.indexOf("64") > -1, true);
  chk("and the value it starts as",
      REG["cs-decl"].textContent.indexOf("[0; 64]") > -1, true);
  REG["cs-1"].fire("click");
  chk("which changes when the case does",
      REG["cs-decl"].textContent.indexOf("[7; 64]") > -1, true);
  REG["cs-0"].fire("click");
  REG["cs-n"].value = 1024;
  REG["cs-n"].fire("input");
}());

// ---- Figure 6: the walk from power to main ----
// Four readings, and the handover is the moment three of them move together.
(function () {
  function at() { return REG["bw-at"].textContent; }
  REG["bw-reset"].fire("click");
  chk("it powers on at step 1", at(), "1");
  chk("with the chip holding the processor", REG["bw-run"].textContent, "the chip");
  chk("and core 1 still awake", REG["bw-core"].textContent, "awake");
  chk("RAM meaning nothing", REG["bw-ram"].textContent, "whatever it held");
  chk("back is not offered at the start", REG["bw-prev"].disabled, true);

  REG["bw-next"].fire("click");
  chk("core 1 is asleep by the second step", REG["bw-core"].textContent, "asleep");
  chk("and the ROM has the processor", REG["bw-run"].textContent, "the boot ROM");

  // Steps 3 to 5 are the search, and nothing of ours runs in them.
  REG["sq-4"].fire("click");
  chk("through the search it is still the ROM", REG["bw-run"].textContent, "the boot ROM");
  chk("reading the vector table", REG["bw-pc"].textContent, "0x10000400");
  chk("and RAM still means nothing", REG["bw-ram"].textContent, "whatever it held");

  // The handover. Step 6 is the ROM reading the second word and jumping
  // through it, so the ROM is still what is running; Tock holds from step 7.
  // The note has always said "only the last two are your program running", and
  // this is the assertion that keeps the readouts agreeing with it.
  REG["sq-5"].fire("click");
  chk("step 6 is still the ROM, because it is the ROM doing the jumping",
      REG["bw-run"].textContent, "the boot ROM");
  chk("and is not yet marked as ours",
      REG["bw-run"].classList.contains("is-ours"), false);
  REG["sq-6"].fire("click");
  chk("step 7 is where Tock has it", REG["bw-run"].textContent, "Tock");
  chk("and it is marked as ours", REG["bw-run"].classList.contains("is-ours"), true);

  chk("the reset handler is what makes RAM mean something",
      REG["bw-ram"].textContent, ".bss zeroed, .data copied");
  REG["sq-7"].fire("click");
  chk("and then main", REG["bw-pc"].textContent, "main");
  chk("forward is not offered at the end", REG["bw-next"].disabled, true);

  // Five of the eight belong to code nobody wrote, which is the note's claim.
  (function () {
    var i, ours = 0;
    for (i = 0; i < 8; i++) {
      REG["sq-" + i].fire("click");
      if (REG["bw-run"].textContent === "Tock") { ours++; }
    }
    chk("two of the eight steps are ours, which is what the note claims", ours, 2);
  }());

  // Walking marks what is behind you.
  REG["bw-reset"].fire("click");
  chk("nothing is behind you at the start",
      REG["sq-0"].classList.contains("is-past"), false);
  REG["sq-3"].fire("click");
  chk("earlier steps are marked as walked",
      REG["sq-0"].classList.contains("is-past")
        && REG["sq-2"].classList.contains("is-past"), true);
  chk("and later ones are not",
      REG["sq-4"].classList.contains("is-past"), false);
  REG["bw-reset"].fire("click");
}());

// ---- Figure 6: the sequence ----
(function () {
  var i, pressed = 0;
  for (i = 0; i < 8; i++) {
    if (REG["sq-" + i].getAttribute("aria-pressed") === "true") { pressed++; }
  }
  chk("the sequence marks exactly one step", pressed, 1);
}());
REG["sq-5"].fire("click");
chk("marking a later step presses it",
    REG["sq-5"].getAttribute("aria-pressed"), "true");
chk("and unmarks the first", REG["sq-0"].getAttribute("aria-pressed"), "false");
chk("step 6 is the handover from the ROM to Tock",
    REG["sq-5"].textContent.indexOf("handover") > -1, true);
REG["sq-0"].fire("click");

// ---- Figure 7: the debugger's entry ----
chk("the stub figure opens on its first instruction",
    REG["db-0"].getAttribute("aria-pressed"), "true");
REG["db-2"].fire("click");
chk("the third line is the store, and is named as one",
    REG["dbp-2"].textContent.indexOf("store") > -1, true);
REG["db-5"].fire("click");
chk("the last line jumps rather than calls",
    REG["dbp-5"].textContent.indexOf("Jump") > -1, true);
REG["db-0"].fire("click");

// ---- Check yourself ----
(function () {
  var n, hidden = 0;
  for (n = 1; n <= 4; n++) {
    if (REG["qa-" + n].classList.contains("is-off")) { hidden++; }
  }
  chk("all four answers are hidden before anything is answered", hidden, 4);
}());
(function () {
  var n, m, keys = 0;
  for (n = 1; n <= 4; n++) {
    for (m = 0; m < 3; m++) {
      if (REG["qo-" + n + "-" + m].getAttribute("data-ok") === "1") { keys++; }
    }
  }
  chk("each question has exactly one answer key", keys, 4);
}());
REG["qo-1-0"].fire("click");
chk("a wrong choice still reveals the reasoning",
    REG["qa-1"].classList.contains("is-off"), false);
chk("and says so", REG["qn-1"].classList.contains("is-shown"), true);
chk("marking the choice wrong", REG["qo-1-0"].classList.contains("is-wrong"), true);
chk("and pointing at the right one",
    REG["qo-1-1"].classList.contains("is-right"), true);
REG["qo-1-1"].fire("click");
chk("answering twice does not rewrite the verdict",
    REG["qy-1"].classList.contains("is-shown"), false);
REG["qo-4-0"].fire("click");
chk("the flash question accepts its right answer",
    REG["qy-4"].classList.contains("is-shown"), true);

// ---- what the review pass found ----
// The declarations were written as `let` bindings, which are stack locals and
// never reach .bss or .data at all -- the figure's whole premise needs statics.
(function () {
  var i, statics = 0;
  for (i = 0; i < 3; i++) {
    if (REG["cs-" + i].textContent.indexOf("static") === 0) { statics++; }
  }
  chk("every declaration in the cost figure is a static", statics, 3);
}());
// _estack is the top of a reserved stack buffer at the *lowest* address in
// SRAM, not the top of RAM. Tock does that so an overflow faults.
chk("the stack panel says which end of RAM the stack sits at",
    REG["vtp-0"].textContent.indexOf("bottom") > -1, true);
chk("and why that is deliberate",
    REG["vtp-0"].textContent.indexOf("faults") > -1, true);

// ---- what the third review pass found ----
// Chapter 1 promises "Chapter 3 opens them up" of both things sharing the first
// kilobyte of flash. The 28-byte block gets Figure 2; the 256-byte loader had
// one line in the sources list and nothing else.
chk("the other half of that first kilobyte is opened up",
    REG["pairs-kilobyte"].textContent.indexOf("256 bytes") > -1, true);
chk("and says the loader is about speed rather than booting",
    REG["pairs-kilobyte"].textContent.indexOf("faster") > -1, true);
// The two loops set up statics. A local is set up by its own function and never
// reaches .bss or .data -- the same error that had the declarations as `let`.
(function () {
  var i, loose = 0;
  for (i = 0; i < 2; i++) {
    if (REG["lpp-" + i].textContent.indexOf("every variable") > -1) { loose++; }
  }
  chk("neither loop panel claims to handle every variable", loose, 0);
  chk("and both say static instead",
      REG["lpp-0"].textContent.indexOf("every static") > -1
        && REG["lpp-1"].textContent.indexOf("every static") > -1, true);
}());
// msr is the one instruction in Figure 7 that neither chapter has shown before,
// and two sentences used to claim the reader had met all six.
chk("the new instruction is named as new rather than assumed",
    REG["dbp-4"].textContent.indexOf("one new instruction") > -1, true);
