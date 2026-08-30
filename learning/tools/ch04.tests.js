// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Behavioural assertions for chapter 4, run by check.py under JavaScriptCore.

// Every figure on this page is the same shape -- one row of buttons, one row of
// panels, same index -- and the page builds them all from one function. That is
// cheaper to write and it is also a single point of failure, so the exclusivity
// property is asserted for each figure separately rather than once.
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
  var BETS = [["bet-unsafe", 4], ["bet-portable", 4]];
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
// The rule this series is built on: most readers never click, so a figure that
// says "select something to begin" teaches nothing. Checked before anything
// else touches a control, because everything below moves these.
chk("figure 1 opens on the real declaration", REG["rba-0"].getAttribute("aria-pressed"), "true");
chk("with no second field", REG["rbb-0"].getAttribute("aria-pressed"), "true");
chk("figure 2 opens with a candidate chosen", REG["cd-0"].getAttribute("aria-pressed"), "true");
chk("figure 3 opens on capsules", REG["ar-0"].getAttribute("aria-pressed"), "true");
chk("figure 4 opens on the first step", REG["hp-0"].getAttribute("aria-pressed"), "true");
chk("figure 6 opens on the board's line", REG["wr-0"].getAttribute("aria-pressed"), "true");
chk("figure 7 opens on the Pico 2", REG["bd-0"].getAttribute("aria-pressed"), "true");
chk("and each of those has its panel open",
    REG["rbp-real"].classList.contains("is-on")
      && REG["cdp-0"].classList.contains("is-on")
      && REG["arp-0"].classList.contains("is-on")
      && REG["hpp-0"].classList.contains("is-on")
      && REG["wrp-0"].classList.contains("is-on")
      && REG["bdp-0"].classList.contains("is-on"), true);

// Figure 5 is the exception, and deliberately: the reader arrives at the map
// looking for the address chapter 1 was about, so the decoder opens sitting on
// SIO rather than at the bottom of the space.
chk("figure 5 opens on SIO rather than at the bottom of the map",
    REG["ad-addr"].textContent, "0xD0000000");
chk("and names the line that declares it", REG["ad-line"].textContent, "gpio.rs:1169");
chk("the SIO description is the open one",
    REG["adb-sio"].classList.contains("is-on"), true);
chk("and it is the one that names chapter 1's register",
    REG["adb-sio"].textContent.indexOf("gpio_out_set") > -1, true);

// ---- Figure 1: the reach bench ----
// Nine combinations of a bound and a second field. What is asserted is the
// shape of the table across all nine, not the wording of any one panel: two
// rows never change, one row is no everywhere, and the rest turn over exactly
// where the declaration gives them something to turn over on.
(function () {
  function set(a, b) { REG["rba-" + a].fire("click"); REG["rbb-" + b].fire("click"); }
  function row(n) { return REG["rb-t" + n].classList.contains("yes"); }
  function open_() {
    var SAY = ["real", "more", "concrete", "pins", "raw"], i, on = [];
    for (i = 0; i < SAY.length; i++) {
      if (REG["rbp-" + SAY[i]].classList.contains("is-on")) { on.push(SAY[i]); }
    }
    return on.join("+");
  }

  set(0, 0);
  chk("the real declaration can turn an LED on and read it back",
      [row(1), row(2)].join(","), "true,true");
  chk("and can do none of the other four",
      [row(3), row(4), row(5), row(6), row(7)].join(","),
      "false,false,false,false,false");
  chk("with five methods on the bound", REG["rb-methods"].textContent, "5 methods");
  chk("and it builds for any board with LEDs",
      REG["rb-boards"].textContent, "any with LEDs");

  // Configuring a pin arrives either on the LEDs' own bound or as a field.
  set(1, 0);
  chk("a wider bound is what lets it configure a pin", row(4), true);
  chk("through the LEDs themselves", REG["rb-t4"].textContent, "yes, on an LED");
  chk("and the bound is ten methods wider", REG["rb-methods"].textContent, "15 methods");
  set(0, 1);
  chk("or a slice of pins does it instead", row(4), true);
  chk("through the pins", REG["rb-t4"].textContent, "yes, on a pin");
  chk("without widening what it may call on an LED",
      REG["rb-methods"].textContent, "5 methods");

  // The concrete type is the one that costs every other board.
  set(2, 0);
  chk("only a concrete type lets it say which chip it is on", row(5), true);
  chk("and the price is on the readout", REG["rb-boards"].textContent, "this chip only");
  set(1, 0);
  chk("which the generic version does not pay",
      REG["rb-boards"].textContent, "any with LEDs");

  // A raw pointer is the interesting nothing: legal to hold, useless to hold.
  set(0, 2);
  chk("a raw pointer field still does not reach an address", row(6), false);
  chk("and the reason is the word, not the address",
      REG["rb-t6"].textContent, "no, needs unsafe");
  chk("the crate compiles all the same", REG["rb-builds"].textContent, "yes");
  chk("and the panel names what forbids it",
      REG["rbp-raw"].textContent.indexOf("forbid(unsafe_code)") > -1, true);
  set(0, 0);
  chk("while with no pointer at all there is no address to refuse",
      REG["rb-t6"].textContent, "no, has no address");

  // The whole chapter, as a column of nine identical answers.
  (function () {
    var a, b, reach = 0, over = 0, on = 0, read = 0, one = 0;
    for (a = 0; a < 3; a++) {
      for (b = 0; b < 3; b++) {
        set(a, b);
        if (row(7)) { reach++; }              // never
        if (row(3)) { over++; }               // never
        if (row(1)) { on++; }                 // always
        if (row(2)) { read++; }               // always
        if (open_().indexOf("+") < 0 && open_() !== "") { one++; }
      }
    }
    chk("in none of the nine can it touch what it was not handed", reach, 0);
    chk("nor index past the end", over, 0);
    chk("in all nine it can turn an LED on", on, 9);
    chk("and read one back", read, 9);
    chk("and exactly one sentence shows in each", one, 9);
  }());

  // The declaration on screen is the declaration being described.
  set(2, 2);
  chk("the shown bound follows the switch",
      REG["rbda-2"].classList.contains("is-on"), true);
  chk("and the other two are put away",
      REG["rbda-0"].classList.contains("is-on")
        || REG["rbda-1"].classList.contains("is-on"), false);
  chk("as does the shown field", REG["rbdb-2"].classList.contains("is-on"), true);
  // A default type parameter would leave the driver generic. Pinning it means
  // the parameter goes and the field names the type, so both have to move.
  chk("the concrete choice takes the type parameter out",
      REG["rbda-2"].textContent.replace(/\s/g, ""), "");
  chk("and names the chip's type in the field instead",
      REG["rbfe-1"].classList.contains("is-on"), true);
  REG["rba-1"].fire("click");
  chk("while a bound leaves the field generic",
      REG["rbfe-0"].classList.contains("is-on"), true);
  chk("and puts the parameter back",
      REG["rbda-1"].textContent.indexOf("L: led::Led") > -1, true);

  chk("the parts that never move are on the page rather than behind a control",
      REG["rb-foot"].textContent.indexOf("Two parts never move") > -1, true);
  set(0, 0);
}());

