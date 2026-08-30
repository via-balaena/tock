// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Assertions for ch01-everything-is-memory. Run via:
//     python3 learning/tools/check.py

function betwhy() {
  var i, on = [];
  for (i = 0; i < 3; i++) {
    if (REG["betwhy-" + i].classList.contains("is-on")) { on.push(String(i)); }
  }
  return on.join("+");
}

var BHK = ["sram", "out", "set", "in"];
function bhopen() {
  var i, on = [];
  for (i = 0; i < BHK.length; i++) {
    if (REG["bhw-" + BHK[i]].classList.contains("is-on")) { on.push(BHK[i]); }
  }
  return on.join("+");
}

chk("the optimizer figure boots on a case rather than blank",
    REG["case-wait"].classList.contains("is-off"), false);
chk("and the other four are put away",
    REG["case-flip"].classList.contains("is-off")
    && REG["case-order"].classList.contains("is-off")
    && REG["case-once"].classList.contains("is-off")
    && REG["case-peek"].classList.contains("is-off"), true);
chk("and the case it opens on is the one the prose just set up",
    REG["opt-wait"].getAttribute("aria-pressed"), "true");

chk("the behavior table boots with an address already chosen", bhopen(), "set");

(function () {
  var i, ids = ["pairs-notation", "pairs-family"], found = 0;
  for (i = 0; i < ids.length; i++) { if (REG[ids[i]]) { found++; } }
  chk("both of this chapter's sentence-tables are grids", found, 2);
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

  chk("the four bargains open on the write-only one",
      on("bhw-set") && on("bhr-set") && on("bhd-set"), true);
  chk("the race ships its steps rather than an empty list",
      on("steps-rmw"), true);
  chk("with the intro and the prompt that go with them",
      on("rint-rmw") && on("rend-idle"), true);
  chk("and no verdict showing before anything has run",
      on("rend-rmw") || on("rend-atomic"), false);
  // The ladder is the inverted case: the markup ships every rung visible and
  // the script is what puts four of them away.
  chk("the ladder ships all five rungs on", (function () {
    var i, n = 0;
    for (i = 0; i < 5; i++) { if (has("rung-" + i, "on")) { n++; } }
    return n;
  }()), 5);
  chk("the bet ships three answers with none of the reasoning given away",
      on("betwhy-0") || on("betwhy-1") || on("betwhy-2"), false);
}());

// ---- Instrument 1: the layer ladder ----

chk("ladder starts with one rung", REG["ladder-count"].textContent, "1 of 5 shown");
// The markup ships all five on, and the script is what puts four away -- so
// with no scripting the reader gets the whole ladder rather than four blanks.
(function () {
  var i, on = 0;
  for (i = 0; i < 5; i++) {
    if (REG["rung-" + i].classList.contains("on")) { on++; }
  }
  chk("and the script is what closed the other four", on, 1);
}());
chk("the bottom rung is the instructions, and is on the page either way",
    REG["rung-4"].textContent.indexOf("str") > -1, true);
chk("the top one is the friendly call the chapter is peeling",
    REG["rung-0"].textContent.indexOf("digitalWrite") > -1, true);
for (var i = 0; i < 10; i++) { REG["ladder-next"].fire("click"); }
chk("ladder stops at the last rung", REG["ladder-count"].textContent, "5 of 5 shown");
(function () {
  var i, on = 0;
  for (i = 0; i < 5; i++) {
    if (REG["rung-" + i].classList.contains("on")) { on++; }
  }
  chk("with every rung back on screen", on, 5);
}());
chk("ladder button disables at the end", REG["ladder-next"].disabled, true);
REG["ladder-reset"].fire("click");
chk("ladder resets", REG["ladder-count"].textContent, "1 of 5 shown");

// ---- Figure 11: read/write behaviors ----

(function () {
  var i, n = 0;
  for (i = 0; i < BHK.length; i++) {
    if (REG["bh-" + BHK[i]] && REG["bhw-" + BHK[i]]
        && REG["bhr-" + BHK[i]] && REG["bhd-" + BHK[i]]) { n++; }
  }
  chk("all four behaviors are rendered, with all three of their lines", n, 4);
}());
chk("and none of it is built on demand", REG["beh"].children.length, 0);
REG["bh-sram"].fire("click");
chk("SRAM reads back what you stored", REG["bhr-sram"].textContent,
    "Exactly what you stored.");
