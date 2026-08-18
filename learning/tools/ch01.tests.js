// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Assertions for ch01-everything-is-memory. Run via:
//     python3 learning/tools/check.py

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
