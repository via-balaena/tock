// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Assertions for ch01-everything-is-memory. Run via:
//     python3 learning/tools/check.py

// ---- Predict before the reveal ----
// The device only works if it cannot be skimmed: nothing explains itself until
// a guess is committed, exactly one option is right, and a wrong guess is
// marked wrong rather than quietly corrected. Asserted per bet, and swept, so
// a bet added later without an explanation is caught.
(function () {
  var BETS = [["bet-empty", 4], ["bet-ram", 4]];
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

// ---- What a reader with no JavaScript is left with ----
// These figures used to build their contents out of script strings, so with
// scripting off they were empty boxes. They are markup now, and the only
// thing that can check that is the markup's own classes: the script sets the
// opening state on load either way, so asserting the live DOM would pass
// whatever the page shipped. PAGE_CLASS is the markup as written.
(function () {
  function shipped(id) {
    // The book prefixes every id with chNN--, so match by suffix and treat a
    // miss as a failure rather than as an absent key that quietly passes.
    var k;
    for (k in PAGE_CLASS) {
      if (PAGE_CLASS.hasOwnProperty(k)
          && (k === id || k.slice(-(id.length + 1)) === "-" + id)) {
        return PAGE_CLASS[k];
      }
    }
    return "\u0000 no such id in the markup: " + id;
  }
  function has(id, token) {
    return (" " + shipped(id) + " ").indexOf(" " + token + " ") > -1;
  }
  function on(id) { return has(id, "is-on"); }

  chk("the digit the decoder opens on is chosen in the markup",
      has("digit-D", "on"), true);
  chk("and its answer is the one the markup shows", on("dsay-D"), true);
  chk("with the other fifteen answers put away by the script, not absent",
      on("dsay-0") || on("dsay-2") || on("dsay-F"), false);
  chk("the map opens on SIO in the markup", on("mdet-sio"), true);
  chk("the trace opens on its first moment", has("tr-0", "now"), true);
}());

// ---- The three opening figures: the state a reader meets on load ----
// These run first, before anything is clicked, because the finding they
// enforce is that a figure must teach something to a reader who never clicks.

chk("the nine-words figure boots with a word already chosen",
    REG["dt-pin"].classList.contains("is-lit"), true);
chk("and the zone that word lives in is lit with it",
    REG["zone-board"].classList.contains("is-lit"), true);
chk("and so is the sentence for that zone",
    REG["where-board"].classList.contains("is-lit"), true);
chk("the other two zones are not lit",
    REG["zone-chip"].classList.contains("is-lit")
    || REG["zone-number"].classList.contains("is-lit"), false);
chk("the chosen word's drawing is lit rather than dimmed",
    REG["svg-pin"].classList.contains("is-lit"), true);
chk("and the words not chosen are dimmed rather than hidden",
    REG["svg-register"].classList.contains("is-dim"), true);

chk("the board boots with a hole already chosen",
    REG["pad-1"].classList.contains("is-lit"), true);
chk("and the readout names that hole", REG["pick-num"].textContent, "1");
chk("and says what it carries", REG["pick-name"].textContent, "GP0");
chk("the board boots showing that hole 1 is a GPIO",
    REG["cat-gpio"].classList.contains("is-lit"), true);
chk("and that it is one of the two Tock has taken",
    REG["cat-tock"].classList.contains("is-lit"), true);
chk("the plain board is the one selected at the start",
    REG["variant-plain"].classList.contains("is-lit"), true);
chk("and the wireless note is not shown until it is asked for",
    REG["four-note-w"].classList.contains("is-lit"), false);

chk("the pin figure boots driven high, not in a blank state",
    REG["lvl-fig"].classList.contains("is-on"), true);
chk("and the sentence for that state is the lit one",
    REG["say-high"].classList.contains("is-lit"), true);
chk("and the store that caused it is on screen",
    REG["lvl-store"].textContent, "*0xD0000018 = 0x02000000");

// ---- Instrument 5: the bit builder ----

// The page's own initial render, before any interaction. The harness seeds
// value="25" from the markup, so this is exactly what a reader first sees.
chk("the bit builder renders pin 25 before anyone touches it",
    REG["ro-expr"].textContent, "1 << 25");
chk("and its hex, rather than NaN", REG["ro-hex"].textContent, "0x02000000");
chk("and the badge agrees", REG["pin-badge"].textContent, "25");

REG["pin"].value = "25"; REG["pin"].fire("input");

// The eighteen map stripes, by id. They are markup now, so `children` is
// empty as far as the harness is concerned and the ids are the way in.
var MROWS = ["rom", "flash-boot-block", "flash-tock-kernel",
  "flash-applications", "sram", "clocks", "resets", "io-bank0",
  "pads-bank0", "xosc", "pll-sys", "pll-usb", "uart0", "uart1",
  "timer0", "ticks", "sio", "processor-s-own-registers"];
function mopen() {
  var i, on = [];
  for (i = 0; i < MROWS.length; i++) {
    if (REG["mdet-" + MROWS[i]].classList.contains("is-on")) { on.push(MROWS[i]); }
  }
  return on.join("+");
}
function mpressed() {
  var i, on = [];
  for (i = 0; i < MROWS.length; i++) {
    if (REG["mr-" + MROWS[i]].getAttribute("aria-pressed") === "true") {
      on.push(MROWS[i]);
    }
  }
  return on.join("+");
}

// ---- No figure may boot into an empty state ----
// A reader who never clicks must still be shown the instructive case.

chk("the address map boots with a region already chosen", mopen() !== "", true);
chk("and the region it chooses is SIO", mopen(), "sio");
chk("whose detail derives the chapter's address",
    REG["mdet-sio"].textContent.indexOf("0xD0000018") > -1, true);

chk("pin 25 produces the right hex", REG["ro-hex"].textContent, "0x02000000");
chk("pin 25 shows the right expression", REG["ro-expr"].textContent, "1 << 25");
chk("pin 25 shows the right store", REG["ro-store"].textContent, "*0xD0000018 = 0x02000000");

REG["pin"].value = "0"; REG["pin"].fire("input");
chk("pin 0 produces the right hex", REG["ro-hex"].textContent, "0x00000001");

// 1 << 31 is negative as a signed int32; the page must not leak that.
REG["pin"].value = "31"; REG["pin"].fire("input");
chk("pin 31 survives int32 overflow", REG["ro-hex"].textContent, "0x80000000");
chk("pin 31 decimal is unsigned", REG["ro-dec"].textContent, (2147483648).toLocaleString("en-US"));

// The RP2350 crate defines GPIO0..GPIO29, so bits 30 and 31 have no pin.
chk("bit 31 is flagged as having no pin",
    REG["pin-note"].textContent.indexOf("no GPIO 31") > -1, true);
REG["pin"].value = "29"; REG["pin"].fire("input");
chk("bit 29 is flagged as a real pin",
    REG["pin-note"].textContent.indexOf("drives GPIO 29") > -1, true);

// ---- Instrument 3: the memory map ----

// Every stripe and every paragraph ships in the markup, so the map is a map
// with scripting off rather than two empty boxes.
(function () {
  var i, n = 0;
  for (i = 0; i < MROWS.length; i++) {
    if (REG["mr-" + MROWS[i]] && REG["mdet-" + MROWS[i]]) { n++; }
  }
  chk("every mapped region is rendered, with its paragraph", n, 18);
}());
chk("and none of it is built on demand", REG["map"].children.length, 0);
REG["mr-sio"].fire("click");
chk("SIO detail derives 0xD0000018",
    REG["mdet-sio"].textContent.indexOf("0xD0000018") > -1, true);
REG["mr-rom"].fire("click");
chk("the list starts at address zero, where the processors start",
    REG["mdet-rom"].textContent.indexOf("starting point for both Arm processors") > -1, true);
chk("and choosing one closes the one before it", mopen(), "rom");
// The SRAM stripe is the one place on the page reporting a tree newer than
// the pin, and it says so rather than quietly printing the newer number.
chk("the SRAM stripe owns up to reporting a newer tree",
    REG["mdet-sram"].textContent.indexOf("newer than the pin") > -1, true);
chk("and gives both numbers", REG["mdet-sram"].textContent.indexOf("520 kB") > -1
    && REG["mdet-sram"].textContent.indexOf("264 kB") > -1, true);

// ---- Figure 5: the first hex digit decides who answers ----
// All sixteen buttons and all sixteen answers are markup now, so the figure
// says something with scripting off. What is left to assert is that the script
// chooses among them, and that it chooses exactly one.
(function () {
  function open_() {
    var D = "0123456789ABCDEF".split(""), i, on = [];
    for (i = 0; i < D.length; i++) {
      if (REG["dsay-" + D[i]].classList.contains("is-on")) { on.push(D[i]); }
    }
    return on.join("+");
  }
  function lit() {
    var D = "0123456789ABCDEF".split(""), i, on = [];
    for (i = 0; i < D.length; i++) {
      if (REG["digit-" + D[i]].classList.contains("on")) { on.push(D[i]); }
    }
    return on.join("+");
  }

  // Counted by id rather than by children.length: the harness only fills
  // `children` from appendChild, so a list that moved into the markup has
  // none as far as it is concerned. That is the tell that it moved.
  (function () {
    var D = "0123456789ABCDEF".split(""), i, n = 0;
    for (i = 0; i < D.length; i++) {
      if (REG["digit-" + D[i]] && REG["dsay-" + D[i]]) { n++; }
    }
    chk("all sixteen first digits are offered, with their answers", n, 16);
  }());
  chk("and they are in the markup rather than built on demand",
      REG["digits"].children.length, 0);
  chk("the decoder boots on D, not on nothing", lit(), "D");
  chk("with D's answer showing", open_(), "D");
  chk("which is the one that names the block",
      REG["dsay-D"].textContent.indexOf("SIO answers") > -1, true);
  chk("and boots showing the address the chapter uses",
      REG["decode-addr"].textContent, "0xD0000018");

  REG["digit-2"].fire("click");
  chk("digit 2 is claimed by SRAM",
      REG["dsay-2"].textContent.indexOf("SRAM answers") > -1, true);
  chk("choosing a digit rewrites the address",
      REG["decode-addr"].textContent, "0x20000018");
  chk("exactly one digit is lit after a click", lit(), "2");
  chk("and exactly one answer with it", open_(), "2");

  REG["digit-3"].fire("click");
  chk("an unmapped digit says so plainly",
      REG["dsay-3"].textContent.indexOf("Nobody answers") > -1, true);
  chk("and warns it faults rather than silently doing nothing",
      REG["dsay-3"].textContent.indexOf("raises a fault") > -1, true);
  chk("and is drawn as dead rather than merely unchosen",
      REG["digit-3"].classList.contains("dead"), true);

  // The eleven unmapped digits are the chapter's point about the map being
  // mostly empty, so how many there are is worth pinning.
  (function () {
    var D = "0123456789ABCDEF".split(""), i, dead = 0, k;
    for (i = 0; i < D.length; i++) {
      if (REG["digit-" + D[i]].classList.contains("dead")) { dead++; }
    }
    chk("nine of the sixteen digits belong to nobody", dead, 9);
    // And every one of the sixteen, chosen in turn, shows exactly one answer.
    k = 0;
    for (i = 0; i < D.length; i++) {
      REG["digit-" + D[i]].fire("click");
      if (lit() === D[i] && open_() === D[i]) { k++; }
    }
    chk("and each of the sixteen chooses itself and nothing else", k, 16);
  }());

  REG["digit-D"].fire("click");
}());

// ---- Figure 10: work one out yourself ----

REG["we1-addr"].value = "0xD0000018";
REG["we1-addr"].fire("input");
chk("the right address is accepted", REG["we1-addr"].classList.contains("ok"), true);
chk("and it says why it was right",
    REG["we1-say"].textContent.indexOf("same one as for pin 25") > -1, true);

REG["we1-addr"].value = "d0000018";
REG["we1-addr"].fire("input");
chk("hex is accepted without the 0x prefix",
    REG["we1-addr"].classList.contains("ok"), true);

REG["we1-addr"].value = "0xD0000010";
REG["we1-addr"].fire("input");
chk("a wrong address is marked wrong", REG["we1-addr"].classList.contains("no"), true);
chk("and the hint points at the mistake",
    REG["we1-say"].textContent.indexOf("does not depend on which pin") > -1, true);

REG["we1-addr"].value = "";
REG["we1-addr"].fire("input");
chk("an emptied box is neither right nor wrong",
    REG["we1-addr"].classList.contains("no")
    || REG["we1-addr"].classList.contains("ok"), false);

REG["we1-val"].value = "0x8";
REG["we1-val"].fire("input");
chk("1 << 3 is accepted as 0x8", REG["we1-val"].classList.contains("ok"), true);

REG["we2-addr"].value = "0xD0000020";
REG["we2-addr"].fire("input");
chk("turning a pin off means the clear register",
    REG["we2-addr"].classList.contains("ok"), true);
REG["we2-val"].value = "0x4000";
REG["we2-val"].fire("input");
chk("1 << 14 is accepted as 0x4000", REG["we2-val"].classList.contains("ok"), true);

REG["we2-val"].value = "0x400";
REG["we2-val"].fire("input");
chk("an off-by-one shift is rejected", REG["we2-val"].classList.contains("no"), true);

// ---- Figure 9: one store, moment by moment ----
// Every step stays on screen; the scrubber only moves the highlight. That is
// deliberate (a disappearing animation would have to be held in memory), so
// the test asserts the whole trace is present at every position.

(function () {
  var i, n = 0;
  for (i = 0; i < 8; i++) { if (REG["tr-" + i]) { n++; } }
  chk("all eight moments are rendered at once", n, 8);
}());
chk("and they are markup, not built on demand", REG["trace"].children.length, 0);
chk("the trace opens on the first moment", REG["trace-at"].textContent, "1 of 8");
chk("and the first moment is the highlighted one",
    REG["tr-0"].classList.contains("now"), true);
chk("nothing is marked already-seen at the start",
    REG["tr-0"].classList.contains("seen"), false);
// The eighth step is where the light comes on, and it is the payoff of the
// chapter -- a reader with no scripting was seeing an empty box instead.
chk("the last moment is the one where the light comes on",
    REG["tr-7"].textContent.indexOf("It glows") > -1, true);
chk("and the third is the routing decision the chapter is built on",
    REG["tr-2"].textContent.indexOf("whole routing decision") > -1, true);

REG["trace-scrub"].value = "4";
REG["trace-scrub"].fire("input");
chk("scrubbing moves the highlight", REG["tr-4"].classList.contains("now"), true);
chk("and clears it from where it was",
    REG["tr-0"].classList.contains("now"), false);
chk("earlier moments read as already passed",
    REG["tr-0"].classList.contains("seen"), true);
chk("later moments do not", REG["tr-7"].classList.contains("seen"), false);
chk("the counter follows", REG["trace-at"].textContent, "5 of 8");

REG["trace-scrub"].value = "7";
REG["trace-scrub"].fire("input");
chk("the last moment is reachable", REG["trace-at"].textContent, "8 of 8");
// Swept end to end: one highlight, and the seen marks exactly the ones before.
(function () {
  var k, i, bad = 0, now, seen;
  for (k = 0; k < 8; k++) {
    REG["trace-scrub"].value = String(k);
    REG["trace-scrub"].fire("input");
    now = 0; seen = 0;
    for (i = 0; i < 8; i++) {
      if (REG["tr-" + i].classList.contains("now")) { now++; }
      if (REG["tr-" + i].classList.contains("seen") !== (i < k)) { seen++; }
    }
    if (now !== 1 || seen !== 0) { bad++; }
    if (REG["trace-at"].textContent !== (k + 1) + " of 8") { bad++; }
  }
  chk("at every one of the eight, one is highlighted and the rest read right",
      bad, 0);
}());

REG["trace-scrub"].value = "0";
REG["trace-scrub"].fire("input");
chk("scrubbing backwards clears the seen marks",
    REG["tr-3"].classList.contains("seen"), false);

// ---- Figure 1: the nine words ----

REG["btn-register"].fire("click");
chk("picking a word lights its entry",
    REG["dt-register"].classList.contains("is-lit"), true);
chk("and clears the previous one",
    REG["dt-pin"].classList.contains("is-lit"), false);
chk("and its definition is lit too",
    REG["dd-register"].classList.contains("is-lit"), true);
chk("and the drawing follows",
    REG["svg-register"].classList.contains("is-lit"), true);
chk("and the drawing for the old word dims",
    REG["svg-pin"].classList.contains("is-dim"), true);
chk("the zone changes with the word",
    REG["zone-chip"].classList.contains("is-lit"), true);
chk("and the old zone goes out",
    REG["zone-board"].classList.contains("is-lit"), false);
chk("the sentence for the new zone is lit",
    REG["where-chip"].classList.contains("is-lit"), true);
chk("the pressed state is announced",
    REG["btn-register"].getAttribute("aria-pressed"), "true");
chk("and withdrawn from the old one",
    REG["btn-pin"].getAttribute("aria-pressed"), "false");

// A word in the third zone, to prove the zone mapping is not two-valued.
REG["btn-byte"].fire("click");
chk("a number word lights the number zone",
    REG["zone-number"].classList.contains("is-lit"), true);
chk("and neither of the others",
    REG["zone-board"].classList.contains("is-lit")
    || REG["zone-chip"].classList.contains("is-lit"), false);

// Exactly one word is ever lit, however many times it is clicked.
REG["btn-byte"].fire("click");
REG["btn-byte"].fire("click");
var castLit = 0;
["pin", "voltage", "gpio", "bit", "byte", "address",
 "peripheral", "register", "store"].forEach(function (w) {
  if (REG["dt-" + w].classList.contains("is-lit")) { castLit++; }
});
chk("exactly one word is lit after repeated clicks", castLit, 1);

// ---- Figure 2: the board ----

// The kind classes are the markup's, not the script's -- nothing ever assigns
// k-*, it is declared per hole and read back by the click handler. So these
// also stand as the check that the shim is handed the classes the markup
// declares; without that, every one of them reads as absent.
chk("pin 1 is declared a Tock console pin in the markup",
    REG["pad-1"].classList.contains("k-tock"), true);
chk("pin 3 is declared a ground pin",
    REG["pad-3"].classList.contains("k-gnd"), true);
chk("pin 30 is declared the reset pin",
    REG["pad-30"].classList.contains("k-sys"), true);
chk("pin 40 is declared a power pin",
    REG["pad-40"].classList.contains("k-pwr"), true);
chk("and pin 4 is an ordinary GPIO",
    REG["pad-4"].classList.contains("k-gpio"), true);
chk("a hole carries exactly one kind",
    REG["pad-4"].classList.contains("k-pwr"), false);

REG["pad-3"].fire("click");
chk("a ground hole reports itself as ground",
    REG["cat-gnd"].classList.contains("is-lit"), true);
chk("and is no longer described as a GPIO",
    REG["cat-gpio"].classList.contains("is-lit"), false);
chk("the readout follows the click", REG["pick-name"].textContent, "GND");
chk("the other ground holes are marked as kin",
    REG["pad-8"].classList.contains("is-kin"), true);
chk("but the chosen one is lit rather than kin",
    REG["pad-3"].classList.contains("is-kin"), false);

REG["pad-40"].fire("click");
chk("a power hole is power", REG["cat-pwr"].classList.contains("is-lit"), true);
chk("and names the rail", REG["pick-name"].textContent, "VBUS");
chk("and is not ground", REG["cat-gnd"].classList.contains("is-lit"), false);

// The datasheet's pinout figure labels this one "3V3(OUT)", not "3V3": it is a
// supply the board hands out. Locked down because it is easy to "tidy" away.
REG["pad-36"].fire("click");
chk("pin 36 keeps the datasheet's own label",
    REG["pick-name"].textContent, "3V3(OUT)");
chk("and is power rather than ground",
    REG["cat-pwr"].classList.contains("is-lit"), true);

REG["pad-30"].fire("click");
chk("the reset hole is its own kind",
    REG["cat-sys"].classList.contains("is-lit"), true);
chk("and it is the only one of its kind",
    REG["pad-30"].classList.contains("is-kin"), false);

// AGND is analog ground, and must still read as a 0 V hole rather than power.
REG["pad-33"].fire("click");
chk("the analog ground hole counts as ground",
    REG["cat-gnd"].classList.contains("is-lit"), true);
chk("and not as power", REG["cat-pwr"].classList.contains("is-lit"), false);

// The keyboard path has to work, since the pads are not real buttons.
REG["pad-20"].fire("keydown", { key: "Enter" });
chk("Enter selects a hole", REG["pick-name"].textContent, "GP15");
REG["pad-21"].fire("keydown", { key: " " });
chk("Space selects a hole", REG["pick-name"].textContent, "GP16");
REG["pad-22"].fire("keydown", { key: "a" });
chk("an unrelated key changes nothing", REG["pick-name"].textContent, "GP16");

// Roving tabindex: one tab stop for the figure, not forty.
REG["pad-9"].fire("click");
var stops = 0;
for (var ti = 1; ti <= 40; ti++) {
  if (REG["pad-" + ti].getAttribute("tabindex") === "0") { stops++; }
}
chk("the board is one tab stop, not forty", stops, 1);
chk("and the stop is on the chosen hole",
    REG["pad-9"].getAttribute("tabindex"), "0");

// Arrow keys walk the holes the way they are physically arranged.
REG["pad-1"].fire("keydown", { key: "ArrowDown" });
chk("Down moves to the next hole down the left edge",
    REG["pick-num"].textContent, "2");
REG["pad-2"].fire("keydown", { key: "ArrowUp" });
chk("Up moves back", REG["pick-num"].textContent, "1");
REG["pad-1"].fire("keydown", { key: "ArrowUp" });
chk("Up at the top edge stays put", REG["pick-num"].textContent, "1");
// The far end of each column is the trap: without a clamp, stepping past the
// bottom of the left column lands on pin 21, which is the bottom of the RIGHT
// column, so the highlight silently jumps the board.
REG["pad-20"].fire("keydown", { key: "ArrowDown" });
chk("Down at the bottom of the left column stays, rather than crossing to 21",
    REG["pick-num"].textContent, "20");
REG["pad-21"].fire("keydown", { key: "ArrowDown" });
chk("Down at the bottom of the right column stays",
    REG["pick-num"].textContent, "21");
REG["pad-40"].fire("keydown", { key: "ArrowUp" });
chk("Up at the top of the right column stays",
    REG["pick-num"].textContent, "40");
REG["pad-1"].fire("keydown", { key: "ArrowRight" });
chk("Right crosses to the hole opposite, which is 40 not 21",
    REG["pick-num"].textContent, "40");
REG["pad-40"].fire("keydown", { key: "ArrowLeft" });
chk("and Left crosses back", REG["pick-num"].textContent, "1");
REG["pad-21"].fire("keydown", { key: "ArrowLeft" });
chk("pin 21 sits opposite pin 20, not pin 1",
    REG["pick-num"].textContent, "20");
REG["pad-1"].fire("keydown", { key: "End" });
chk("End goes to the bottom of the column", REG["pick-num"].textContent, "20");
REG["pad-20"].fire("keydown", { key: "Home" });
chk("Home goes back to the top", REG["pick-num"].textContent, "1");
REG["pad-40"].fire("keydown", { key: "End" });
chk("End on the right column ends at 21", REG["pick-num"].textContent, "21");
chk("moving with the keyboard also moves focus", REG._focused, "pad-21");

// Exactly one hole is ever lit.
REG["pad-9"].fire("click");
var padLit = 0;
for (var pi = 1; pi <= 40; pi++) {
  if (REG["pad-" + pi].classList.contains("is-lit")) { padLit++; }
}
chk("exactly one hole is lit", padLit, 1);

REG["board-w"].fire("click");
chk("choosing the wireless board lights its column",
    REG["variant-w"].classList.contains("is-lit"), true);
chk("and puts the other one out",
    REG["variant-plain"].classList.contains("is-lit"), false);
chk("and reveals the note about where its light lives",
    REG["four-note-w"].classList.contains("is-lit"), true);
chk("and says so to a screen reader",
    REG["board-w"].getAttribute("aria-pressed"), "true");
REG["board-plain"].fire("click");
chk("switching back restores the plain board",
    REG["variant-plain"].classList.contains("is-lit"), true);
chk("and hides the wireless note again",
    REG["four-note-w"].classList.contains("is-lit"), false);

// Which board you have does not change which holes exist.
chk("the board choice leaves the header alone",
    REG["pad-9"].classList.contains("is-lit"), true);

// ---- Figure 3: high or low ----

REG["lvl-low"].fire("click");
chk("driving low turns the circuit off",
    REG["lvl-fig"].classList.contains("is-on"), false);
chk("and lights the sentence for low",
    REG["say-low"].classList.contains("is-lit"), true);
chk("and puts out the one for high",
    REG["say-high"].classList.contains("is-lit"), false);
chk("the voltage shown is 0 V", REG["volt-label"].textContent, "0 V");
chk("and turning a pin off is a different register, not a different value",
    REG["lvl-store"].textContent, "*0xD0000020 = 0x02000000");

REG["lvl-high"].fire("click");
chk("driving high turns it back on",
    REG["lvl-fig"].classList.contains("is-on"), true);
chk("and restores the voltage", REG["volt-label"].textContent, "3.3 V");
chk("and the set register", REG["lvl-store"].textContent,
    "*0xD0000018 = 0x02000000");

// The same button twice must not toggle.
REG["lvl-high"].fire("click");
chk("pressing high twice leaves it on",
    REG["lvl-fig"].classList.contains("is-on"), true);
REG["lvl-low"].fire("click");
REG["lvl-low"].fire("click");
chk("pressing low twice leaves it off",
    REG["lvl-fig"].classList.contains("is-on"), false);

// ---- Adversarial sequences over the three opening figures ----
// The older figures carry these; the new ones did not. Each one drives the
// figure into a state no reader would reach deliberately, then checks the
// invariant that must hold anyway.

t("every hole clicked in turn leaves exactly one lit and one tab stop", function () {
  for (var i = 1; i <= 40; i++) { REG["pad-" + i].fire("click"); }
  var lit = 0, stops = 0;
  for (var j = 1; j <= 40; j++) {
    if (REG["pad-" + j].classList.contains("is-lit")) { lit++; }
    if (REG["pad-" + j].getAttribute("tabindex") === "0") { stops++; }
  }
  if (lit !== 1) { throw new Error(lit + " lit"); }
  if (stops !== 1) { throw new Error(stops + " tab stops"); }
});

t("arrow keys walked the length of both columns stay in range", function () {
  REG["pad-1"].fire("click");
  for (var i = 0; i < 60; i++) {
    REG[REG._focused || "pad-1"].fire("keydown", { key: "ArrowDown" });
  }
  var n = parseInt(REG["pick-num"].textContent, 10);
  if (!(n >= 1 && n <= 40)) { throw new Error("walked off the board to " + n); }
  for (var k = 0; k < 60; k++) {
    REG[REG._focused || "pad-1"].fire("keydown", { key: "ArrowUp" });
  }
  n = parseInt(REG["pick-num"].textContent, 10);
  if (!(n >= 1 && n <= 40)) { throw new Error("walked off the board to " + n); }
});

t("hammering left and right never leaves the board", function () {
  REG["pad-1"].fire("click");
  var keys = ["ArrowRight", "ArrowLeft", "ArrowRight", "Home", "End", "ArrowLeft"];
  for (var i = 0; i < 40; i++) {
    var at = REG._focused || "pad-1";
    REG[at].fire("keydown", { key: keys[i % keys.length] });
    var n = parseInt(REG["pick-num"].textContent, 10);
    if (!(n >= 1 && n <= 40)) { throw new Error("left the board at step " + i); }
  }
});

t("every word clicked in turn leaves exactly one lit and one zone lit", function () {
  var words = ["pin", "voltage", "gpio", "bit", "byte", "address",
               "peripheral", "register", "store"];
  words.forEach(function (w) { REG["btn-" + w].fire("click"); });
  words.forEach(function (w) { REG["btn-" + w].fire("click"); });
  var lit = 0;
  words.forEach(function (w) {
    if (REG["dt-" + w].classList.contains("is-lit")) { lit++; }
  });
  if (lit !== 1) { throw new Error(lit + " words lit"); }
  var zones = 0;
  ["board", "chip", "number"].forEach(function (z) {
    if (REG["zone-" + z].classList.contains("is-lit")) { zones++; }
  });
  if (zones !== 1) { throw new Error(zones + " zones lit"); }
});

t("a word is never lit and dimmed at the same time", function () {
  ["pin", "byte", "store"].forEach(function (w) {
    REG["btn-" + w].fire("click");
    ["pin", "voltage", "gpio", "bit", "byte", "address",
     "peripheral", "register", "store"].forEach(function (k) {
      var g = REG["svg-" + k];
      if (g.classList.contains("is-lit") && g.classList.contains("is-dim")) {
        throw new Error(k + " is both lit and dimmed after choosing " + w);
      }
    });
  });
});

t("the pin toggled repeatedly ends where the last press says", function () {
  for (var i = 0; i < 25; i++) {
    REG[i % 2 ? "lvl-low" : "lvl-high"].fire("click");
  }
  // 25 presses: the last is i=24, which is even, so high.
  if (!REG["lvl-fig"].classList.contains("is-on")) { throw new Error("ended low"); }
  if (REG["lvl-store"].textContent !== "*0xD0000018 = 0x02000000") {
    throw new Error("store line disagrees: " + REG["lvl-store"].textContent);
  }
});

t("switching board back and forth does not disturb the chosen hole", function () {
  REG["pad-14"].fire("click");
  for (var i = 0; i < 10; i++) {
    REG[i % 2 ? "board-w" : "board-plain"].fire("click");
  }
  if (REG["pick-name"].textContent !== "GP10") {
    throw new Error("hole changed to " + REG["pick-name"].textContent);
  }
  if (!REG["pad-14"].classList.contains("is-lit")) { throw new Error("lost the highlight"); }
});

// The script writes `step next` for the instruction about to run. The
// stylesheet used to say `.step.now`, so the highlight was never applied and
// nothing showed which line Step would execute. Pin the class name here,
// because the mismatch is invisible: both halves look correct on their own.

// ---- Figure 4: one digit is four bits ----
// The boot state first, because that is the one a reader meets and the one
// QuickLook and a scripting-off reader both see.

chk("the hex figure boots on the address the chapter uses",
    REG["hx-addr"].textContent, "0xD0000018");
chk("and on the first digit, which is the one question 1 is about",
    REG["hd-0"].getAttribute("aria-pressed"), "true");
chk("and the other seven are not pressed",
    REG["hd-7"].getAttribute("aria-pressed"), "false");
chk("the eight digit cells show the eight digits", (function () {
  var s = "";
  for (var i = 0; i < 8; i++) { s += REG["hdd-" + i].textContent; }
  return s;
}()), "D0000018");
chk("D is shown broken into the bits that make it",
    REG["hx-sum"].textContent, "8 + 4 + 1");
chk("and the sum is stated as a number", REG["hx-val"].textContent, "13");
chk("and that number is named as the digit", REG["hx-char"].textContent, "D");
chk("the ordinary-tens reading is the real one, not a rounded one",
    REG["hx-dec"].textContent, "3,489,660,952");

// The four bits of D: 8 on, 4 on, 2 off, 1 on.
chk("the bit worth 8 boots on", REG["nb-8"].getAttribute("aria-pressed"), "true");
chk("the bit worth 4 boots on", REG["nb-4"].getAttribute("aria-pressed"), "true");
chk("the bit worth 2 boots off", REG["nb-2"].getAttribute("aria-pressed"), "false");
chk("the bit worth 1 boots on", REG["nb-1"].getAttribute("aria-pressed"), "true");
chk("and each bit's own readout agrees with it",
    REG["nbb-8"].textContent + REG["nbb-4"].textContent +
    REG["nbb-2"].textContent + REG["nbb-1"].textContent, "1101");

// Flipping a bit must move the digit above it and nothing else.
REG["nb-2"].fire("click");
chk("switching the 2 bit on turns D into F", REG["hx-char"].textContent, "F");
chk("and rewrites the whole address", REG["hx-addr"].textContent, "0xF0000018");
chk("and the sum names all four", REG["hx-sum"].textContent, "8 + 4 + 2 + 1");
chk("and the tens reading follows", REG["hx-dec"].textContent, "4,026,531,864");
REG["nb-2"].fire("click");
chk("flipping the same bit back restores the digit",
    REG["hx-addr"].textContent, "0xD0000018");

// A digit of zero is the case a naive `sum || "0"` gets wrong.
REG["nb-8"].fire("click");
REG["nb-4"].fire("click");
REG["nb-1"].fire("click");
chk("a digit with no bits on reads as zero rather than blank",
    REG["hx-sum"].textContent, "0");
chk("and the digit itself is 0", REG["hx-char"].textContent, "0");
chk("and the address loses its leading digit, not its length",
    REG["hx-addr"].textContent, "0x00000018");
chk("and the tens reading is the small number it should be",
    REG["hx-dec"].textContent, "24");

// The last digit is the one that exercises no-commas and the low place values.
REG["hd-7"].fire("click");
chk("picking another digit moves the pressed state",
    REG["hd-7"].getAttribute("aria-pressed"), "true");
chk("and takes it away from the old one",
    REG["hd-0"].getAttribute("aria-pressed"), "false");
chk("the four bits now describe the digit just picked",
    REG["hx-sum"].textContent, "8");
chk("and that digit is 8", REG["hx-char"].textContent, "8");
// 8 is already on for this digit, so F is the other three switched on.
REG["nb-4"].fire("click");
REG["nb-2"].fire("click");
REG["nb-1"].fire("click");
chk("F can be built from the bottom digit up", REG["hx-char"].textContent, "F");
chk("and lands in the last place of the address",
    REG["hx-addr"].textContent, "0x0000001F");

REG["hx-reset"].fire("click");
chk("reset restores the address", REG["hx-addr"].textContent, "0xD0000018");
chk("and restores the digit under the cursor",
    REG["hd-0"].getAttribute("aria-pressed"), "true");
chk("and the bits with it", REG["hx-sum"].textContent, "8 + 4 + 1");

chk("the bit row names the digit it belongs to",
    REG["hxr-0"].classList.contains("is-on"), true);
chk("and only that one", REG["hxr-3"].classList.contains("is-on"), false);

t("every digit picked in turn leaves exactly one pressed and one named",
  function () {
    for (var i = 0; i < 8; i++) {
      REG["hd-" + i].fire("click");
      var n = 0, r = 0;
      for (var j = 0; j < 8; j++) {
        if (REG["hd-" + j].getAttribute("aria-pressed") === "true") { n++; }
        if (REG["hxr-" + j].classList.contains("is-on")) { r++; }
      }
      if (n !== 1) { throw new Error(n + " pressed after picking " + i); }
      if (r !== 1) { throw new Error(r + " ranges shown after picking " + i); }
      if (REG["hxr-" + i].classList.contains("is-on") !== true) {
        throw new Error("the range shown is not the digit picked: " + i);
      }
    }
  });

t("the address never leaves eight digits, whatever is flipped", function () {
  var places = [8, 4, 2, 1], i, j;
  for (i = 0; i < 8; i++) {
    REG["hd-" + i].fire("click");
    for (j = 0; j < places.length; j++) {
      REG["nb-" + places[j]].fire("click");
      var a = REG["hx-addr"].textContent;
      if (a.length !== 10 || a.slice(0, 2) !== "0x") {
        throw new Error("address became " + a);
      }
      if (!/^0x[0-9A-F]{8}$/.test(a)) { throw new Error("stray digit: " + a); }
    }
  }
});

// The figure's note tells the reader to watch the first digit while editing
// any of the other seven, and says it never moves. That is the claim, so it
// gets asserted directly rather than left implied by the address strings.
t("editing any other digit leaves the first one alone", function () {
  var places = [8, 4, 2, 1], i, j;
  REG["hx-reset"].fire("click");
  for (i = 1; i < 8; i++) {
    REG["hd-" + i].fire("click");
    for (j = 0; j < places.length; j++) {
      REG["nb-" + places[j]].fire("click");
      if (REG["hdd-0"].textContent !== "D") {
        throw new Error("the first digit became " + REG["hdd-0"].textContent +
                        " while editing digit " + i);
      }
      if (REG["hx-addr"].textContent.charAt(2) !== "D") {
        throw new Error("the address lost its first digit: " +
                        REG["hx-addr"].textContent);
      }
    }
  }
  REG["hx-reset"].fire("click");
});

t("the sum shown always adds up to the digit shown", function () {
  var places = [8, 4, 2, 1], i, j, k;
  for (i = 0; i < 8; i++) {
    REG["hd-" + i].fire("click");
    for (j = 0; j < places.length; j++) {
      REG["nb-" + places[j]].fire("click");
      var parts = REG["hx-sum"].textContent.split(" + ");
      var total = 0;
      for (k = 0; k < parts.length; k++) { total += parseInt(parts[k], 10); }
      if (String(total) !== REG["hx-val"].textContent) {
        throw new Error(REG["hx-sum"].textContent + " != " +
                        REG["hx-val"].textContent);
      }
      if ("0123456789ABCDEF".charAt(total) !== REG["hx-char"].textContent) {
        throw new Error(total + " shown as " + REG["hx-char"].textContent);
      }
    }
  }
});
REG["hx-reset"].fire("click");

// ---- Figure 7: base plus offset ----

chk("the register figure boots on the one this chapter stores to",
    REG["rg-addr"].textContent, "0xD0000018");
chk("and shows that address as an offset, not just as a whole",
    REG["rg-off"].textContent, "0x018");
chk("and the row for it is the pressed one",
    REG["rg-2"].getAttribute("aria-pressed"), "true");
chk("and its name is the one shown",
    REG["rgn-2"].classList.contains("is-on"), true);
chk("and no other name is shown alongside it",
    REG["rgn-0"].classList.contains("is-on"), false);

REG["rg-0"].fire("click");
chk("the first register is 0x10 past the base", REG["rg-off"].textContent, "0x010");
chk("which lands at 0xD0000010", REG["rg-addr"].textContent, "0xD0000010");
chk("and the name shown follows the click",
    REG["rgn-0"].classList.contains("is-on"), true);
chk("and the name that was shown is put away",
    REG["rgn-2"].classList.contains("is-on"), false);

REG["rg-7"].fire("click");
chk("the last register is 0x2C past the base", REG["rg-off"].textContent, "0x02C");
chk("which lands at 0xD000002C", REG["rg-addr"].textContent, "0xD000002C");

// Taking the twins away is how the figure shows the stride of 8.
chk("both halves are shown before anything is asked",
    REG["rg-1"].classList.contains("is-gone"), false);
REG["rg-twins"].fire("click");
chk("taking the twins away hides them",
    REG["rg-1"].classList.contains("is-gone"), true);
chk("and leaves the four that are left alone",
    REG["rg-0"].classList.contains("is-gone"), false);
chk("and the button records that it is on",
    REG["rg-twins"].getAttribute("aria-pressed"), "true");
chk("a hidden row does not stay selected",
    REG["rg-7"].getAttribute("aria-pressed"), "false");
chk("the selection falls back to the register it is the twin of",
    REG["rg-6"].getAttribute("aria-pressed"), "true");
chk("and the arithmetic follows it", REG["rg-addr"].textContent, "0xD0000028");

REG["rg-twins"].fire("click");
chk("putting them back shows them again",
    REG["rg-1"].classList.contains("is-gone"), false);
chk("and the button records that it is off",
    REG["rg-twins"].getAttribute("aria-pressed"), "false");
chk("and the selection is not disturbed a second time",
    REG["rg-6"].getAttribute("aria-pressed"), "true");

t("every register clicked in turn leaves exactly one pressed and one named",
  function () {
    for (var i = 0; i < 8; i++) {
      REG["rg-" + i].fire("click");
      var pressed = 0, named = 0;
      for (var j = 0; j < 8; j++) {
        if (REG["rg-" + j].getAttribute("aria-pressed") === "true") { pressed++; }
        if (REG["rgn-" + j].classList.contains("is-on")) { named++; }
      }
      if (pressed !== 1) { throw new Error(pressed + " pressed at row " + i); }
      if (named !== 1) { throw new Error(named + " named at row " + i); }
    }
  });

t("base plus offset is arithmetic, not a lookup table", function () {
  var want = ["0xD0000010", "0xD0000014", "0xD0000018", "0xD000001C",
              "0xD0000020", "0xD0000024", "0xD0000028", "0xD000002C"];
  for (var i = 0; i < 8; i++) {
    REG["rg-" + i].fire("click");
    if (REG["rg-addr"].textContent !== want[i]) {
      throw new Error("row " + i + " gave " + REG["rg-addr"].textContent);
    }
  }
});

t("hiding the twins never leaves a hidden row selected", function () {
  for (var i = 0; i < 8; i++) {
    if (REG["rg-twins"].getAttribute("aria-pressed") === "true") {
      REG["rg-twins"].fire("click");
    }
    REG["rg-" + i].fire("click");
    REG["rg-twins"].fire("click");
    for (var j = 0; j < 8; j++) {
      if (REG["rg-" + j].getAttribute("aria-pressed") === "true" &&
          REG["rg-" + j].classList.contains("is-gone")) {
        throw new Error("row " + j + " is selected and hidden");
      }
    }
  }
  REG["rg-twins"].fire("click");
});

// ---- the two packages ----

chk("the package switcher opens on the part on the reader's desk",
    REG["pk-0"].getAttribute("aria-pressed"), "true");
chk("and shows that part's description",
    REG["pkp-0"].classList.contains("is-on"), true);
chk("the other package is not also shown",
    REG["pkp-1"].classList.contains("is-on"), false);

REG["pk-1"].fire("click");
chk("switching packages presses the other button",
    REG["pk-1"].getAttribute("aria-pressed"), "true");
chk("and releases the first", REG["pk-0"].getAttribute("aria-pressed"), "false");
chk("and swaps which description is shown",
    REG["pkp-1"].classList.contains("is-on")
      && !REG["pkp-0"].classList.contains("is-on"), true);

// The counts are the whole point of the switch, and they are the numbers most
// likely to be edited into agreement with each other by mistake.
chk("the 60-pin part is described with 30 GPIOs",
    REG["pkp-0"].textContent.indexOf("0 to 29") > -1, true);
chk("the 80-pin part is described with 48",
    REG["pkp-1"].textContent.indexOf("0 to 47") > -1, true);
chk("the packages are named by their real sizes",
    REG["pkp-0"].textContent.indexOf("QFN-60") > -1
      && REG["pkp-1"].textContent.indexOf("QFN-80") > -1, true);
// Three later passages call it "the 80-pin part". This switcher is the only
// place the chapter now says how many pins a QFN-80 has, so those depend on it.
chk("and by their pin counts, which later prose refers back to",
    REG["pkp-0"].textContent.indexOf("sixty pins") > -1
      && REG["pkp-1"].textContent.indexOf("eighty pins") > -1, true);

REG["pk-0"].fire("click");

// ---- the hex digit strip ----
// Sixteen cells, each digit against its value. This was a sentence; the values
// are arithmetic, so they are recomputed here rather than trusted.
(function () {
  var digits = "0123456789ABCDEF", i, right = 0;
  for (i = 0; i < 16; i++) {
    if (!REG["hk-" + i]) { throw new Error("hex strip is missing cell " + i); }
    if (REG["hk-" + i].textContent === digits.charAt(i) + String(i)) { right++; }
  }
  chk("every hex cell pairs its digit with the right value", right, 16);
}());
chk("the ten familiar digits are not marked as the new part",
    REG["hk-9"].classList.contains("hexkey-letter"), false);
chk("and the six letters are", REG["hk-10"].classList.contains("hexkey-letter"), true);
chk("F is the last of them", REG["hk-15"].classList.contains("hexkey-letter"), true);

chk("the package switcher puts the other package away",
    REG["pkp-1"].classList.contains("is-off"), true);

chk("and keeps the one on the reader's desk",
    REG["pkp-0"].classList.contains("is-off"), false);

(function () {
  var t = REG["pairs-register"].textContent;
  chk("both meanings of register are set against each other",
      t.indexOf("peripheral register") > -1 && t.indexOf("processor register") > -1,
      true);
}());

t("clicking a map row does not add one", function(){
  var i;
  for(i=0;i<5;i++) REG["mr-flash-applications"].fire("click");
  if(REG["map"].children.length!==0) throw new Error("map grew");
  if(mopen()!=="flash-applications") throw new Error("opened "+mopen());
});

t("only one map row stays selected", function(){
  REG["mr-flash-tock-kernel"].fire("click");
  REG["mr-xosc"].fire("click");
  if(mpressed()!=="xosc") throw new Error("pressed "+mpressed());
  if(mopen()!=="xosc") throw new Error("open "+mopen());
});

t("every one of the eighteen chooses itself and nothing else", function(){
  var i, bad=0;
  for(i=0;i<MROWS.length;i++){
    REG["mr-"+MROWS[i]].fire("click");
    if(mpressed()!==MROWS[i]||mopen()!==MROWS[i]) bad++;
  }
  REG["mr-sio"].fire("click");
  if(bad) throw new Error(bad+" rows do not");
});

t("slider swept across the whole range without throwing", function(){
  for(var n=0;n<=31;n++){ REG["pin"].value=String(n); REG["pin"].fire("input"); }
  if(REG["ro-hex"].textContent!=="0x80000000") throw new Error("end of sweep wrong: "+REG["ro-hex"].textContent);
  REG["pin"].value="0"; REG["pin"].fire("input");
  if(REG["ro-hex"].textContent!=="0x00000001") throw new Error("wrap back wrong");
});

(function () {
  var i, ids = ["rm-1", "rm-2", "rm-3"], n = 0;
  for (i = 0; i < ids.length; i++) {
    if (REG[ids[i]] && REG[ids[i]].getAttribute("role") === "group") { n++; }
  }
  chk("each roadmap is a named group rather than a labelled div", n, 3);
}());

(function () {
  var i, ids = ["pairs-machines", "pairs-register", "pairs-setup"], found = 0;
  for (i = 0; i < ids.length; i++) { if (REG[ids[i]]) { found++; } }
  chk("all three sentence-tables are grids", found, 3);
}());