REG["bh-set"].fire("click");
chk("GPIO_OUT_SET is described as an OR operation",
    REG["bhw-set"].textContent.indexOf("gpio_out |= value") > -1, true);
// Storing and reading are two independent decisions, which is the figure's
// whole point, so no two of the four may agree on both.
(function () {
  var i, j, same = 0;
  for (i = 0; i < BHK.length; i++) {
    for (j = i + 1; j < BHK.length; j++) {
      if (REG["bhw-" + BHK[i]].textContent === REG["bhw-" + BHK[j]].textContent
          && REG["bhr-" + BHK[i]].textContent === REG["bhr-" + BHK[j]].textContent) {
        same++;
      }
    }
  }
  chk("and no two of the four make the same pair of promises", same, 0);
}());
REG["bh-set"].fire("click");

// ---- Figure 13: the race. This is the chapter's central claim. ----
// Both scenarios, both endings and every core-card line ship in the markup
// now, so textContent on a container returns all of them at once. What each
// of these asks is which one the script has chosen.
function rend() {
  var K = ["idle", "rmw", "atomic"], i, on = [];
  for (i = 0; i < K.length; i++) {
    if (REG["rend-" + K[i]].classList.contains("is-on")) { on.push(K[i]); }
  }
  return on.join("+");
}
function rsteps() {
  var pre = REG["steps-rmw"].classList.contains("is-on") ? "rs" : "ra";
  var n = pre === "rs" ? 6 : 2, i, out = [];
  for (i = 0; i < n; i++) { out.push(REG[pre + "-" + i]); }
  return out;
}
function marked(kind) {
  var rows = rsteps(), i, out = [];
  for (i = 0; i < rows.length; i++) {
    if (rows[i].classList.contains(kind)) { out.push(i); }
  }
  return out.join(",");
}

// Read-modify-write: core 1 reads a stale value and erases core 0's write.
REG["tab-rmw"].fire("click");
REG["race-all"].fire("click");
chk("RMW loses core 0's write", REG["corehw-val"].textContent, "0x00000400");
chk("RMW leaves only pin 10 high", REG["corehw-pins"].textContent, "pin 10");
chk("RMW outcome is marked bad", REG["race-outcome"].className.indexOf("bad") > -1, true);
chk("RMW disables stepping at the end", REG["race-step"].disabled, true);

// Atomic set: the hardware does the OR, so both survive.
REG["tab-atomic"].fire("click");
chk("switching scenario resets the hardware register",
    REG["corehw-val"].textContent, "0x00000000");
REG["race-all"].fire("click");
chk("atomic keeps both writes", REG["corehw-val"].textContent, "0x02000400");
chk("atomic leaves both pins high", REG["corehw-pins"].textContent, "pins 10, 25");
chk("atomic outcome is marked good", REG["race-outcome"].className.indexOf("good") > -1, true);

// Stepping one instruction at a time must reach the same state as running all.
REG["tab-rmw"].fire("click");
for (var j = 0; j < 6; j++) { REG["race-step"].fire("click"); }
chk("stepwise matches run-all", REG["corehw-val"].textContent, "0x00000400");

// ---- Figure 13: keyboard operation of the tablist (WAI-ARIA tab pattern) ----

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
  if(REG["race-steps"].children.length!==0) throw new Error("steps are script-built again");
  var n1=rsteps().length;
  REG["race-step"].fire("click"); REG["race-step"].fire("click");
  REG["race-reset"].fire("click");
  if(rsteps().length!==n1) throw new Error("steps leaked");
  if(n1!==6) throw new Error("expected 6 RMW steps, got "+n1);
  // The other scenario's rows exist too, and are put away rather than absent.
  if(!REG["ra-0"]||!REG["ra-1"]) throw new Error("the atomic steps are not in the markup");

  if(REG["steps-atomic"].classList.contains("is-on")) throw new Error("both lists shown");
});

