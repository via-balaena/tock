// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Assertions for ch01-everything-is-memory. Run via:
//     python3 learning/tools/check.py

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

// ---- No figure may boot into an empty state ----
// A reader who never clicks must still be shown the instructive case.

chk("the address map boots with a region already chosen",
    REG["map-detail"].textContent.length > 40, true);
chk("and the region it chooses is SIO",
    REG["map-detail"].textContent.indexOf("0xD0000018") > -1, true);
chk("the behavior table boots with an address already chosen",
    REG["beh-w"].textContent.length > 20, true);
chk("and it chooses the one that breaks expectations",
    REG["beh-r"].textContent.indexOf("Not promised") > -1, true);

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

// ---- Instrument 1: the layer ladder ----

chk("ladder starts with one rung", REG["ladder-count"].textContent, "1 of 5 shown");
for (var i = 0; i < 10; i++) { REG["ladder-next"].fire("click"); }
chk("ladder stops at the last rung", REG["ladder-count"].textContent, "5 of 5 shown");
chk("ladder button disables at the end", REG["ladder-next"].disabled, true);
REG["ladder-reset"].fire("click");
chk("ladder resets", REG["ladder-count"].textContent, "1 of 5 shown");

// ---- Instrument 3: the memory map ----

chk("every mapped region is rendered", REG["map"].children.length, 18);
// SIO is second from the end now that the processor's own registers are listed.
REG["map"].children[16].fire("click");
chk("SIO detail derives 0xD0000018",
    REG["map-detail"].textContent.indexOf("0xD0000018") > -1, true);
REG["map"].children[0].fire("click");
chk("the list starts at address zero, where the processors start",
    REG["map-detail"].textContent.indexOf("starting point for both Arm processors") > -1, true);

// ---- Figure 5: read/write behaviors ----

chk("all four behaviors are rendered", REG["beh"].children.length, 4);
REG["beh"].children[0].fire("click");
chk("SRAM reads back what you stored", REG["beh-r"].textContent, "Exactly what you stored.");
REG["beh"].children[2].fire("click");
chk("GPIO_OUT_SET is described as an OR operation",
    REG["beh-w"].textContent.indexOf("gpio_out |= value") > -1, true);

// ---- Figure 7: the race. This is the chapter's central claim. ----

// Read-modify-write: core 1 reads a stale value and erases core 0's write.
REG["tab-rmw"].fire("click");
REG["race-all"].fire("click");
chk("RMW loses core 0's write", REG["corehw-val"].textContent, "0x00000400");
chk("RMW leaves only pin 10 high", REG["corehw-sub"].textContent, "pin 10 high");
chk("RMW outcome is marked bad", REG["race-outcome"].className.indexOf("bad") > -1, true);
chk("RMW disables stepping at the end", REG["race-step"].disabled, true);

// Atomic set: the hardware does the OR, so both survive.
REG["tab-atomic"].fire("click");
chk("switching scenario resets the hardware register",
    REG["corehw-val"].textContent, "0x00000000");
REG["race-all"].fire("click");
chk("atomic keeps both writes", REG["corehw-val"].textContent, "0x02000400");
chk("atomic leaves both pins high", REG["corehw-sub"].textContent, "pins 10, 25 high");
chk("atomic outcome is marked good", REG["race-outcome"].className.indexOf("good") > -1, true);

// Stepping one instruction at a time must reach the same state as running all.
REG["tab-rmw"].fire("click");
for (var j = 0; j < 6; j++) { REG["race-step"].fire("click"); }
chk("stepwise matches run-all", REG["corehw-val"].textContent, "0x00000400");

// ---- Figure 7: keyboard operation of the tablist (WAI-ARIA tab pattern) ----

REG["tab-rmw"].fire("click");
chk("selected tab is in the tab order", REG["tab-rmw"].getAttribute("tabindex"), "0");
chk("unselected tab is removed from the tab order", REG["tab-atomic"].getAttribute("tabindex"), "-1");
chk("panel is labelled by the selected tab",
    REG["race-panel"].getAttribute("aria-labelledby"), "tab-rmw");

REG["tab-rmw"].fire("keydown", { key: "ArrowRight" });
chk("ArrowRight moves to the next tab", REG["tab-atomic"].getAttribute("aria-selected"), "true");
chk("ArrowRight moves the tab order with it", REG["tab-atomic"].getAttribute("tabindex"), "0");
chk("ArrowRight relabels the panel",
    REG["race-panel"].getAttribute("aria-labelledby"), "tab-atomic");
chk("ArrowRight moves focus", REG._focused, "tab-atomic");

REG["tab-atomic"].fire("keydown", { key: "ArrowRight" });
chk("ArrowRight wraps around", REG["tab-rmw"].getAttribute("aria-selected"), "true");

