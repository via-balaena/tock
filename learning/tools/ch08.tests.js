// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Behavioural assertions for chapter 8, run by check.py under JavaScriptCore.

// Same helpers as chapters 4 to 7: every figure here is one row of buttons and
// one row of panels sharing an index, built by one function. That is a single
// point of failure, so each figure is walked separately rather than once.
function onlyOne(prefix, n, cls) {
  var i, lit = 0;
  for (i = 0; i < n; i++) {
    if (REG[prefix + i].classList.contains(cls)) { lit++; }
  }
  return lit;
}

function walk(btn, panel, n, name) {
  var i;
  for (i = 0; i < n; i++) {
    REG[btn + i].fire("click");
    if (!REG[panel + i].classList.contains("is-on")) {
      throw new Error(name + ": entry " + i + " did not open its own panel");
    }
    if (REG[btn + i].getAttribute("aria-pressed") !== "true") {
      throw new Error(name + ": entry " + i + " was not pressed by its click");
    }
    if (onlyOne(panel, n, "is-on") !== 1) {
      throw new Error(name + ": " + onlyOne(panel, n, "is-on") +
                      " panels open after clicking " + i);
    }
  }
}

// ---- Predict before the reveal ----
// The device only works if it cannot be skimmed: nothing explains itself until
// a guess is committed, exactly one option is right, and a wrong guess is
// marked wrong rather than quietly corrected. Asserted per bet, and swept, so
// a bet added later without an explanation is caught.
(function () {
  var BETS = [["bet-unused", 4], ["bet-bookkeeping", 4]];
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
  // Without this the run dies further down on a null index, and the message
  // is "undefined is not an object" rather than the name of the broken bet.
  if (correct === null) { throw new Error(name + " has no right answer at all"); }
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

// ---- No figure may boot empty ----
chk("figure 1 opens on the way this kernel takes", REG["wy-3"].getAttribute("aria-pressed"), "true");
chk("and not on one of the three it rules out", REG["wy-0"].getAttribute("aria-pressed"), "false");
chk("figure 2 opens on the table at the top", REG["bd-0"].getAttribute("aria-pressed"), "true");
chk("figure 3 opens on the console's own alignment", REG["gs-a4"].getAttribute("aria-pressed"), "true");
chk("figure 4 opens on the first unused slot", REG["ws-0"].getAttribute("aria-pressed"), "true");
chk("figure 5 opens on the board booting", REG["lf-0"].getAttribute("aria-pressed"), "true");
chk("figure 6 opens on what a capsule holds", REG["ch-0"].getAttribute("aria-pressed"), "true");
chk("figure 7 opens on the refusal that stops the board", REG["rf-0"].getAttribute("aria-pressed"), "true");
chk("figure 8 opens with nothing asked for yet", REG["gap-line"].textContent, "neither");
chk("figure 9 opens on chapter 1", REG["ar-0"].getAttribute("aria-pressed"), "true");
chk("and every one of those has its panel open",
    REG["wyp-3"].classList.contains("is-on")
      && REG["bdp-0"].classList.contains("is-on")
      && REG["gsp-console"].classList.contains("is-on")
      && REG["wsp-0"].classList.contains("is-on")
      && REG["lfp-0"].classList.contains("is-on")
      && REG["chp-0"].classList.contains("is-on")
      && REG["rfp-0"].classList.contains("is-on")
      && REG["gapp-idle"].classList.contains("is-on")
      && REG["arp-0"].classList.contains("is-on"), true);

// ---- Figure 1: four ways to keep per-process state ----
walk("wy-", "wyp-", 4, "figure 1");
REG["wy-1"].fire("click");
chk("the heap is ruled out because there is nothing to ask",
    REG["wyp-1"].textContent.indexOf("nothing to ask") > -1, true);
REG["wy-3"].fire("click");
chk("the chosen one charges the process that caused the need",
    REG["wyp-3"].textContent.indexOf("Take the memory out of the process that caused the need") > -1, true);
chk("and the note says what that does to the accounting",
    REG["wy-note"].textContent.indexOf("charged rather than estimated") > -1, true);

// ---- Figure 2: the bands of one process's memory ----
walk("bd-", "bdp-", 6, "figure 2");
(function () {
  // The figure's argument is that two lines move and they move towards each
  // other. Counting how many panels contain the word "up" would pass on a
  // page that said nothing; these name the two and check the directions are
  // opposite.
  REG["bd-2"].fire("click");
  var kernelLine = REG["bdp-2"].textContent;
  REG["bd-4"].fire("click");
  var appLine = REG["bdp-4"].textContent;
  chk("the kernel's line only ever goes down",
      kernelLine.indexOf("Every new grant lowers it") > -1
        && kernelLine.indexOf("nothing raises it while the process runs") > -1, true);
  chk("and the process's line is the one that goes up",
      appLine.indexOf("asking to move this line up") > -1, true);
  chk("the grants under the table are a bump, downward",
      REG["bdp-1"].textContent.indexOf("only ever downward") > -1, true);
}());
REG["bd-0"].fire("click");
chk("the table is cut before the process runs",
    REG["bdp-0"].textContent.indexOf("before the process runs a single instruction") > -1, true);
chk("and every process carries all of it",
    REG["bdp-0"].textContent.indexOf("whether it uses any of those drivers or not") > -1, true);
REG["bd-3"].fire("click");
chk("the gap belongs to whoever asks first",
    REG["bdp-3"].textContent.indexOf("whichever asks first gets it") > -1, true);
chk("the note names which half is eager and which is lazy",
    REG["bd-note"].textContent.indexOf("the table at the top is eager and the grants under it are lazy") > -1, true);

// ---- Figure 3: the grant sizer ----
// The bench runs grant_size again in JavaScript. The four configurations below
// are compiled by grant-sizes.rs beside the page, and check.py refuses a total
// here that the compiler did not produce -- so editing the arithmetic and
// editing these numbers to match still fails.
(function () {
  function set(up, ro, rw, state, align) {
    REG["gs-up"].value = String(up); REG["gs-up"].fire("input");
    REG["gs-ro"].value = String(ro); REG["gs-ro"].fire("input");
    REG["gs-rw"].value = String(rw); REG["gs-rw"].fire("input");
    REG["gs-size"].value = String(state); REG["gs-size"].fire("input");
    REG[align === 8 ? "gs-a8" : "gs-a4"].fire("click");
  }
  function n(id) { return parseInt(REG[id].textContent, 10); }
  function total() { return n("gs-total"); }
  function rows() {
    return [n("gs-head"), n("gs-slots"), n("gs-pad"), n("gs-state")];
  }
  function open_() {
    var SAY = ["console", "nopad", "pad", "bare", "slots"], i, on = [];
    for (i = 0; i < SAY.length; i++) {
      if (REG["gsp-" + SAY[i]].classList.contains("is-on")) { on.push(SAY[i]); }
    }
    return on.join("+");
  }

  // The console, which is the number the whole chapter is about.
  REG["gs-console"].fire("click");
  chk("the console's own grant is what the probe compiled", total(), 76);
  chk("and the four rows are the four terms",
      rows().join(","), "4,56,0,16");
  chk("which add to the total", rows()[0] + rows()[1] + rows()[2] + rows()[3], 76);
  chk("and the bench says these are the console's numbers", open_(), "console");
  chk("with ten processes priced at ten times it", REG["gs-ten"].textContent, "760 bytes");

  // The same driver with no slots at all: the slots priced on their own.
  set(0, 0, 0, 16, 4);
  chk("the same driver with no slots is what the probe compiled", total(), 20);
  chk("and the counters word is still there with nothing to count", rows()[0], 4);
  chk("and the bench says so", open_(), "bare");

  // The three configurations grant-sizes.rs compiles for this bench alone.
  set(3, 2, 2, 16, 8);
  chk("the console's slots with an eight-byte-aligned state", total(), 80);
  chk("which is the console's total plus exactly the padding", total() - 76, rows()[2]);
  set(0, 0, 0, 0, 4);
  chk("no slots and no state is still a counters word", total(), 4);
  set(8, 8, 8, 32, 8);
  chk("and the widest the bench goes", total(), 232);
  set(0, 0, 0, 4, 8);
  chk("the smallest grant that still pays for padding", total(), 12);

  // The rule the bench exists to make findable: padding is zero everywhere a
  // four-byte-aligned driver can be put, and four everywhere an eight-byte one
  // can be. Sweeping is the only way to assert "everywhere".
  (function () {
    var up, ro, rw, st, bad4 = 0, bad8 = 0, sum = 0;
    for (up = 0; up <= 8; up += 4) {
      for (ro = 0; ro <= 8; ro += 4) {
        for (rw = 0; rw <= 8; rw += 4) {
          for (st = 0; st <= 32; st += 8) {
            set(up, ro, rw, st, 4);
            if (n("gs-pad") !== 0) { bad4++; }
            if (total() !== rows()[0] + rows()[1] + rows()[2] + rows()[3]) { sum++; }
            set(up, ro, rw, st, 8);
            if (n("gs-pad") !== 4) { bad8++; }
            if (total() !== rows()[0] + rows()[1] + rows()[2] + rows()[3]) { sum++; }
          }
        }
      }
    }
    chk("a four-byte-aligned state is never padded, at any count", bad4, 0);
    chk("and an eight-byte-aligned one always pays exactly four", bad8, 4 - 4);
    chk("and the rows add to the total at every setting", sum, 0);
  }());

  // Exactly one sentence, always, and the padding panel only when there is any.
  (function () {
    var up, st, a, bad = 0;
    for (a = 0; a < 2; a++) {
      for (up = 0; up <= 8; up++) {
        for (st = 0; st <= 32; st += 4) {
          set(up, 0, 0, st, a === 0 ? 4 : 8);
          if (open_().indexOf("+") > -1 || open_() === "") { bad++; }
          if ((open_() === "pad") !== (n("gs-pad") > 0)) { bad++; }
        }
      }
    }
    chk("one sentence shows at every setting, and the padding one only when padded",
        bad, 0);
  }());

  chk("the kernel's part is the counters word and the slots",
      (set(3, 2, 2, 16, 4), REG["gs-kern"].textContent), "60 bytes");
  chk("and the slot count is their sum", REG["gs-n"].textContent, "7");
  chk("a part too small for its name does not print a clipped one",
      (set(8, 8, 8, 32, 8), REG["gs-b-head"].classList.contains("is-narrow")), true);
  chk("while a part with room for it keeps it",
      REG["gs-b-slots"].classList.contains("is-narrow"), false);
  chk("and the same part is named again once it is most of the grant",
      (set(0, 0, 0, 32, 4), REG["gs-b-state"].classList.contains("is-narrow")), false);
  chk("what a slot holds is on the page rather than behind a click",
      REG["gs-foot"].textContent.indexOf("Every slot is eight bytes") > -1, true);
  REG["gs-console"].fire("click");
}());
chk("the note says the number was compiled, not added up",
    REG["pt-note"].textContent.indexOf("not a number worked out by adding up field widths") > -1, true);
chk("and gives the slotless comparison", REG["pt-note"].textContent.indexOf("would be twenty") > -1, true);
chk("the listing shows the counts living in the type",
    REG["conslist"].textContent.indexOf("UpcallCount") > -1
      && REG["conslist"].textContent.indexOf("AllowRoCount") > -1, true);
chk("and the prose says those counts are fixed at compile time",
    REG["constgen"].textContent.indexOf("has to be recompiled") > -1, true);

// ---- Figure 4: the slots nobody fills ----
walk("ws-", "wsp-", 3, "figure 4");
(function () {
  // All three are the same eight bytes for the same reason, and the figure
  // fails if any of them stops saying so.
  var i, eights = 0;
  for (i = 0; i < 3; i++) {
    REG["ws-" + i].fire("click");
    if (REG["wsp-" + i].textContent.indexOf("Eight bytes") > -1
        || REG["wsp-" + i].textContent.indexOf("eight bytes") > -1) { eights++; }
  }
  chk("all three unused slots are eight bytes", eights, 3);
}());
chk("the note prices them against the whole grant",
    REG["ws-note"].textContent.indexOf("Twenty-four bytes of a seventy-six-byte grant") > -1, true);
chk("and says the cost lands on the process, not the kernel",
    REG["ws-note"].textContent.indexOf("paid again by every process") > -1, true);
chk("the section quotes the comment that explains the numbering",
    REG["whyzero"].textContent.indexOf("so to preserve compatibility we still use allow number 1 now") > -1, true);
REG["ws-0"].fire("click");

// ---- Figure 5: a grant's life ----
walk("lf-", "lfp-", 5, "figure 5");
(function () {
  var i, bad = [];
  for (i = 0; i < 5; i++) {
    if (REG["lf-" + i].textContent.indexOf(String(i + 1)) !== 0) {
      bad.push("moment " + (i + 1) + " is labelled " + REG["lf-" + i].textContent);
    }
  }
  chk("the five moments are numbered 1 to 5 in order", bad.join("; "), "");
}());
REG["lf-0"].fire("click");
chk("creating a grant allocates nothing",
    REG["lfp-0"].textContent.indexOf("No memory anywhere") > -1, true);
REG["lf-1"].fire("click");
chk("a table entry uses null as the flag, not the driver number",
    REG["lfp-1"].textContent.indexOf("zero is a real driver number") > -1, true);
REG["lf-2"].fire("click");
chk("first use is the only moment the region shrinks",
    REG["lfp-2"].textContent.indexOf("the only moment in the five where the region gets smaller") > -1, true);
REG["lf-3"].fire("click");
chk("and every use after the first allocates nothing",
    REG["lfp-3"].textContent.indexOf("allocates once") > -1, true);
REG["lf-4"].fire("click");
chk("a restart is the only refund",
    REG["lfp-4"].textContent.indexOf("the only refund in this chapter") > -1, true);
// Chapter 7 said a running process could never lower that mark. This chapter
// is where the exception lives, and the two have to agree.
chk("and it says which chapter 7 claim it qualifies",
    REG["lfp-4"].textContent.indexOf("could never lower comes down with them") > -1, true);
REG["lf-0"].fire("click");

// ---- Figure 6: two numbers to a mutable reference ----
walk("ch-", "chp-", 4, "figure 6");
REG["ch-0"].fire("click");
chk("what a capsule holds refers to no memory",
    REG["chp-0"].textContent.indexOf("refers to no memory") > -1, true);
REG["ch-1"].fire("click");
chk("the middle step is where allocation can happen",
    REG["chp-1"].textContent.indexOf("where allocation can happen") > -1, true);
REG["ch-3"].fire("click");
chk("closing happens by a value going out of scope",
    REG["chp-3"].textContent.indexOf("going out of scope") > -1, true);
chk("and the section says why that matters",
    REG["enterline"].textContent.indexOf("even on an early return") > -1, true);
chk("the note ties the borrow back to chapter 4's rule",
    REG["ch-note"].textContent.indexOf("reaches what it is handed, for as long as it is handed it") > -1, true);
REG["ch-0"].fire("click");

// ---- Figure 7: three refusals ----
walk("rf-", "rfp-", 3, "figure 7");
(function () {
  // One of the three stops the board and two come back as values. That split
  // is the figure's whole point, so it is counted rather than described.
  var i, fatal = 0;
  for (i = 0; i < 3; i++) {
    REG["rf-" + i].fire("click");
    if (REG["rfp-" + i].textContent.indexOf("Panic") === 0) { fatal++; }
  }
  chk("exactly one of the three refusals stops the board", fatal, 1);
}());
REG["rf-0"].fire("click");
chk("the panic is explained by the two references it would create",
    REG["rfp-0"].textContent.indexOf("Two mutable references to one object") > -1, true);
chk("and the loop's escape from it is named",
    REG["rfp-0"].textContent.indexOf("silently skips a grant that is already open") > -1, true);
chk("the note draws the same line chapter 7 drew",
    REG["rf-note"].textContent.indexOf("a fact about a process") > -1
      && REG["rf-note"].textContent.indexOf("a fact about the capsule's code") > -1, true);

// ---- Figure 8: two requests into one gap ----
// The figure's claim is that the order decides the answers, so the assertions
// run the same two requests both ways round and check that they swap. Nothing
// here asserts a string that a panel could have been written to contain.
(function () {
  function gap(n) {
    REG["gap-size"].value = String(n); REG["gap-size"].fire("input");
  }
  function left() { return REG["gap-left"].textContent; }
  function open_() {
    var SAY = ["idle", "heap", "grant", "heapno", "eaten", "grantno", "already"];
    var i, on = [];
    for (i = 0; i < SAY.length; i++) {
      if (REG["gapp-" + SAY[i]].classList.contains("is-on")) { on.push(SAY[i]); }
    }
    return on.join("+");
  }
  function moved() {
    return REG["gap-line"].textContent + " " + REG["gap-way"].textContent;
  }

  gap(40);
  chk("nothing has moved to begin with", moved(), "neither nowhere yet");
  chk("and all of it is free", left(), "40 bytes");
  chk("and the opening sentence is the one showing", open_(), "idle");

  // Heap first: 32 fits in 40, and the grant that needed 76 then does not.
  REG["gap-heap"].fire("click");
  chk("thirty-two fits in forty", moved(), "app_break up");
  chk("leaving eight", left(), "8 bytes");
  chk("and the region chapter 6 builds is rewritten to match",
      REG["gapp-heap"].textContent.indexOf("rewritten to match") > -1, true);
  REG["gap-grant"].fire("click");
  chk("and the grant no longer fits", open_(), "grantno");
  chk("with nothing moved for it", moved(), "neither nowhere");
  chk("and the error reaching the process rather than the driver",
      REG["gapp-grantno"].textContent.indexOf("no-memory error") > -1, true);
  chk("and the gap unchanged by a refusal", left(), "8 bytes");

  // The other order, into the same gap. Both requests are identical and both
  // answers are different, which is the whole figure.
  REG["gap-reset"].fire("click");
  chk("starting over gives the gap back", left(), "40 bytes");
  gap(80);
  REG["gap-grant"].fire("click");
  chk("with eighty to spend the grant fits", moved(), "the grants down");
  chk("leaving four", left(), "4 bytes");
  chk("and the sentence is the grant's own", open_(), "grant");
  chk("which says the process was never asked",
      REG["gapp-grant"].textContent.indexOf("the process was never asked") > -1, true);
  REG["gap-heap"].fire("click");
  chk("and now the heap request that fit a moment ago does not", open_(), "eaten");
  chk("and the process cannot see what consumed the gap",
      REG["gapp-eaten"].textContent.indexOf("no way to see the cause") > -1, true);
  REG["gap-reset"].fire("click");
  REG["gap-heap"].fire("click");
  chk("while the same request into the same gap, asked first, is granted",
      open_(), "heap");

  // A refusal with no grant taken is a different sentence from the same
  // refusal after one, and telling them apart is the point of tracking state.
  gap(16);
  REG["gap-heap"].fire("click");
  chk("too small from the start is refused without blaming a grant",
      open_(), "heapno");
  chk("and says the break would land above the grants",
      REG["gapp-heapno"].textContent.indexOf("sees it above the grants") > -1, true);

  // The test is whether what is left will hold what is asked for, so the
  // settings that separate a right bench from a nearly-right one are the ones
  // where the gap is exactly the size of the request.
  gap(32);
  REG["gap-heap"].fire("click");
  chk("a gap of exactly thirty-two holds a request for thirty-two",
      moved(), "app_break up");
  chk("and there is nothing left after it", left(), "0 bytes");
  gap(28);
  REG["gap-heap"].fire("click");
  chk("and four bytes short of it does not", open_(), "heapno");
  gap(76);
  REG["gap-grant"].fire("click");
  chk("a gap of exactly seventy-six holds the grant", moved(), "the grants down");
  chk("with nothing left after that either", left(), "0 bytes");
  gap(72);
  REG["gap-grant"].fire("click");
  chk("and four bytes short of it does not", open_(), "grantno");

  // A driver takes its grant once.
  gap(160);
  REG["gap-grant"].fire("click");
  chk("a driver's first grant is taken", left(), "84 bytes");
  REG["gap-grant"].fire("click");
  chk("and asking again takes nothing more", left(), "84 bytes");
  chk("because it already has one", open_(), "already");

  // The gap is never overspent and never negative, however it is driven.
  (function () {
    var seq = ["gap-heap", "gap-grant", "gap-heap", "gap-heap", "gap-grant"];
    var start, k, r, bad = 0, n;
    for (start = 0; start <= 160; start += 16) {
      gap(start);
      for (r = 0; r < 3; r++) {
        for (k = 0; k < seq.length; k++) {
          REG[seq[k]].fire("click");
          n = parseInt(left(), 10);
          if (n < 0 || n > start) { bad++; }
          if (open_().indexOf("+") > -1 || open_() === "") { bad++; }
        }
      }
    }
    chk("the gap is never overspent and one sentence always shows", bad, 0);
  }());

  // A gap of nothing refuses both, and refuses them for their own reasons.
  gap(0);
  REG["gap-heap"].fire("click");
  chk("nothing at all refuses the heap request", open_(), "heapno");
  REG["gap-grant"].fire("click");
  chk("and the grant too", open_(), "grantno");
  chk("with nothing left to give either", left(), "0 bytes");

  gap(40);
}());
chk("the note says what the design buys instead",
    REG["gp-note"].textContent.indexOf("no other process on the board is any worse off") > -1, true);

// ---- Figure 9: what the seven chapters took ----
walk("ar-", "arp-", 7, "figure 9");
(function () {
  // Seven rows, one per chapter, in order. A figure that closes a seven-part
  // series has to have seven parts.
  var WORDS = ["one", "two", "three", "four", "five", "six", "seven"];
  var i, bad = [];
  for (i = 0; i < 7; i++) {
    if (REG["ar-" + i].textContent.indexOf(WORDS[i]) !== 0) {
      bad.push("row " + i + " is labelled " + REG["ar-" + i].textContent);
    }
  }
  chk("the seven chapters are in order, one to seven", bad.join("; "), "");
}());
REG["ar-5"].fire("click");
chk("chapter 6 is named as the one the hardware enforces",
    REG["arp-5"].textContent.indexOf("The cut that is hardware") > -1, true);
// "Only one of the seven is enforced by hardware" left a reader arriving from
// chapter 7 with an obvious objection: svc is hardware too. The note answers
// it now rather than inviting it.
chk("and the note counts the hardware honestly",
    REG["ar-note"].textContent.indexOf("Notice how little of this is hardware") > -1, true);
chk("and says why chapter 7's instruction does not count as enforcement",
    REG["ar-note"].textContent.indexOf("it enforces nothing on its own") > -1, true);
chk("which is the answer the chapter closes on",
    REG["ar-note"].textContent.indexOf("nothing on the chip stops it, so people did") > -1, true);
REG["ar-1"].fire("click");

// ---- Check yourself ----
(function () {
  var i, hidden = 0, ids = ["qan", "qbn", "qcn", "qdn"];
  for (i = 0; i < 4; i++) {
    if (REG[ids[i]].classList.contains("is-off")) { hidden++; }
  }
  chk("all four answers are put away before anything is clicked", hidden, 4);
}());
(function () {
  var QUIZ = [["qa-", 1, "qan"], ["qb-", 0, "qbn"], ["qc-", 2, "qcn"], ["qd-", 0, "qdn"]];
  var i, bad = [], positions = [];
  for (i = 0; i < QUIZ.length; i++) {
    var prefix = QUIZ[i][0], right = QUIZ[i][1], answer = QUIZ[i][2];
    REG[prefix + right].fire("click");
    if (!REG[prefix + right].classList.contains("is-right")) {
      bad.push(prefix + right + " was not marked right");
    }
    if (REG[answer].classList.contains("is-off")) {
      bad.push(answer + " stayed hidden after a click");
    }
    positions.push(right);
  }
  chk("clicking the right option marks it and reveals the answer", bad.join("; "), "");
  chk("and the right answers are not all in one slot",
      positions[0] === positions[1] && positions[1] === positions[2]
        && positions[2] === positions[3], false);
  // Chapter 6's were 1,2,0,1 and chapter 7's 2,1,0,2. Repeating either would
  // be a pattern a reader could play across chapters rather than think through.
  chk("and the sequence is neither chapter 6's nor chapter 7's",
      positions.join("") !== "1201" && positions.join("") !== "2102", true);
}());
(function () {
  REG["qa-0"].fire("click");
  chk("a wrong click is marked wrong", REG["qa-0"].classList.contains("is-wrong"), true);
  chk("and the right option is marked anyway", REG["qa-1"].classList.contains("is-right"), true);
}());

// ---- What this chapter says about the other six ----
// A closing chapter summarises six chapters it cannot check by reading its own
// source files, and four of the seven panels were wrong on the first draft.
// Each of these pins the summary against what that chapter actually says.
(function () {
  REG["ar-2"].fire("click");
  // Chapter 3's headline is "The first instruction is never yours."
  chk("the chapter 3 panel does not say the chip fetches your first instruction",
      REG["arp-2"].textContent.indexOf("The first instruction is never yours") > -1, true);
  chk("and names the ROM that hunts for it",
      REG["arp-2"].textContent.indexOf("hunts through flash") > -1, true);
  REG["ar-3"].fire("click");
  // Chapter 4 credits a crate-level refusal and says outright that this is the
  // half the type system does not cover.
  chk("the chapter 4 panel credits the crate, not the type system",
      REG["arp-3"].textContent.indexOf("the crate it lives in will not compile") > -1, true);
  chk("and puts the refusal at build time",
      REG["arp-3"].textContent.indexOf("refused at build time") > -1, true);
  REG["ar-4"].fire("click");
  // Chapter 5's distinction is the compiler, and it spends a figure on the
  // header the kernel does check.
  chk("the chapter 5 panel says which tool never saw the code",
      REG["arp-4"].textContent.indexOf("the compiler behind the kernel never saw") > -1, true);
  chk("and does not claim the kernel checks nothing",
      REG["arp-4"].textContent.indexOf("sixteen bytes at the front") > -1, true);
  REG["ar-1"].fire("click");
  // Chapter 1's sentence, as chapter 1 has it, without the clause this chapter
  // had been adding to it.
  chk("chapter 1's sentence is quoted as chapter 1 has it",
      REG["closingq"].textContent.indexOf("everything Tock does is an answer to: any code can write any address") > -1, true);
}());

// ---- The claims no assertion reached ----
// Twelve ids were read by neither the script nor this suite, one of them a
// figure note. Each of these asserts what the anchor claims rather than that
// it exists, so a rewrite that drops the claim fails.
(function () {
  var CLAIMS = [
    ["needstate",  "two processes can be printing at once"],
    ["fourways",   "this kernel has ruled out three of them"],
    ["costline",   "its per-process state is four fields"],
    ["wasteline",  "Three of those seven slots are never touched"],
    ["lifeline",   "that object contains no memory at all"],
    ["reenter",    "It panics, and the board stops"],
    ["whypanic",   "two mutable references to the same bytes"],
    ["gapline",    "there is no separate pool for grants"],
    ["whofirst",   "which asks first"],
    ["closingq",   "Six chapters have been taking pieces out of"],
    ["wordcount",  "Chapter 5 defined a grant in one line"],
    ["lf-note",    "A driver installed on the board and never called by a process"],
    ["closing2",   "It holds two numbers"],
    ["custom",     "cut extra memory from the same region"]
  ];
  var i, missing = [];
  for (i = 0; i < CLAIMS.length; i++) {
    if (REG[CLAIMS[i][0]].textContent.indexOf(CLAIMS[i][1]) === -1) {
      missing.push(CLAIMS[i][0] + " no longer says " + CLAIMS[i][1]);
    }
  }
  chk("every anchored paragraph still makes the claim it was anchored for",
      missing.join("; "), "");
}());

// ---- The one thing this chapter tells the reader to run ----
// Seven chapters checked every assertion and none checked an imperative. The
// series ended on `make program`, which errors without an APP, does nothing on
// a Mac, and ignores the debug probe the same sentence says the reader has --
// all three of which chapter 5 had already documented.
chk("the closing instruction names the debug-probe target",
    REG["endbox"].textContent.indexOf("make flash-openocd") > -1, true);
chk("and says it needs no mounted drive",
    REG["endbox"].textContent.indexOf("needs no mounted drive") > -1, true);
chk("and hands the other route to the chapter that documents it",
    REG["endbox"].textContent.indexOf("why it does nothing on a Mac") > -1, true);

// ---- Two counts and a quotation ----
// Chapter 4 to chapter 8 is four chapters, not six, and the source puts its
// legacy allow number in quotation marks that the first draft dropped.
chk("the wait is counted from chapter 4 correctly",
    REG["noalloc"].textContent.indexOf("waiting four chapters") > -1, true);
chk("the quoted number keeps the source's own quotation marks",
    REG["whyzero"].textContent.indexOf("allow number \u201c1\u201d") > -1, true);
chk("and the chapter says what those marks are doing",
    REG["whyzero"].textContent.indexOf("what an application used to pass") > -1, true);
// The first panel of the closing figure sets the axis for the six under it,
// and it had the wrong axis: this series is about which addresses code may
// reach, not which code runs.
chk("the closing figure opens on addresses rather than on which code runs",
    REG["arp-1"].textContent.indexOf("which addresses a given piece of code may land on") > -1, true);

// ---- What a process pays before it calls anything ----
// Figure 1 sold the design on "never pays for it" and figures 2 and 5 spend
// their length correcting that. The three have to agree now.
(function () {
  REG["wy-3"].fire("click");
  chk("figure 1 admits the fixed cost rather than denying it",
      REG["wyp-3"].textContent.indexOf("small fixed cost per driver") > -1, true);
  chk("figure 2's note is where it is priced",
      REG["bd-note"].textContent.indexOf("pays for a table entry per driver") > -1, true);
  chk("and figure 5's note gives the number",
      REG["lf-note"].textContent.indexOf("eight bytes and not one more") > -1, true);
}());

// ---- The debts, and the end of the series ----
// Eight forward promises across four chapters landed here. These check the
// sentences that pay the ones that named something specific.
chk("chapter 4's question is answered by name",
    REG["noalloc"].textContent.indexOf("never asks for memory it did not already have") > -1, true);
chk("chapter 5's downward movement is the one this chapter drives",
    REG["topdown"].textContent.indexOf("starts at the very top and moves downward as grants are handed out") > -1, true);
chk("chapter 6's fence is what puts the region out of reach",
    REG["fenceagain"].textContent.indexOf("outside the fence") > -1, true);
chk("chapter 7's two loose ends are the ones filed here",
    REG["chp-2"].textContent.indexOf("the filed function pointers and the filed buffers") > -1, true);
// The goals promise counts; each is checked against what delivers it.
chk("the goals promise a byte count and which bytes are wasted",
    REG["goalbox"].textContent.indexOf("which of those bytes are never used") > -1, true);
chk("the goals promise four moments and the one that refunds",
    REG["goalbox"].textContent.indexOf("the one that gives the memory back") > -1, true);
// The closing has to close the series, not hand on to a chapter 9.
chk("the closing says this is the last mechanism",
    REG["lastline"].textContent.indexOf("that is the last mechanism") > -1, true);
chk("and answers chapter 1 in chapter 1's own words",
    REG["lastline"].textContent.indexOf("nothing stops a store from landing anywhere") > -1, true);
(function () {
  var TERMS = ["allocator", "grant region", "grant number", "entering", "slot",
               "counters word", "bump"];
  var i, missing = [], text = REG["words"].textContent;
  for (i = 0; i < TERMS.length; i++) {
    if (text.indexOf(TERMS[i]) === -1) { missing.push(TERMS[i]); }
  }
  chk("every word the section promises is in the list", missing.join(", "), "");
  chk("and grant, which chapter 5 defined, is the first of them", text.indexOf("grant"), 0);
}());