t("only one behavior row stays selected", function(){
  REG["bh-out"].fire("click");
  REG["bh-in"].fire("click");
  var i, sel=0;
  for(i=0;i<BHK.length;i++)
    if(REG["bh-"+BHK[i]].getAttribute("aria-pressed")==="true") sel++;
  if(sel!==1) throw new Error(sel+" rows selected");
  if(bhopen()!=="in") throw new Error("open "+bhopen());
  REG["bh-set"].fire("click");
});

t("ladder reset after over-clicking still shows one rung", function(){
  for(var i=0;i<30;i++) REG["ladder-next"].fire("click");
  REG["ladder-reset"].fire("click");
  if(REG["ladder-count"].textContent!=="1 of 5 shown") throw new Error("ladder stuck");
  if(REG["ladder-next"].disabled!==false) throw new Error("next stayed disabled after reset");
});

t("ladder rows not duplicated", function(){
  var i, n=0;
  for(i=0;i<5;i++) if(REG["rung-"+i]) n++;
  if(n!==5) throw new Error("ladder has "+n+" rungs");
  if(REG["ladder"].children.length!==0) throw new Error("ladder is built by script again");
});

// ---- The bet: guess before the reveal ----

(function () {
  var i, n = 0;
  for (i = 0; i < 3; i++) { if (REG["bet-" + i] && REG["betwhy-" + i]) { n++; } }
  chk("the bet offers three answers, each with its reasoning", n, 3);
}());
chk("and all of it is markup", REG["bet1-opts"].children.length, 0);
chk("no reason is shown before a guess is made", betwhy(), "");
chk("exactly one of the three is the right answer", (function () {
  var i, n = 0;
  for (i = 0; i < 3; i++) {
    if (REG["bet-" + i].getAttribute("data-ok") === "true") { n++; }
  }
  return n;
}()), 1);

REG["bet-0"].fire("click");
chk("a wrong guess is marked wrong",
    REG["bet-0"].classList.contains("is-wrong"), true);
chk("the right answer is revealed alongside it",
    REG["bet-2"].classList.contains("is-right"), true);
chk("and the reason explains rather than scores",
    REG["betwhy-0"].textContent.indexOf("ordinary memory") > -1, true);
chk("the reason shown is the one for the guess made", betwhy(), "0");

REG["bet-1"].fire("click");
chk("the bet cannot be re-answered once committed",
    REG["bet-1"].classList.contains("is-wrong"), false);
chk("and the reasoning does not move either", betwhy(), "0");

// ---- Figure 15: the lines the reader is told to skip ----

chk("the disassembly starts focused on the three lines that matter",
    REG["dis"].classList.contains("dis-all"), false);
REG["dis-toggle"].fire("click");
chk("the skipped lines can be shown", REG["dis"].classList.contains("dis-all"), true);
chk("and the control says so", REG["dis-toggle"].getAttribute("aria-expanded"), "true");
chk("and the label the markup shows follows aria-expanded",
    REG["dis-toggle"].getAttribute("aria-expanded"), "true");
REG["dis-toggle"].fire("click");
chk("toggling back re-focuses", REG["dis"].classList.contains("dis-all"), false);
chk("and the label goes back with it",
    REG["dis-toggle"].getAttribute("aria-expanded"), "false");

// ---- Figure 14: what the optimizer does ----

REG["opt-order"].fire("click");
chk("picking a case shows it",
    REG["case-order"].classList.contains("is-off"), false);
chk("and puts the previous one away",
    REG["case-wait"].classList.contains("is-off"), true);
chk("the pressed state follows",
    REG["opt-order"].getAttribute("aria-pressed"), "true");
chk("and is withdrawn from the old one",
    REG["opt-wait"].getAttribute("aria-pressed"), "false");

t("every optimizer case shown in turn leaves exactly one on screen", function () {
  var cases = ["wait", "flip", "order", "once", "peek"];
  cases.forEach(function (k) { REG["opt-" + k].fire("click"); });
  cases.forEach(function (k) { REG["opt-" + k].fire("click"); });
  var shown = 0, pressed = 0;
  cases.forEach(function (k) {
    if (!REG["case-" + k].classList.contains("is-off")) { shown++; }
    if (REG["opt-" + k].getAttribute("aria-pressed") === "true") { pressed++; }
  });
  if (shown !== 1) { throw new Error(shown + " cases on screen"); }
  if (pressed !== 1) { throw new Error(pressed + " buttons pressed"); }
});