// ---- Figure 2: which line compiles ----
// The chapter's claim is that exactly one of the three is legal, so exactly one
// verdict may be the permissive one. If a later edit softens the second or
// third panel, this is what notices.
// ---- Figure 2: the same line, in two crates ----
// The claim is that nothing about the line changes and the answer does. Two of
// the three flip when the crate does; the one without `unsafe` in it cannot.
(function () {
  function verdict() {
    return REG["cv-no"].classList.contains("is-off") ? "builds" : "refused";
  }
  function why() {
    var W = ["clean", "forbid", "allowed"], i, on = [];
    for (i = 0; i < W.length; i++) {
      if (REG["lp-" + W[i]].classList.contains("is-on")) { on.push(W[i]); }
    }
    return on.join(",");
  }

  REG["cr-cap"].fire("click");
  REG["cd-0"].fire("click");
  chk("the line with no unsafe in it builds in a capsule", verdict(), "builds");
  REG["cr-chip"].fire("click");
  chk("and in the chip crate, because the rule has nothing to say about it",
      verdict(), "builds");
  chk("which is the reason given", why(), "clean");

  REG["cd-1"].fire("click");
  chk("the raw store is ordinary code in the chip crate", verdict(), "builds");
  chk("and the reason is that this crate does not forbid the word",
      why(), "allowed");
  REG["cr-cap"].fire("click");
  chk("and the same line does not build in a capsule", verdict(), "refused");
  chk("named as the lint rather than as a reviewer", why(), "forbid");

  // The third is the interesting one: it is gpio.rs:1168 verbatim.
  REG["cd-2"].fire("click");
  chk("the line that really makes the LED work is refused in a capsule",
      verdict(), "refused");
  REG["cr-chip"].fire("click");
  chk("and legal where it actually lives", verdict(), "builds");

  // The whole table, and the shape of it: exactly the two lines carrying the
  // word are the two that move.
  (function () {
    var l, moved = [], first, second;
    for (l = 0; l < 3; l++) {
      REG["cd-" + l].fire("click");
      REG["cr-cap"].fire("click");
      first = verdict();
      REG["cr-chip"].fire("click");
      second = verdict();
      if (first !== second) { moved.push(l); }
    }
    chk("only the two lines containing unsafe change with the crate",
        moved.join(","), "1,2");
  }());

  (function () {
    var l, c, bad = 0, CR = ["cr-cap", "cr-chip"];
    for (l = 0; l < 3; l++) {
      for (c = 0; c < 2; c++) {
        REG["cd-" + l].fire("click");
        REG[CR[c]].fire("click");
        if (why().indexOf(",") > -1 || why() === "") { bad++; }
      }
    }
    chk("one reason, and only one, in all six cells", bad, 0);
  }());
  REG["cr-cap"].fire("click");
  REG["cd-0"].fire("click");
}());

walk("cd-", "cdp-", 3, "figure 2");
chk("the legal line is the first", REG["cdp-0"].textContent.indexOf("Legal") === 0, true);
chk("the second is refused", REG["cdp-1"].textContent.indexOf("Refused") === 0, true);
chk("the third is refused too", REG["cdp-2"].textContent.indexOf("Also refused") === 0, true);
chk("and the third says the same words are legal in the chip crate",
    REG["cdp-2"].textContent.indexOf("which crate it sits in") > -1, true);
REG["cd-0"].fire("click");