REG["tab-rmw"].fire("keydown", { key: "ArrowLeft" });
chk("ArrowLeft wraps backwards", REG["tab-atomic"].getAttribute("aria-selected"), "true");

REG["tab-atomic"].fire("keydown", { key: "Home" });
chk("Home selects the first tab", REG["tab-rmw"].getAttribute("aria-selected"), "true");
REG["tab-rmw"].fire("keydown", { key: "End" });
chk("End selects the last tab", REG["tab-atomic"].getAttribute("aria-selected"), "true");

var beforeKey = REG["corehw-val"].textContent;
REG["tab-atomic"].fire("keydown", { key: "b" });
chk("an unrelated key changes nothing", REG["corehw-val"].textContent, beforeKey);


// ---- adversarial sequences ----
// fire() ignores `disabled`, so these are strictly more hostile than a
// browser can be: a real user cannot click a disabled button at all.

t("step spammed 50x past the end of RMW", function(){
  REG["tab-rmw"].fire("click");
  for(var i=0;i<50;i++) REG["race-step"].fire("click");
  if(REG["corehw-val"].textContent!=="0x00000400") throw new Error("state drifted: "+REG["corehw-val"].textContent);
});

t("run-all pressed repeatedly", function(){
  REG["race-reset"].fire("click");
  for(var i=0;i<10;i++) REG["race-all"].fire("click");
  if(REG["corehw-val"].textContent!=="0x00000400") throw new Error("state drifted: "+REG["corehw-val"].textContent);
});

t("tab switched mid-run does not carry state across", function(){
  REG["tab-rmw"].fire("click");
  REG["race-step"].fire("click"); REG["race-step"].fire("click"); REG["race-step"].fire("click");
  REG["tab-atomic"].fire("click");
  if(REG["corehw-val"].textContent!=="0x00000000") throw new Error("stale hardware value: "+REG["corehw-val"].textContent);
  REG["race-all"].fire("click");
  if(REG["corehw-val"].textContent!=="0x02000400") throw new Error("atomic wrong after switch: "+REG["corehw-val"].textContent);
});

t("reset mid-run then run-all", function(){
  REG["tab-rmw"].fire("click");
  REG["race-step"].fire("click"); REG["race-step"].fire("click");
  REG["race-reset"].fire("click");
  if(REG["corehw-val"].textContent!=="0x00000000") throw new Error("reset left state");
  REG["race-all"].fire("click");
  if(REG["corehw-val"].textContent!=="0x00000400") throw new Error("post-reset run wrong");
});

t("same tab clicked repeatedly resets cleanly", function(){
  for(var i=0;i<5;i++) REG["tab-atomic"].fire("click");
  if(REG["corehw-val"].textContent!=="0x00000000") throw new Error("repeat tab click left state");
});

t("steps list does not grow when re-rendered", function(){
  REG["tab-rmw"].fire("click");
  var n1=REG["race-steps"].children.length;
  REG["race-step"].fire("click"); REG["race-step"].fire("click");
  REG["race-reset"].fire("click");
  var n2=REG["race-steps"].children.length;
  if(n1!==n2) throw new Error("steps leaked: "+n1+" -> "+n2);
  if(n1!==6) throw new Error("expected 6 RMW steps, got "+n1);
});

t("map rows are not duplicated by clicking", function(){
  var before=REG["map"].children.length;
  for(var i=0;i<5;i++) REG["map"].children[3].fire("click");
  if(REG["map"].children.length!==before) throw new Error("map grew");
});

t("only one map row stays selected", function(){
  REG["map"].children[2].fire("click");
  REG["map"].children[9].fire("click");
  var sel=0;
  for(var i=0;i<REG["map"].children.length;i++)
    if(REG["map"].children[i].getAttribute("aria-pressed")==="true") sel++;
  if(sel!==1) throw new Error(sel+" rows selected");
});

t("only one behavior row stays selected", function(){
  REG["beh"].children[1].fire("click");
  REG["beh"].children[3].fire("click");
  var sel=0;
  for(var i=0;i<REG["beh"].children.length;i++)
    if(REG["beh"].children[i].getAttribute("aria-pressed")==="true") sel++;
  if(sel!==1) throw new Error(sel+" rows selected");
});

t("slider swept across the whole range without throwing", function(){
  for(var n=0;n<=31;n++){ REG["pin"].value=String(n); REG["pin"].fire("input"); }
  if(REG["ro-hex"].textContent!=="0x80000000") throw new Error("end of sweep wrong: "+REG["ro-hex"].textContent);
  REG["pin"].value="0"; REG["pin"].fire("input");
  if(REG["ro-hex"].textContent!=="0x00000001") throw new Error("wrap back wrong");
});

t("ladder reset after over-clicking still shows one rung", function(){
  for(var i=0;i<30;i++) REG["ladder-next"].fire("click");
  REG["ladder-reset"].fire("click");
  if(REG["ladder-count"].textContent!=="1 of 5 shown") throw new Error("ladder stuck");
  if(REG["ladder-next"].disabled!==false) throw new Error("next stayed disabled after reset");
});