// The lone-store case is the chapter's own correction made checkable: both
// columns must stay, because the compiler does not delete that store.
REG["opt-once"].fire("click");
chk("the lone-store case can be reached",
    REG["case-once"].classList.contains("is-off"), false);
chk("and it is the only one on screen",
    REG["case-wait"].classList.contains("is-off")
    && REG["case-peek"].classList.contains("is-off"), true);

// ---- The prediction widget, which no test had ever clicked ----
// Its handler called classList.add("") on the first option, which a browser
// refuses. Nothing downstream ran, so clicking revealed nothing at all.
t("committing to a guess reveals the answer", function () {
  // Already committed above; what this guards is that committing did all
  // three things, not just the one the handler happened to reach.
  if (!REG["bet-0"].classList.contains("is-wrong")) {
    throw new Error("the option picked was not marked wrong");
  }
  if (!REG["bet-2"].classList.contains("is-right")) {
    throw new Error("the correct option was not revealed");
  }
  if (REG["betwhy-0"].textContent.length < 20) {
    throw new Error("no explanation shown: " + REG["betwhy-0"].textContent);
  }
  if (betwhy() !== "0") { throw new Error("showing " + betwhy()); }
});

// ---- The race figure's verdict text, which nothing had ever asserted ----
// Only its class was checked, so the sentence that tells the reader a pin was
// lost could have said anything. The reset prompt was unassertable at all
// until the shim stopped dropping non-empty innerHTML.
REG["tab-rmw"].fire("click");
REG["race-reset"].fire("click");
chk("resetting restores the prompt to step through", rend(), "idle");
chk("which is the prompt and not a verdict",
    REG["rend-idle"].textContent.indexOf("Press") > -1, true);
REG["race-all"].fire("click");
chk("and running the read-modify-write to the end reports the lost pin",
    rend(), "rmw");
chk("in the words the chapter's argument turns on",
    REG["rend-rmw"].textContent.indexOf("Pin 25 never turned on") > -1, true);
chk("and marks that outcome bad",
    REG["race-outcome"].className.indexOf("bad") > -1, true);
REG["race-reset"].fire("click");
chk("resetting again clears the verdict rather than leaving it stale",
    rend(), "idle");
// Both endings are on the page either way; only one is ever showing.
REG["tab-atomic"].fire("click");
REG["race-all"].fire("click");
chk("the other scenario reaches its own ending", rend(), "atomic");
chk("which is the one that says the hardware did it",
    REG["rend-atomic"].textContent.indexOf("the hardware did the OR itself") > -1, true);
REG["tab-rmw"].fire("click");