// ---- Figure 3: counting the word ----
// The numbers are the argument, so they are asserted rather than trusted. Each
// was taken by counting `unsafe` in the .rs files under that path at the pinned
// commit, once with comments stripped and once whole.
//
// These fifteen numbers are restated here, which is worth being honest about:
// restating a number cannot catch it going stale, and this row said 10/18/18
// for as long as the figure did. What catches it is counted_tree_checks in
// check.py, which recounts all fifteen at the pinned commit. This asserts only
// that the figure shows the row it was clicked on.
(function () {
  var CASE = [
    ["capsules",              "269", "0",   "5"],
    ["kernel",                "101", "259", "356"],
    ["chips/rp2350",          "14",  "24",  "24"],
    ["arch/cortex-m",         "11",  "67",  "68"],
    ["the Pico 2 board",      "4",   "4",   "4"]
  ];
  var i;
  for (i = 0; i < CASE.length; i++) {
    REG["ar-" + i].fire("click");
    chk("counts for " + CASE[i][0] + " -- files",
        REG["ar-files"].textContent, CASE[i][1]);
    chk("counts for " + CASE[i][0] + " -- in code",
        REG["ar-code"].textContent, CASE[i][2]);
    chk("counts for " + CASE[i][0] + " -- counting comments",
        REG["ar-all"].textContent, CASE[i][3]);
    chk("and its panel is the open one",
        REG["arp-" + i].classList.contains("is-on"), true);
  }
}());
// The one number the whole chapter turns on.
REG["ar-0"].fire("click");
chk("capsules is the only area whose code count is zero",
    REG["ar-code"].textContent, "0");
chk("and its panel says the five matches are comments",
    REG["arp-0"].textContent.indexOf("inside a comment") > -1, true);
chk("the count with comments is not also zero, or the gap is not the point",
    REG["ar-all"].textContent !== "0", true);

// ---- Figure 4: six steps ----
// ---- Figure 4: what each layer knows ----
// The chapter's third goal is naming the layer that first knows the chip. All
// three answers turn over at the same step, and five of the six could be
// running on anything -- which is the note's claim, checked rather than said.
(function () {
  function row() {
    return [REG["kn-chip"].textContent, REG["kn-pin"].textContent,
            REG["kn-addr"].textContent, REG["kn-where"].textContent].join("|");
  }
  REG["hp-0"].fire("click");
  chk("the capsule knows none of the three", row(), "no|no|no|capsules/core");
  REG["hp-3"].fire("click");
  chk("nor does the HIL, two layers further down",
      row(), "no|no|no|kernel/src/hil");
  REG["hp-4"].fire("click");
  chk("step 5 is the first that knows the chip",
      row(), "yes|yes|the base|chips/rp2350");
  REG["hp-5"].fire("click");
  chk("and the store is where the offset is added",
      row(), "yes|yes|base + offset|chips/rp2350");

  (function () {
    var i, knowing = 0;
    for (i = 0; i < 6; i++) {
      REG["hp-" + i].fire("click");
      if (REG["kn-chip"].textContent === "yes") { knowing++; }
    }
    chk("two of the six know the chip, so four could run on anything",
        knowing, 2);
  }());
  REG["hp-0"].fire("click");
}());

walk("hp-", "hpp-", 6, "figure 4");
chk("the chip is not named before step 5",
    REG["hpp-0"].textContent.indexOf("RP2350")
      + REG["hpp-1"].textContent.indexOf("RP2350")
      + REG["hpp-2"].textContent.indexOf("RP2350")
      + REG["hpp-3"].textContent.indexOf("RP2350"), -4);
chk("step 5 is where it is named",
    REG["hpp-4"].textContent.indexOf("RP2350") > -1, true);
chk("and the last step lands on chapter 1's register",
    REG["hpp-5"].textContent.indexOf("0x018") > -1, true);
REG["hp-0"].fire("click");

