// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Assertions for ch01-everything-is-memory. Run via:
//     python3 learning/tools/check.py

// ---- Instrument 5: the bit builder ----

REG["pin"].value = "25"; REG["pin"].fire("input");
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

chk("every mapped region is rendered", REG["map"].children.length, 16);
REG["map"].children[15].fire("click");
chk("SIO detail derives 0xD0000018",
    REG["map-detail"].textContent.indexOf("0xD0000018") > -1, true);

// ---- Instrument 4: read/write behaviours ----

chk("all four behaviours are rendered", REG["beh"].children.length, 4);
REG["beh"].children[0].fire("click");
chk("SRAM reads back what you wrote", REG["beh-r"].textContent, "Exactly what you wrote.");
REG["beh"].children[2].fire("click");
chk("GPIO_OUT_SET is described as an OR operation",
    REG["beh-w"].textContent.indexOf("gpio_out |= value") > -1, true);

// ---- Instrument 6: the race. This is the chapter's central claim. ----

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
chk("atomic leaves both pins high", REG["corehw-sub"].textContent, "pin 10, 25 high");
chk("atomic outcome is marked good", REG["race-outcome"].className.indexOf("good") > -1, true);

// Stepping one instruction at a time must reach the same state as running all.
REG["tab-rmw"].fire("click");
for (var j = 0; j < 6; j++) { REG["race-step"].fire("click"); }
chk("stepwise matches run-all", REG["corehw-val"].textContent, "0x00000400");

// ---- Instrument 6: keyboard operation of the tablist (WAI-ARIA tab pattern) ----

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

t("only one behaviour row stays selected", function(){
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