// ---- Figure 12: one layout, two bases ----
// The figure's claim is that the two halves of an address move independently:
// the port picks the base, the register picks the offset, and neither touches
// the other. That is checkable rather than assertable, so it is checked across
// every combination. Bases and offsets are read off
// chips/rp2350/src/uart.rs -- the ports at :343 and :347, the offsets from the
// register block at :20-60 -- and recomputed here rather than copied from the
// page, so a wrong number in the figure fails instead of agreeing with itself.
(function () {
  var PORTS = [0x40070000, 0x40078000];
  var REGS = [[0x000, "uartdr"], [0x018, "uartfr"],
              [0x024, "uartibrd"], [0x030, "uartcr"]];
  function hex(v, width) {
    var t = v.toString(16).toUpperCase();
    while (t.length < width) { t = "0" + t; }
    return "0x" + t;
  }

  chk("it opens on the port the console uses, and its data register",
      REG["uo-addr"].textContent, "0x40070000");
  chk("named", REG["uo-name"].textContent, "uartdr");

  // Every combination, against arithmetic done here.
  (function () {
    var p, r, bad = [];
    for (p = 0; p < PORTS.length; p++) {
      for (r = 0; r < REGS.length; r++) {
        REG["up-" + p].fire("click");
        REG["ur-" + r].fire("click");
        if (REG["uo-addr"].textContent !== hex(PORTS[p] + REGS[r][0], 8)) {
          bad.push(p + "/" + r);
        }
        if (REG["uo-off"].textContent !== hex(REGS[r][0], 3)) {
          bad.push("off " + p + "/" + r);
        }
        if (REG["uo-name"].textContent !== REGS[r][1]) {
          bad.push("name " + p + "/" + r);
        }
      }
    }
    chk("base plus offset, in all eight combinations", bad.join(","), "");
  }());

  // The independence claim, both ways round.
  (function () {
    var r, offs = [], bases = [], p;
    REG["up-0"].fire("click");
    for (r = 0; r < REGS.length; r++) {
      REG["ur-" + r].fire("click");
      offs.push(REG["uo-off"].textContent);
      bases.push(REG["uo-base"].textContent);
    }
    chk("changing the register never moves the base",
        bases.join(",") === "0x40070000,0x40070000,0x40070000,0x40070000"
          ? "" : bases.join(","), "");
    chk("and it does move the offset, so that is not vacuous",
        offs.join(","), "0x000,0x018,0x024,0x030");

    REG["ur-1"].fire("click");
    offs = [];
    for (p = 0; p < PORTS.length; p++) {
      REG["up-" + p].fire("click");
      offs.push(REG["uo-off"].textContent);
    }
    chk("changing the port never moves the offset",
        offs.join(","), "0x018,0x018");
  }());

  // The readout naming which half moved is the lesson, so it has to be right.
  function moved() {
    var M = ["start", "base", "off"], i, on = [];
    for (i = 0; i < M.length; i++) {
      if (REG["mv-" + M[i]].classList.contains("is-on")) { on.push(M[i]); }
    }
    return on.join(",");
  }
  REG["up-0"].fire("click");
  REG["ur-0"].fire("click");
  REG["up-1"].fire("click");
  chk("switching port reports that only the base moved", moved(), "base");
  REG["ur-2"].fire("click");
  chk("switching register reports that only the offset moved", moved(), "off");
  // Pressing the one already chosen changes nothing, so it must not claim to.
  REG["ur-2"].fire("click");
  chk("re-pressing the current register claims no movement", moved(), "off");
  (function () {
    var seq = ["up-0", "up-1", "ur-0", "ur-3", "up-0", "ur-1"], i, bad = 0;
    for (i = 0; i < seq.length; i++) {
      REG[seq[i]].fire("click");
      if (moved().indexOf(",") > -1 || moved() === "") { bad++; }
    }
    chk("one reading of what moved, at every step", bad, 0);
  }());
  REG["up-0"].fire("click");
  REG["ur-0"].fire("click");
}());

// ---- Figure 15: the three lines, one at a time ----
// The figure opens on the first line the processor runs, which is not the
// first line printed -- that inversion is the thing it exists to show.

chk("the disassembly figure boots on a line rather than blank",
    REG["dl-and"].getAttribute("aria-pressed"), "true");
chk("and it is the mask, the first of the three to run",
    REG["dp-and"].classList.contains("is-on"), true);
chk("the other two panels are away",
    REG["dp-lsl"].classList.contains("is-on") ||
    REG["dp-str"].classList.contains("is-on"), false);
chk("and their lines are not pressed",
    REG["dl-str"].getAttribute("aria-pressed"), "false");

REG["dl-str"].fire("click");
chk("clicking the store shows the store's panel",
    REG["dp-str"].classList.contains("is-on"), true);
chk("and puts the mask's away",
    REG["dp-and"].classList.contains("is-on"), false);
chk("and the pressed state follows the click",
    REG["dl-str"].getAttribute("aria-pressed"), "true");
chk("and leaves the line it came from",
    REG["dl-and"].getAttribute("aria-pressed"), "false");

REG["dl-lsl"].fire("click");
chk("the shift can be reached too",
    REG["dp-lsl"].classList.contains("is-on"), true);
chk("and it is the only one on screen",
    REG["dp-and"].classList.contains("is-on") ||
    REG["dp-str"].classList.contains("is-on"), false);