// ---- Figure 5: the address decoder ----
// The figure's claim is an inventory: eighteen StaticRef::new calls in the chip
// crate, thirty-one addresses, and fifteen of those made by a const fn rather
// than written anywhere. staticref_inventory_checks in check.py recounts the
// call sites against the tree at the pinned commit; what is asserted here is
// that the decoder resolves them.
(function () {
  function at(a) {
    // Reach an address the way the reader would: the coarse slider picks the
    // 32 kB, the fine one the rest.
    var BUS = [[0x40000000, 34], [0x50000000, 160], [0xd0000000, 1]];
    var CELL = 0x8000, i, k = 0, cell = -1, off = 0;
    for (i = 0; i < BUS.length; i++) {
      if (a >= BUS[i][0] && a < BUS[i][0] + BUS[i][1] * CELL) {
        cell = k + Math.floor((a - BUS[i][0]) / CELL);
        off = (a - BUS[i][0]) % CELL;
        break;
      }
      k += BUS[i][1];
    }
    if (cell < 0) { throw new Error("no cell holds " + a); }
    REG["ad-cell"].value = String(cell); REG["ad-cell"].fire("input");
    REG["ad-off"].value = String(off); REG["ad-off"].fire("input");
  }
  function shown() {
    return [REG["ad-addr"].textContent, REG["ad-base"].textContent,
            REG["ad-name"].textContent, REG["ad-line"].textContent].join(" ");
  }
  function open_() {
    var SAY = ["on", "past", "none", "fn"], i, on = [];
    for (i = 0; i < SAY.length; i++) {
      if (REG["adp-" + SAY[i]].classList.contains("is-on")) { on.push(SAY[i]); }
    }
    return on.join("+");
  }
  function block() {
    var B = ["none", "clocks", "resets", "gpio", "pads", "xosc", "pllsys",
             "pllusb", "uart0", "uart1", "spi0", "spi1", "timer", "ticks",
             "dmach", "dmairq", "pio", "pioirq", "sio"], i, on = [];
    for (i = 0; i < B.length; i++) {
      if (REG["adb-" + B[i]].classList.contains("is-on")) { on.push(B[i]); }
    }
    return on.join("+");
  }

  // Chapter 1's own address, which is the one thing a reader comes here for.
  REG["ad-sio"].fire("click");
  chk("the button lands on chapter 1's register, not just its block",
      REG["ad-addr"].textContent, "0xD0000018");
  chk("resolving to SIO's base", REG["ad-base"].textContent, "0xD0000000");
  chk("twenty-four bytes past it", REG["ad-off-v"].textContent, "+0x018");
  chk("which is past a base rather than on one", open_(), "past");
  chk("and the block is still SIO", block(), "sio");

  // A base written down as a literal.
  at(0x40028000);
  chk("GPIO's base is written down", shown(),
      "0x40028000 0x40028000 written down gpio.rs:1165");
  chk("and sitting on it says so", open_(), "on");
  chk("with the right description", block(), "gpio");

  // The two that the re-pin added and the old list of twelve did not have.
  at(0x40080000);
  chk("SPI0 is in the inventory", shown(),
      "0x40080000 0x40080000 written down spi.rs:20");
  at(0x50000400);
  chk("and DMA's interrupt registers, at a named constant off the channels",
      shown(), "0x50000400 0x50000400 written down dma.rs:58");
  chk("which is its own description", block(), "dmairq");

  // The ones no line holds. This is the figure's reason for existing.
  at(0x50200000);
  chk("PIO0's base is made, not written", shown(),
      "0x50200000 0x50200000 made, not written pio.rs:55");
  chk("and the panel says a list cannot show it", open_(), "fn");
  chk("naming the const fn as the reason",
      REG["adp-fn"].textContent.indexOf("const fn") > -1, true);
  at(0x5030016c);
  chk("PIO1's interrupt registers are the same function, a different base",
      shown(), "0x5030016C 0x5030016C made, not written pio.rs:59");
  at(0x50403000);
  chk("and the third block's third mirror is reached the same way",
      shown(), "0x50403000 0x50403000 made, not written pio.rs:55");

  // Emptiness. Most of the map resolves to nothing, which a list hid.
  at(0x40000000);
  chk("below everything on the first bus, nothing resolves",
      REG["ad-base"].textContent, "nothing below");
  chk("and it says so rather than reaching back to another bus", open_(), "none");
  chk("with a dash where a description would be", block(), "none");
  at(0x40100000);
  chk("a gap between two named blocks resolves to the one below it",
      REG["ad-line"].textContent, "timer.rs:169");
  chk("as past it, not on it", open_(), "past");

  // Crossing buses is not "just past" the block before it.
  at(0xd0000000);
  chk("SIO does not resolve to anything on the bus below it",
      REG["ad-base"].textContent, "0xD0000000");
  at(0x50000000);
  chk("nor does DMA reach back to the peripherals",
      REG["ad-base"].textContent, "0x50000000");

  // The tour. Pressing next from the bottom reaches every one of the
  // thirty-one addresses, in order, and wraps.
  (function () {
    var seen = {}, n = 0, i, a, last = -1, out_of_order = 0, adrift = 0;
    at(0x40000000);
    for (i = 0; i < 31; i++) {
      REG["ad-next"].fire("click");
      a = REG["ad-addr"].textContent;
      if (!seen[a]) { seen[a] = 1; n++; }
      if (parseInt(a, 16) <= last) { out_of_order++; }
      last = parseInt(a, 16);
      // A base is either written down or made by the function; the tour must
      // never stop somewhere that is merely past one, or on nothing.
      if (open_() !== "on" && open_() !== "fn") { adrift++; }
      if (block() === "none" || block().indexOf("+") > -1) { adrift++; }
    }
    chk("the tour reaches thirty-one distinct addresses", n, 31);
    chk("in increasing order", out_of_order, 0);
    chk("and every stop is a base with one description", adrift, 0);
    REG["ad-next"].fire("click");
    chk("and it wraps to the lowest rather than sticking at the top",
        REG["ad-addr"].textContent, "0x40010000");
  }());

  // Fifteen of the thirty-one are made rather than written, which is the
  // count the figure's whole argument rests on.
  (function () {
    var i, made = 0;
    at(0x40000000);
    for (i = 0; i < 31; i++) {
      REG["ad-next"].fire("click");
      if (REG["ad-name"].textContent === "made, not written") { made++; }
    }
    chk("fifteen of the thirty-one are made by the function", made, 15);
    chk("and sixteen are written down", 31 - made, 16);
  }());

  REG["ad-sio"].fire("click");
}());

// ---- Figure 6: the board's two lines ----
walk("wr-", "wrp-", 2, "figure 6");
chk("the second line is the commented-out one",
    REG["wr-1"].textContent.indexOf("//") > -1, true);