t("ladder rows not duplicated", function(){
  if(REG["ladder"].children.length!==5) throw new Error("ladder has "+REG["ladder"].children.length+" rungs");
});

// ---- Figure 1: the first hex digit decides who answers ----

chk("all sixteen first digits are offered", REG["digits"].children.length, 16);
chk("the decoder boots on D, not on nothing",
    REG["decode-who"].textContent, "SIO answers.");
chk("and boots showing the address the chapter uses",
    REG["decode-addr"].textContent, "0xD0000018");

REG["digits"].children[2].fire("click");
chk("digit 2 is claimed by SRAM", REG["decode-who"].textContent, "SRAM answers.");
chk("choosing a digit rewrites the address",
    REG["decode-addr"].textContent, "0x20000018");
chk("exactly one digit is lit after a click", (function () {
  var n = 0, c = REG["digits"].children;
  for (var i = 0; i < c.length; i++) if (c[i].classList.contains("on")) n++;
  return n;
}()), 1);

REG["digits"].children[3].fire("click");
chk("an unmapped digit says so plainly",
    REG["decode-who"].textContent, "Nobody answers.");
chk("and warns it faults rather than silently doing nothing",
    REG["decode-says"].textContent.indexOf("raises a fault") > -1, true);
REG["digits"].children[13].fire("click");


// ---- The bet: guess before the reveal ----

chk("the bet offers three answers", REG["bet1-opts"].children.length, 3);
chk("no reason is shown before a guess is made", REG["bet1-why"].textContent, "");

REG["bet1-opts"].children[0].fire("click");
chk("a wrong guess is marked wrong",
    REG["bet1-opts"].children[0].classList.contains("wrong"), true);
chk("the right answer is revealed alongside it",
    REG["bet1-opts"].children[2].classList.contains("right"), true);
chk("and the reason explains rather than scores",
    REG["bet1-why"].textContent.indexOf("ordinary memory") > -1, true);

REG["bet1-opts"].children[1].fire("click");
chk("the bet cannot be re-answered once committed",
    REG["bet1-opts"].children[1].classList.contains("wrong"), false);

// ---- Figure 4: work one out yourself ----

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

// ---- Figure 8: the lines the reader is told to skip ----

chk("the disassembly starts focused on the three lines that matter",
    REG["dis"].classList.contains("dis-all"), false);
REG["dis-toggle"].fire("click");
chk("the skipped lines can be shown", REG["dis"].classList.contains("dis-all"), true);
chk("and the control says so", REG["dis-toggle"].getAttribute("aria-expanded"), "true");
chk("with a label that now offers the reverse",
    REG["dis-toggle"].textContent, "Hide them again");
REG["dis-toggle"].fire("click");
chk("toggling back re-focuses", REG["dis"].classList.contains("dis-all"), false);
chk("and restores the original label",
    REG["dis-toggle"].textContent.indexOf("Show the 12 lines") > -1, true);

// ---- Figure 4: one store, moment by moment ----
// Every step stays on screen; the scrubber only moves the highlight. That is
// deliberate (a disappearing animation would have to be held in memory), so
// the test asserts the whole trace is present at every position.

chk("all eight moments are rendered at once", REG["trace"].children.length, 8);
chk("the trace opens on the first moment", REG["trace-at"].textContent, "1 of 8");
chk("and the first moment is the highlighted one",
    REG["trace"].children[0].classList.contains("now"), true);
chk("nothing is marked already-seen at the start",
    REG["trace"].children[0].classList.contains("seen"), false);

REG["trace-scrub"].value = "4";
REG["trace-scrub"].fire("input");
chk("scrubbing moves the highlight", REG["trace"].children[4].classList.contains("now"), true);
chk("and clears it from where it was",
    REG["trace"].children[0].classList.contains("now"), false);
chk("earlier moments read as already passed",
    REG["trace"].children[0].classList.contains("seen"), true);
chk("later moments do not", REG["trace"].children[7].classList.contains("seen"), false);
chk("the counter follows", REG["trace-at"].textContent, "5 of 8");

REG["trace-scrub"].value = "7";
REG["trace-scrub"].fire("input");
chk("the last moment is reachable", REG["trace-at"].textContent, "8 of 8");
chk("exactly one moment is ever highlighted", (function () {
  var n = 0, c = REG["trace"].children;
  for (var i = 0; i < c.length; i++) if (c[i].classList.contains("now")) n++;
  return n;
}()), 1);

REG["trace-scrub"].value = "0";
REG["trace-scrub"].fire("input");
chk("scrubbing backwards clears the seen marks",
    REG["trace"].children[3].classList.contains("seen"), false);

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