t("every line clicked in turn leaves exactly one pressed and one panel open",
  function () {
    var keys = ["and", "lsl", "str"], i, j;
    for (i = 0; i < keys.length; i++) {
      REG["dl-" + keys[i]].fire("click");
      var pressed = 0, shown = 0;
      for (j = 0; j < keys.length; j++) {
        if (REG["dl-" + keys[j]].getAttribute("aria-pressed") === "true") { pressed++; }
        if (REG["dp-" + keys[j]].classList.contains("is-on")) { shown++; }
      }
      if (pressed !== 1) { throw new Error(pressed + " pressed at " + keys[i]); }
      if (shown !== 1) { throw new Error(shown + " panels at " + keys[i]); }
      if (REG["dp-" + keys[i]].classList.contains("is-on") !== true) {
        throw new Error("the panel shown is not the line clicked: " + keys[i]);
      }
    }
  });

t("hiding and showing the bookkeeping does not disturb the chosen line",
  function () {
    REG["dl-lsl"].fire("click");
    REG["dis-toggle"].fire("click");
    REG["dis-toggle"].fire("click");
    if (REG["dl-lsl"].getAttribute("aria-pressed") !== "true") {
      throw new Error("the chosen line was lost when the listing was toggled");
    }
    if (REG["dp-lsl"].classList.contains("is-on") !== true) {
      throw new Error("its panel closed when the listing was toggled");
    }
  });
REG["dl-and"].fire("click");

// ---- Figure 17: the same store, sent somewhere else ----

// Boots on the address the code meant, so a reader who never clicks still sees
// a correct program before being shown it going wrong.
chk("the stray figure opens on the intended address",
    REG["st-0"].getAttribute("aria-pressed"), "true");
chk("and its panel is the one showing",
    REG["stp-0"].classList.contains("is-on"), true);
chk("no other panel is showing",
    REG["stp-1"].classList.contains("is-on")
      || REG["stp-2"].classList.contains("is-on")
      || REG["stp-3"].classList.contains("is-on")
      || REG["stp-4"].classList.contains("is-on"), false);
chk("the readout agrees with the markup it boots into",
    REG["stray-moved"].textContent, "your own variable, and nothing else");

// The figure's whole argument is that the readout it changes is the only one
// that moves, so the two it does not touch are asserted after every click.
(function () {
  var i, moved = {};
  for (i = 0; i < 5; i++) {
    REG["st-" + i].fire("click");
    moved[REG["stray-moved"].textContent] = 1;
    if (REG["st-" + i].getAttribute("aria-pressed") !== "true") {
      throw new Error("clicking target " + i + " did not press it");
    }
    if (REG["stp-" + i].classList.contains("is-on") !== true) {
      throw new Error("clicking target " + i + " did not open its panel");
    }
    var open = 0, j;
    for (j = 0; j < 5; j++) {
      if (REG["stp-" + j].classList.contains("is-on")) { open++; }
    }
    if (open !== 1) {
      throw new Error("target " + i + " left " + open + " panels open");
    }
  }
  chk("each of the five says something different moved",
      Object.keys(moved).length, 5);
}());

// Not a decoration: the reader is told to compare these, and they are markup
// the script must never write to.
chk("the pointer that stops is the unmapped one, and says why",
    REG["stp-4"].textContent.indexOf("not because you lacked permission") > -1,
    true);
chk("the readout reports the fault rather than a store",
    REG["stray-moved"].textContent.indexOf("faulted") > -1, true);
// A browser decodes entities in an attribute value before any script sees it.
// This read back a literal "&mdash;" and printed it into the figure.
chk("the readout carries a real dash, not an entity",
    REG["stray-moved"].textContent, "nothing \u2014 the chip faulted");

// ---- the street analogy, row by row ----

chk("the street table opens on a row that holds",
    REG["br-0"].getAttribute("aria-pressed"), "true");
chk("and that row's panel is the one open",
    REG["brp-0"].classList.contains("is-on"), true);

// Four of the seven rows fail, and the prose under the table says so out loud.
// If a verdict is ever edited, that sentence has to move with it.
(function () {
  var i, fails = 0, holds = 0;
  for (i = 0; i < 7; i++) {
    if (REG["br-" + i].classList.contains("no")) { fails++; }
    if (REG["br-" + i].classList.contains("yes")) { holds++; }
  }
  chk("four rows are marked as failing", fails, 4);
  chk("and three as holding", holds, 3);
  chk("every row carries one verdict or the other", fails + holds, 7);
}());