chk("and its panel says a person took the pin back",
    REG["wrp-1"].textContent.indexOf("by hand") > -1, true);
REG["wr-0"].fire("click");

// ---- Figure 7: two boards ----
(function () {
  var i;
  for (i = 0; i < 2; i++) {
    REG["bd-" + i].fire("click");
    if (!REG["bdp-" + i].classList.contains("is-on")) {
      throw new Error("board " + i + " did not light its own panel");
    }
  }
  chk("exactly one board is lit at a time", onlyOne("bdp-", 2, "is-on"), 1);
}());
REG["bd-0"].fire("click");
chk("the two boards differ in polarity",
    REG["bdp-0"].textContent.indexOf("LedHigh") > -1
      && REG["bdp-1"].textContent.indexOf("LedLow") > -1, true);
chk("and in how many LEDs they have",
    REG["bdp-0"].textContent.indexOf(", 1&gt;") > -1
      || REG["bdp-0"].textContent.indexOf(", 1>") > -1, true);

// ---- Check yourself ----
// The answer text lives in the markup and starts hidden; clicking any option
// reveals it and marks which was right. A wrong click must still reveal.
(function () {
  var CASE = [["qa-", 3, 0, "qan"], ["qb-", 3, 2, "qbn"], ["qc-", 3, 2, "qcn"]];
  var i, c, wrong;
  for (i = 0; i < CASE.length; i++) {
    c = CASE[i];
    chk("question " + (i + 1) + " starts with its answer hidden",
        REG[c[3]].classList.contains("is-off"), true);
    wrong = c[2] === 0 ? 1 : 0;
    REG[c[0] + wrong].fire("click");
    chk("a wrong answer to question " + (i + 1) + " still reveals it",
        REG[c[3]].classList.contains("is-off"), false);
    chk("the wrong option is marked wrong",
        REG[c[0] + wrong].classList.contains("is-wrong"), true);
    chk("and the right one is marked right even though it was not clicked",
        REG[c[0] + c[2]].classList.contains("is-right"), true);
  }
}());

// ---- What the chapter promised it would do ----
// The three goals at the top, each tied to the thing on the page that delivers
// it. A goal nothing answers is the failure mode these exist to catch.
chk("goal 1, the one field, is delivered by figure 1",
    REG["rb-t7"].textContent.indexOf("in all nine") > -1, true);
chk("goal 2, why a driver cannot corrupt the kernel, is delivered by figure 2",
    REG["cdp-1"].textContent.indexOf("forbids the word") > -1, true);
chk("goal 3, which layer knows the chip, is delivered by figure 4",
    REG["hpp-4"].textContent.indexOf("first layer that knows") > -1, true);

// ---- what the first review pass found ----
// The chapter stated a guarantee and never stated its edge. Tock's own
// documentation calls a capsule semi-trusted; nothing on the page said what the
// second half of that word covers, which made chapter 5's "not trusted at all"
// a weaker contrast than it should be.
chk("the boundary of the guarantee is on the page",
    REG["pairs-trust"].textContent.indexOf("taken away") > -1
      && REG["pairs-trust"].textContent.indexOf("left alone") > -1, true);
chk("and the row no longer claims a capsule cannot disturb another one at all",
    REG["pairs-trust"].textContent.indexOf("may be shared") > -1, true);
// A fourth question, on the section a reader is most likely to skip.
chk("the loop question starts hidden", REG["qdn"].classList.contains("is-off"), true);
REG["qd-0"].fire("click");
chk("a wrong answer to it still reveals", REG["qdn"].classList.contains("is-off"), false);
chk("and marks the right one", REG["qd-2"].classList.contains("is-right"), true);
chk("its answer says why nothing stops it",
    REG["qdn"].textContent.indexOf("not scheduled") > -1, true);

// The four lint levels were a table written as a paragraph -- four items each
// with a behaviour, which is the shape chapter 1 converted seven times.
chk("the lint levels are a table",
    REG["pairs-levels"].textContent.indexOf("allow") > -1
      && REG["pairs-levels"].textContent.indexOf("warn") > -1
      && REG["pairs-levels"].textContent.indexOf("deny") > -1
      && REG["pairs-levels"].textContent.indexOf("forbid") > -1, true);
chk("and it says which one can be turned back off",
    REG["pairs-levels"].textContent.indexOf("turn it back off") > -1, true);

// The bounds check is not there because the length is known. It is there
// because indexing past the end panics, which finding 1 is the cost of.
chk("the figure gives the real reason for the bounds check",
    REG["rb-foot"].textContent.indexOf("It panics") > -1, true);
chk("and no longer claims the known length is the cause",
    REG["rb-foot"].textContent.indexOf("Because the length is known"), -1);

// "That line is real" has to survive being checked verbatim; the real one is a
// module-level const, not a let binding inside a function.
chk("the third candidate is the declaration that is actually in the tree",
    REG["cd-2"].textContent.indexOf("const SIO_BASE") > -1, true);
chk("and the panel cites it by line",
    REG["cdp-2"].textContent.indexOf("gpio.rs:1168") > -1, true);

// ---- what the second review pass found ----
// The boundary section was prose only. On the skim path -- headings,
// imperatives and notes, which is what most readers take -- it was a bare
// heading, in the one place a reader is most likely to stop reading.
chk("the boundary section has an instrument of its own",
    REG["br-w0"].getAttribute("aria-pressed"), "true");