(function () {
  var i, j, open;
  for (i = 0; i < 7; i++) {
    REG["br-" + i].fire("click");
    if (REG["br-" + i].getAttribute("aria-pressed") !== "true") {
      throw new Error("row " + i + " did not press when clicked");
    }
    open = 0;
    for (j = 0; j < 7; j++) {
      if (REG["brp-" + j].classList.contains("is-on")) { open++; }
    }
    if (open !== 1) { throw new Error("row " + i + " left " + open + " panels open"); }
    if (!REG["brp-" + i].classList.contains("is-on")) {
      throw new Error("row " + i + " opened somebody else's panel");
    }
  }
}());

// Each panel has to actually run something, not restate the row.
(function () {
  var i, missing = 0;
  for (i = 0; i < 7; i++) {
    if (REG["brp-" + i].textContent.indexOf("run it") === -1) { missing++; }
    if (REG["brp-" + i].textContent.indexOf("Checked against") === -1) { missing++; }
  }
  chk("every row shows an operation and where it was checked", missing, 0);
}());

chk("the row that fails on reading cites where reading was checked",
    REG["brp-4"].textContent.indexOf("until read out by the CPU") > -1, true);

// ---- Check yourself: six predictions ----

// The point of the section is committing before reading, so nothing may be
// revealed until a question is answered.
(function () {
  var n, hidden = 0, verdicts = 0;
  for (n = 1; n <= 3; n++) {
    if (REG["qa-" + n].classList.contains("is-off")) { hidden++; }
    if (REG["qy-" + n].classList.contains("is-shown")
        || REG["qn-" + n].classList.contains("is-shown")) { verdicts++; }
  }
  chk("all three answers are hidden before anything is answered", hidden, 3);
  chk("and not one verdict is showing", verdicts, 0);
}());

// Exactly one option per question is the correct one, in the markup.
(function () {
  var n, m, keys = 0, per;
  for (n = 1; n <= 3; n++) {
    per = 0;
    for (m = 0; m < 3; m++) {
      if (REG["qo-" + n + "-" + m].getAttribute("data-ok") === "1") { per++; }
    }
    if (per !== 1) { throw new Error("question " + n + " has " + per + " correct answers"); }
    keys += per;
  }
  chk("each of the three questions has exactly one answer key", keys, 3);
}());

// Answering wrongly still has to teach the right answer.
REG["qo-1-0"].fire("click");
chk("a wrong choice reveals the reasoning", REG["qa-1"].classList.contains("is-off"), false);
chk("and says so", REG["qn-1"].classList.contains("is-shown"), true);
chk("without claiming otherwise", REG["qy-1"].classList.contains("is-shown"), false);
chk("the wrong choice is marked wrong", REG["qo-1-0"].classList.contains("is-wrong"), true);
chk("and the right one is still pointed out",
    REG["qo-1-2"].classList.contains("is-right"), true);

// A question settles once. Clicking again must not rewrite the verdict.
REG["qo-1-2"].fire("click");
chk("answering again does not overwrite the first answer",
    REG["qn-1"].classList.contains("is-shown"), true);
chk("and does not add a second verdict",
    REG["qy-1"].classList.contains("is-shown"), false);

// The third question, answered right this time.
REG["qo-3-1"].fire("click");
chk("a right choice says right", REG["qy-3"].classList.contains("is-shown"), true);
chk("and marks nothing wrong", REG["qo-3-1"].classList.contains("is-wrong"), false);
chk("and still reveals the reasoning", REG["qa-3"].classList.contains("is-off"), false);

// Answering one question must not answer the others for the reader.
chk("question 2 is still waiting", REG["qa-2"].classList.contains("is-off"), true);

// This one contradicted Figure 14 until it was fixed: the chapter proves by
// compiling that a lone store is kept.
chk("the compiler answer no longer claims a lone store is deleted",
    REG["qa-3"].textContent.indexOf("delete a store nothing reads back"), -1);
chk("and says what actually happens to one",
    REG["qa-3"].textContent.indexOf("A lone store it keeps") > -1, true);

// A bare <div> has role=generic, which does not support naming, so an
// aria-label on one is either dropped or -- where it is exposed -- swallows the
// content it sits on. The roadmap carried one on nothing for three sections.

// Figure 17's fifth target does stop you, and is careful that this is not a
// permission check. The carry-forward line has to agree with it.
chk("the closing summary talks about permission, not about being stopped",
    REG["carry-tock"].textContent.indexOf("asks whether code is allowed") > -1, true);

// With scripting on, one row's reasoning is open and the rest are put away.
// With scripting off none of that runs, and every panel stays readable -- the
// same bargain the six questions make. Assert the scripted half; the other half
// is a render.
// Earlier assertions above have already clicked every row, so establish the
// state rather than assuming the one the page booted into.
REG["br-2"].fire("click");
(function () {
  var i, off = 0;
  for (i = 0; i < 7; i++) {
    if (REG["brp-" + i].classList.contains("is-off")) { off++; }
  }
  chk("the street table puts six of its seven panels away", off, 6);
  chk("and the seventh is the one whose verdict is pressed",
      REG["brp-2"].classList.contains("is-off"), false);
}());

// ---- prose that used to be a table ----
// Three passages set two or three things against each other in sentences. They
// are term/meaning grids now, so the parallel is seen rather than parsed.
// Asserted on text, not on children: the shim only tracks nodes a script
// appended, and every one of these grids is markup.

(function () {
  var t = REG["pairs-family"].textContent, i, names =
      ["gpio_out_set", "gpio_out_clr", "gpio_out_xor"], shown = 0;
  for (i = 0; i < 3; i++) { if (t.indexOf(names[i]) > -1) { shown++; } }
  // The prose used to cover set and then say "the other two"; the grid shows
  // the family, so the parallel between them is on screen.
  chk("the register family shows all three siblings", shown, 3);
}());
chk("and each is given the datasheet's operation",
    REG["pairs-family"].textContent.indexOf("GPIO_OUT ^= wdata") > -1, true);

chk("the notation key names all three pieces",
    REG["pairs-notation"].textContent.indexOf("wdata") > -1, true);

// The prose used to name poppl as the return and b .LBB8_1 as the hang, which
// the listing's own comments already say -- and it said "that first listing",
// which stops being true the moment a reader picks another case. The prose is
// gone, so those comments are now the only place either outcome is named.
(function () {
  var t = REG["case-wait"].textContent;
  chk("the wait listing names the branch that returns",
      t.indexOf("clear? return") > -1, true);
  chk("and the branch that spins",
      t.indexOf("set? spin for ever") > -1, true);
}());

chk("and it chooses the one that breaks expectations",
    REG["bhr-set"].textContent.indexOf("Not promised") > -1, true);

t("the step about to run is marked, and it moves with Step", function () {
  REG["tab-rmw"].fire("click");
  REG["race-reset"].fire("click");
  if (rsteps().length < 3) { throw new Error("no steps rendered"); }
  if (marked("is-next") !== "0") {
    throw new Error("first step not marked next: " + marked("is-next"));
  }
  REG["race-step"].fire("click");
  if (marked("done") !== "0") {
    throw new Error("first step not marked done: " + marked("done"));
  }
  if (marked("is-next") !== "1") {
    throw new Error("marker did not advance: " + marked("is-next"));
  }
});

t("exactly one step is ever marked next", function () {
  REG["tab-rmw"].fire("click");
  REG["race-reset"].fire("click");
  for (var press = 0; press < 4; press++) {
    if (marked("is-next").indexOf(",") > -1) {
      throw new Error("several steps marked next after " + press + " presses");
    }
    REG["race-step"].fire("click");
  }
});

t("no step carries the bare `next` token", function () {
  // `.next` is the end-of-chapter panel: 4rem margin, a rule, a 34rem
  // max-width and display:flex. A step wearing it renders as a narrow centred
  // box instead of a row, which is what shipped until this was caught.
  REG["tab-rmw"].fire("click");
  REG["race-reset"].fire("click");
  for (var press = 0; press < 3; press++) {
    var rows = rsteps(), i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].className.split(" ").indexOf("next") > -1) {
        throw new Error("step " + i + " collides with the .next panel");
      }
    }
    REG["race-step"].fire("click");
  }
});