// ---- Figure 8: how far each failure reaches ----
// Two of the three reach the whole board whoever does them; the third reaches
// exactly the other holders of what the culprit was handed. That asymmetry is
// what the figure is for, so it is asserted across all twelve combinations
// rather than as three strings.
(function () {
  function set(who, what) {
    REG["br-w" + who].fire("click"); REG["br-h" + what].fire("click");
  }
  function marked(kind) {
    var i, n = 0;
    for (i = 0; i < 5; i++) {
      if (REG["brc-" + i].classList.contains(kind)) { n++; }
    }
    return n;
  }
  function open_() {
    var SAY = ["panic", "loop", "hog", "alone"], i, on = [];
    for (i = 0; i < SAY.length; i++) {
      if (REG["brp-" + SAY[i]].classList.contains("is-on")) { on.push(SAY[i]); }
    }
    return on.join("+");
  }

  // A panic and a loop take the board down whoever did it.
  (function () {
    var who, what, wrong = 0;
    for (what = 0; what < 2; what++) {
      for (who = 0; who < 4; who++) {
        set(who, what);
        if (REG["br-board"].textContent !== "stops") { wrong++; }
        if (marked("is-hit") !== 4) { wrong++; }
        if (marked("is-fine") !== 0) { wrong++; }
      }
    }
    chk("a panic or a loop stops the board whichever capsule did it", wrong, 0);
  }());
  set(0, 0);
  chk("and the panel names the handler's return type",
      REG["brp-panic"].textContent.indexOf("never returns") > -1, true);
  chk("and that it takes the LED pin for itself",
      REG["brp-panic"].textContent.indexOf("blinks it forever") > -1, true);
  set(0, 1);
  chk("nothing preempts a capsule that will not return",
      REG["brp-loop"].textContent.indexOf("never left") > -1, true);

  // Hogging is the one where being handed less means doing less harm.
  set(0, 2);
  chk("the board keeps going when a capsule only hogs",
      REG["br-board"].textContent, "keeps going");
  chk("the console shares the port with two others",
      REG["br-hit"].textContent, "2 others");
  chk("and the panel says what a virtualizer is for",
      REG["brp-hog"].textContent.indexOf("degrades every other client") > -1, true);
  chk("with the board's own count of who shares what",
      REG["brp-hog"].textContent.indexOf("three capsules on one serial port") > -1, true);
  set(1, 2);
  chk("the process console holds both, so it reaches three",
      REG["br-hit"].textContent, "3 others");
  set(2, 2);
  chk("the alarm driver holds only the timer, so it reaches one",
      REG["br-hit"].textContent, "one other");
  set(3, 2);
  chk("and the LED driver, handed one pin, reaches nobody",
      REG["br-hit"].textContent, "nobody");
  chk("which is the panel that says why", open_(), "alone");
  chk("and it names figure 6 as the reason",
      REG["brp-alone"].textContent.indexOf("Figure 6 is the reason") > -1, true);
  chk("with every other capsule left unmarked", marked("is-hit"), 0);

  // One culprit, one sentence, at every setting.
  (function () {
    var who, what, bad = 0;
    for (who = 0; who < 4; who++) {
      for (what = 0; what < 3; what++) {
        set(who, what);
        if (marked("is-guilty") !== 1) { bad++; }
        if (open_().indexOf("+") > -1 || open_() === "") { bad++; }
        if (REG["br-fix"].textContent.indexOf("nothing") < 0) { bad++; }
      }
    }
    chk("one culprit and one sentence in all twelve, and nothing restarts it",
        bad, 0);
  }());
  set(0, 0);
}());

// Tock's kernel is no_std and has no allocator. Chapter 8 is about handing a
// driver per-process state without one, so naming an allocator here would have
// contradicted a chapter that is not written yet.
REG["ar-1"].fire("click");
chk("the kernel panel no longer lists an allocator",
    REG["arp-1"].textContent.indexOf("memory allocator"), -1);
chk("and says so as the point",
    REG["arp-1"].textContent.indexOf("there is no allocator") > -1, true);
REG["ar-0"].fire("click");

// Three of the four self-check answers used to be the structurally odd option,
// so the quiz could be passed on shape alone. Each question's options are now
// the same shape as their siblings, which no assertion can prove -- but the
// answer moving off the last position is at least visible.
chk("question 1's answer is no longer the middle one by default",
    REG["qa-0"].textContent.indexOf("raw pointer") > -1, true);
chk("and none of its options begins with yes or no",
    (REG["qa-0"].textContent + REG["qa-1"].textContent + REG["qa-2"].textContent)
      .toLowerCase().indexOf("yes,"), -1);

// Two words for one thing, joined only in the glossary until now.
chk("the two words are tied together in the prose as well",
    document.getElementById("wordpair").textContent
      .indexOf("both words for the same thing") > -1, true);

// ---- what the third review pass found ----
// The goals were written before the chapter had a fourth thing to teach: the
// boundary section and Figure 8 both arrived in later passes and neither was
// promised at the top.
chk("the goals promise the boundary as well as the guarantee",
    REG["goalbox"].textContent.indexOf("still do to you anyway") > -1, true);
// The prerequisite line named two chapters and no Rust, while Figure 1 opens on
// a lifetime and a const generic.
chk("and the prerequisites name the Rust as well as the chapters",
    REG["goalbox"].textContent.indexOf("lifetime and a type parameter") > -1, true);

// `'a` is in the declaration on screen and never varies, so it is described
// beside the bench rather than being a control that does nothing.
chk("the lifetime is named where it cannot be missed",
    REG["rb-foot"].textContent.indexOf("'a") > -1, true);
chk("and tied to what Figure 7 shows",
    REG["rb-foot"].textContent.indexOf("'static") > -1, true);
// Both halves of the old imperative -- what a part lets in and what it leaves
// out -- are now the two columns of the table and the line under it.
chk("the opening panel says what the declaration leaves out",
    REG["rbp-real"].textContent.indexOf("leaves out") > -1, true);
chk("and the count is still said not to be a pin number",
    REG["rb-foot"].textContent.indexOf("not: a pin number") > -1, true);

// The chapter's central picture is the simplest capsule in the tree. The rule
// survives the field count; the picture does not, and the note said nothing.
chk("the note places this driver in the distribution",
    REG["fig1note"].textContent.indexOf("the largest has thirty-one") > -1, true);
chk("and says the rule survives the count",
    REG["fig1note"].textContent.indexOf("does not change the rule") > -1, true);

// ---- what the fourth review pass found ----
// The chapter leaned on words no chapter had ever defined: `crate` fourteen
// times, with the whole argument resting on it, and `process` twelve times,
// three chapters before the one that explains what a process is.
chk("the words the chapter leans on are in its own list",
    REG["words"].textContent.indexOf("process") > -1
      && REG["words"].textContent.indexOf("struct") > -1
      && REG["words"].textContent.indexOf("virtualizer") > -1, true);
(function () {
  var i, missing = 0;
  var WORDS = ["capsule", "board", "process", "struct", "virtualizer",
               "trait", "HIL", "generic", "unsafe"];
  for (i = 0; i < WORDS.length; i++) {
    if (REG["words"].textContent.indexOf(WORDS[i]) < 0) { missing++; }
  }
  chk("all nine of the words the heading promises are in the list", missing, 0);
}());

// The counts and the twelve lines are the same argument, and the chain sat
// between them with the only bridge buried in a panel nobody has to click.
chk("the chain section says where the answer lands before taking the detour",
    REG["bridge"].textContent.indexOf("Figure 5 is those twelve") > -1, true);
chk("and says why the detour comes first",
    REG["bridge"].textContent.indexOf("stands on top of them") > -1, true);

// ---- what the fifth review pass found ----
// The chapter shipped 33 panels with is-off already on, so a reader with
// JavaScript off lost 1,018 words -- 26.6% of the chapter -- while the
// noscript note promised the opposite and the chapter has no diagrams to fall
// back on. Chapters 1 and 3 ship every panel showing and let the script put
// the rest away. The markup is inverted now, so what has to be asserted is
// that the script does the hiding it took over.
(function () {
  var SAY = ["more", "concrete", "pins", "raw"], i, hidden = 0;
  for (i = 0; i < SAY.length; i++) {
    if (!REG["rbp-" + SAY[i]].classList.contains("is-on")) { hidden++; }
  }
  chk("the script closes the panels the markup no longer closes", hidden, 4);
}());
(function () {
  var SAY = ["loop", "hog", "alone"], i, hidden = 0;
  for (i = 0; i < SAY.length; i++) {
    if (!REG["brp-" + SAY[i]].classList.contains("is-on")) { hidden++; }
  }
  chk("and does it for the last figure too", hidden, 3);
}());
// The self-check answers are inverted the same way, and that is already
// asserted: the four "starts with its answer hidden" checks above run after
// the script, and the markup no longer carries is-off, so passing them is
// proof the script put it there. Repeating it here after the questions have
// been clicked would assert the opposite of what it says.

// ---- the board on the reader's desk ----
// Every source line this chapter quotes comes from boards/raspberry_pi_pico_2,
// and the tree has no crate for the wireless Pico 2 at all. That cost nothing
// while the series only read source. It costs one thing here: the pin the
// panic handler blinks is the radio's chip-select line on a W, so the one signal a
// dying kernel gives without a console is the one that board cannot show.
chk("the chapter says which crate every line came from",
    REG["wboard"].textContent.indexOf("boards/raspberry_pi_pico_2") > -1, true);
// This used to assert that the only _w board in the tree was on an earlier
// chip, which was the reason a Pico 2 W owner had to build the plain crate.
// There is a raspberry_pi_pico_2_w now, on this chip, so the paragraph makes
// the opposite point and the assertion follows it.
chk("and that there is a Pico 2 W crate on this same chip",
    REG["wboard"].textContent.indexOf("raspberry_pi_pico_2_w") > -1, true);
chk("the pin is named rather than left as 'the LED pin'",
    REG["wpin"].textContent.indexOf("GPIO 25") > -1, true);
chk("and the reader is sent to chapter 1 rather than told twice",
    REG["wpin"].textContent.indexOf("chapter 1") > -1, true);
chk("what goes missing on a W is the blink, not the message",
    REG["wblink"].textContent.indexOf("console on pins 0 and 1") > -1, true);
chk("and the section says what does not change",
    REG["wscope"].textContent.indexOf("compile time") > -1, true);

// ---- Figure 9: what the guard at the bottom can actually see ----
// Figure 4 walks the reader to gpio.rs:1481 and :1485 and steps over the line
// between them. That line is a match on get_mode(), and get_mode() cannot read
// FUNCSEL -- so the guard's answer is an inference, and a pin handed to SPI
// comes back Input. Every assertion below is about the chapter saying which
// register is missing, because that is the whole of the finding.
chk("figure 9 opens on its first step", REG["mx-0"].getAttribute("aria-pressed"), "true");
// ---- Figure 9: what the guard actually reads ----
// Two bits decide the mode and FUNCSEL is not one of them, which is why a pin
// handed to another block reports itself an input and every store evaporates.
// The mapping is gpio.rs:1310-1322; make_output is :1380. Recomputed here
// rather than read back, so a wrong cell fails instead of agreeing.
(function () {
  function row() {
    return [REG["gm-fn"].textContent, REG["gm-od"].textContent,
            REG["gm-oe"].textContent, REG["gm-mode"].textContent,
            REG["gm-set"].textContent].join("|");
  }
  REG["fn-none"].fire("click");
  chk("a pin nobody touched is LowPower, not Input",
      row(), "none|set|clear|LowPower|stores nothing");

  REG["fn-spi"].fire("click");
  chk("handed to SPI it reports itself an input",
      row(), "SPI|cleared|clear|Input|stores nothing");

  // The part the SPI story hides: naming SIO is not enough either.
  REG["fn-sio"].fire("click");
  chk("and pointing it at SIO reports exactly the same thing",
      row(), "SIO|cleared|clear|Input|stores nothing");
  chk("which the panel says is the part the SPI case hides",
      REG["gs-sio"].textContent.indexOf("not the same as being an output") > -1, true);

  REG["fn-out"].fire("click");
  chk("only make_output leaves a pin a store can move",
      row(), "SIO|cleared|set|Output|stores");

  // Exactly one of the four ever stores, and it is the one that sets gpio_oe.
  (function () {
    var A = ["none", "spi", "sio", "out"], i, stores = 0, bad = 0;
    for (i = 0; i < A.length; i++) {
      REG["fn-" + A[i]].fire("click");
      if (REG["gm-set"].textContent === "stores") { stores++; }
      if (REG["gm-set"].textContent === "stores" &&
          REG["gm-oe"].textContent !== "set") { bad++; }
      if (REG["gm-mode"].textContent === "Output" &&
          !REG["gm-mode"].classList.contains("is-good")) { bad++; }
      if (REG["gm-mode"].textContent !== "Output" &&
          !REG["gm-mode"].classList.contains("is-bad")) { bad++; }
    }
    chk("one of the four stores, and it is the one that set gpio_oe", stores, 1);
    chk("and the readings are marked to match", bad, 0);
  }());

  // FUNCSEL moves and the verdict does not, which is the whole defect.
  REG["fn-spi"].fire("click");
  var spi = REG["gm-mode"].textContent;
  REG["fn-sio"].fire("click");
  chk("changing FUNCSEL alone changes nothing the guard reads",
      REG["gm-mode"].textContent, spi);
  REG["fn-spi"].fire("click");
}());

walk("mx-", "mxp-", 3, "figure 9");

// The first panel's job is the register that is never written, not the two
// that are. Without gpio_oe named here the second panel has nothing to land on.
chk("the first step says which register set_function leaves alone",
    REG["mxp-0"].textContent.indexOf("gpio_oe") > -1, true);
chk("and says the pin's function-select field is what it does write",
    REG["mxp-0"].textContent.indexOf("FUNCSEL") > -1, true);

// The payload. A paraphrase would have been enough to make the point and
// would not have been checkable, so the comment is quoted exactly as it
// stands in the tree.
chk("the middle step quotes the TODO rather than describing it",
    REG["mxp-1"].textContent.indexOf("//TODO - read alternate function") > -1, true);
chk("and names the mode a pin handed to SPI reports",
    REG["mxp-1"].textContent.indexOf("Configuration::Input") > -1, true);
chk("and says outright that the function-select field is never read",
    REG["mxp-1"].textContent.indexOf("never read") > -1, true);

// Why nothing upstream can notice. The unit return is the reason there is no
// error to check, and it is the half a reader is most likely to supply wrongly
// from experience with APIs that return a Result.
chk("the last step gives the reason nothing is reported",
    REG["mxp-2"].textContent.indexOf("()") > -1, true);

// The note has to keep the layers innocent. Read as an accusation this figure
// teaches the wrong thing: no layer breaks its contract, and that is the point.
chk("the note says every layer kept its promise",
    REG["fig9note"].textContent.indexOf("kept its promise") > -1, true);

// The lead has to connect to the figure it reopens, or Figure 9 reads as a
// second unrelated walk down the same file.
chk("the lead ties the section back to figure 4",
    REG["mxlead"].textContent.indexOf("Figure 4") > -1, true);
chk("and the section says what it costs in practice",
    REG["mxcost"].textContent.indexOf("chip select") > -1, true);

// A section nobody was promised is a section a reader meets by surprise.
chk("the goals promise the section as well",
    REG["goalbox"].textContent.indexOf("leave the pin exactly where it was") > -1, true);
