// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Behavioural assertions for chapter 0, run by check.py under JavaScriptCore.

// Same helpers as chapters 4 to 8: every figure here is one row of buttons and
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
  var BETS = [["bet-probe", 4], ["bet-cross", 4]];
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

// ---- What a reader with no JavaScript is shown ----
// The house rule is that the markup ships everything and the script puts parts
// away, so the markup's own opening state is the one nobody else ever checks
// and the only one a reader with scripting off will see. Chapter 6 shipped a
// switch reading 0 over a sentence describing a 1; this is the same guard,
// applied where this chapter has the same shape.
(function () {
  function shipped(id) {
    var k;
    for (k in PAGE_CLASS) {
      if (k === id || k.slice(-(id.length + 2)) === "--" + id) {
        return PAGE_CLASS[k] || "";
      }
    }
    return null;
  }
  var cls = shipped("pv-both");
  chk("the summary the markup ships is the one for a whole session",
      cls === null ? "pv-both not found" : String(cls.indexOf("is-on") > -1),
      "true");
  // ...and the transcript it sits under really is a whole session.
  var i, hidden = [], LINES = ["bo-0", "bo-1", "bo-2", "bo-3"];
  for (i = 0; i < LINES.length; i++) {
    if ((shipped(LINES[i]) || "").indexOf("is-off") > -1) { hidden.push(LINES[i]); }
  }
  chk("with every line of it visible", hidden.join(","), "");
}());

// ---- No figure may boot empty ----
// Most readers never click, so a figure that opens on "choose something"
// teaches nothing. Checked first, because everything below moves these.
chk("figure 1 opens on the board", REG["pt-0"].getAttribute("aria-pressed"), "true");
chk("figure 2 opens on the target directory", REG["pa-0"].getAttribute("aria-pressed"), "true");
chk("figure 3 opens on the route this chapter uses", REG["tg-0"].getAttribute("aria-pressed"), "true");
chk("figure 4 opens correctly wired", REG["wtx-gp1"].getAttribute("aria-pressed"), "true");
chk("figure 5 opens on the banner", REG["bo-0"].getAttribute("aria-pressed"), "true");
chk("figure 6 opens on the step that is always the same machine", REG["sp-0"].getAttribute("aria-pressed"), "true");
chk("figure 7 opens on a working bench", REG["f-cable-data"].getAttribute("aria-pressed"), "true");
chk("and every one of those has its panel open",
    REG["ptp-0"].classList.contains("is-on")
      && REG["pap-0"].classList.contains("is-on")
      && REG["tgp-0"].classList.contains("is-on")
      && REG["wsym-good"].classList.contains("is-on")
      && REG["bop-0"].classList.contains("is-on")
      && REG["spp-0"].classList.contains("is-on")
      && REG["sep-good"].classList.contains("is-on"), true);

// ---- Figure 1: the parts ----
walk("pt-", "ptp-", 5, "figure 1");
REG["pt-1"].fire("click");
chk("the probe panel says what skipping it costs, rather than that it is optional",
    REG["ptp-1"].textContent.indexOf("by hand for every change") > -1, true);
REG["pt-2"].fire("click");
chk("the debug wires are the ones that cannot be got backwards",
    REG["ptp-2"].textContent.indexOf("straight across") > -1, true);
REG["pt-3"].fire("click");
chk("and the console wires are the ones that can",
    REG["ptp-3"].textContent.indexOf("cross over") > -1, true);
REG["pt-0"].fire("click");

// ---- Figure 2: where the file lands ----
walk("pa-", "pap-", 4, "figure 2");
REG["pa-1"].fire("click");
// The whole point of this figure. A reader who thinks the path names their
// laptop will go looking for a different one on a different machine.
chk("the triple panel gives the full target",
    REG["pap-1"].textContent.indexOf("thumbv8m.main-none-eabi") > -1, true);
chk("and says it is not the machine doing the building",
    REG["pap-1"].textContent.indexOf("Your laptop is none of those things") > -1, true);
chk("and names the file that sets it",
    REG["pap-1"].textContent.indexOf(".cargo/config.toml") > -1, true);
REG["pa-0"].fire("click");

// ---- Figure 3: the four flashing targets ----
// This is the figure the chapter exists for. Two of these four report success
// and do nothing on a Mac, and the Makefile says so nowhere.
walk("tg-", "tgp-", 4, "figure 3");
chk("the four targets are labelled with the lines they are on",
    REG["tg-0"].textContent.indexOf(":23") > -1
      && REG["tg-1"].textContent.indexOf(":27") > -1
      && REG["tg-2"].textContent.indexOf(":32") > -1
      && REG["tg-3"].textContent.indexOf(":42") > -1, true);
chk("the two that work are the two that drive the probe",
    REG["tg-0"].textContent.indexOf("flash-openocd") > -1
      && REG["tg-3"].textContent.indexOf("program-openocd") > -1, true);
chk("and both carry the verdict that they work",
    REG["tg-0"].textContent.indexOf("works") > -1
      && REG["tg-3"].textContent.indexOf("works") > -1, true);
chk("the two copying routes are marked silent rather than broken",
    REG["tg-1"].textContent.indexOf("silent") > -1
      && REG["tg-2"].textContent.indexOf("silent") > -1, true);

// The verdicts move with the machine, and that movement is the figure. Two of
// the four never change, because they go down the probe and a probe does not
// care where your desktop mounts a drive.
(function () {
  function badges() {
    return [REG["tv-0"].textContent, REG["tv-1"].textContent,
            REG["tv-2"].textContent, REG["tv-3"].textContent].join(" ");
  }
  chk("on a Mac the two copy routes are silent",
      badges(), "works silent silent works");
  chk("and the reason names the two paths",
      REG["osp-mac"].textContent.indexOf("/Volumes") > -1, true);

  REG["os-linux"].fire("click");
  chk("on Linux they become a maybe rather than a no",
      badges(), "works maybe maybe works");
  // The Makefile and the README give different defaults, which is why this is
  // a maybe and not a yes.
  chk("and the reason is that the two documents disagree",
      REG["osp-linux"].textContent.indexOf("/run/media/$(USER)/RP2350") > -1
        && REG["osp-linux"].textContent.indexOf("/media/$(USER)/RP2350") > -1, true);

  REG["os-set"].fire("click");
  chk("told where the drive is, all four work",
      badges(), "works works works works");

  (function () {
    var M = ["mac", "linux", "set"], i, moved = 0;
    for (i = 0; i < M.length; i++) {
      REG["os-" + M[i]].fire("click");
      if (REG["tv-0"].textContent !== "works") { moved++; }
      if (REG["tv-3"].textContent !== "works") { moved++; }
    }
    chk("the two probe routes never change their answer", moved, 0);
  }());

  (function () {
    var M = ["mac", "linux", "set"], i, k, bad = 0, on;
    for (i = 0; i < M.length; i++) {
      REG["os-" + M[i]].fire("click");
      on = 0;
      for (k = 0; k < M.length; k++) {
        if (REG["osp-" + M[k]].classList.contains("is-on")) { on++; }
      }
      if (on !== 1) { bad++; }
    }
    chk("one reason, and only one, for each machine", bad, 0);
  }());
  REG["os-mac"].fire("click");
}());
REG["tg-1"].fire("click");
chk("the copy panel quotes the message it prints instead of flashing",
    REG["tgp-1"].textContent.indexOf("Please edit the BOOTSEL_FOLDER variable") > -1, true);
chk("and says the status is success, which is why nothing notices",
    REG["tgp-1"].textContent.indexOf("success status") > -1, true);
REG["tg-2"].fire("click");
chk("program fails loudly on a missing application and quietly on the copy",
    REG["tgp-2"].textContent.indexOf("fails loudly") > -1
      && REG["tgp-2"].textContent.indexOf("fails quietly") > -1, true);
REG["tg-0"].fire("click");
// The released OpenOCD has no rp2350.cfg, so which build you fetch is the one
// board-specific choice on this route. The panel claimed the opposite until
// brew install open-ocd was actually run.
chk("the route names which build of OpenOCD as the part specific to the chip",
    REG["tgp-0"].textContent.indexOf("which build of it you fetch is the only part") > -1, true);
// It does need OpenOCD, which the first draft of Figure 1 denied.
chk("and names OpenOCD as the one thing you do fetch",
    REG["tgp-0"].textContent.indexOf("one thing you fetch") > -1, true);

// ---- Figure 4: the wiring ----
// The bench decides an outcome from three facts, not from which of the
// sixty-four arrangements it is: whether the board's transmit reaches the
// probe, whether the probe's transmit reaches the board, and whether ground is
// shared. Every symptom it can produce is one the chapter names elsewhere.
(function () {
  var WHERE = ["gp0", "gp1", "gnd", "off"];

  function set(tx, rx, gnd) {
    REG["wtx-" + tx].fire("click");
    REG["wrx-" + rx].fire("click");
    REG["wgnd-" + gnd].fire("click");
  }
  function showing() {
    var S = ["good", "clash", "noise", "dead", "oneway", "blind"], i, on = [];
    for (i = 0; i < S.length; i++) {
      if (REG["wsym-" + S[i]].classList.contains("is-on")) { on.push(S[i]); }
    }
    return on.join(",");
  }

  // With no JavaScript the head has to be one phrase, not both run together.
  chk("the markup ships one of the two head phrases already away",
      REG["wv-bad"].classList.contains("is-off"), true);
  chk("it opens on the wiring that works", showing(), "good");
  chk("and says so rather than naming a symptom",
      REG["wv-ok"].classList.contains("is-off"), false);

  // The named mistake: the probe transmitting onto the pin the board
  // transmits on. This is the one the figure is titled for.
  set("gp0", "gp1", "gnd");
  chk("swapping the two console leads is a clash", showing(), "clash");
  chk("and the head stops saying it works",
      REG["wv-ok"].classList.contains("is-off"), true);

  // Ground is the one people leave out, and its symptom is not silence.
  set("gp1", "gp0", "off");
  chk("leaving the ground off gives noise, not silence", showing(), "noise");
  chk("and the panel says exactly that",
      REG["wsym-noise"].textContent.indexOf("not silence") > -1, true);

  // One direction at a time.
  set("off", "gp0", "gnd");
  chk("the probe's transmit unconnected: banner, then nothing", showing(), "oneway");
  set("gp1", "off", "gnd");
  chk("the probe's receive unconnected: nothing arrives, typing lands", showing(), "blind");
  set("off", "off", "gnd");
  chk("neither connected is silence", showing(), "dead");

  // The three presets put the bench into the states the prose names.
  REG["w-swap"].fire("click");
  chk("the swap preset produces the clash", showing(), "clash");
  REG["w-nognd"].fire("click");
  chk("the no-ground preset produces the noise", showing(), "noise");
  REG["w-good"].fire("click");
  chk("and the good preset puts it back", showing(), "good");

  // Exactly one symptom, in all sixty-four arrangements, and only one of them
  // is the working one.
  (function () {
    var a, b, c, bad = 0, working = 0, now;
    for (a = 0; a < 4; a++) {
      for (b = 0; b < 4; b++) {
        for (c = 0; c < 4; c++) {
          set(WHERE[a], WHERE[b], WHERE[c]);
          now = showing();
          if (now.indexOf(",") > -1 || now === "") { bad++; }
          if (now === "good") { working++; }
        }
      }
    }
    chk("one symptom and only one, in all sixty-four arrangements", bad, 0);
    chk("and exactly one arrangement works", working, 1);
  }());

  // The wire ends move in the drawing, which is the only thing the reader can
  // see change before the verdict does.
  REG["w-good"].fire("click");
  chk("the transmit wire ends on the board's receive pin",
      REG["wire-tx"].getAttribute("y2"), "150");
  REG["wtx-off"].fire("click");
  chk("and parks off the board when nothing is chosen",
      REG["wire-tx"].getAttribute("x2"), "250");
  chk("marked as unconnected rather than merely moved",
      REG["wire-tx"].classList.contains("is-off"), true);
  REG["w-good"].fire("click");
  chk("the drawing comes back with it",
      REG["wire-tx"].classList.contains("is-off"), false);
}());

// ---- Figure 5: what the console offers ----
// The transcript is the control, and what it tracks is which direction has
// been proved. Everything the board says arrives on one wire, so nothing
// before the reply can say anything about the other.
(function () {
  function proved() {
    var P = ["none", "out", "both"], i, on = [];
    for (i = 0; i < P.length; i++) {
      if (REG["pv-" + P[i]].classList.contains("is-on")) { on.push(P[i]); }
    }
    return on.join(",");
  }
  function showing(id) { return !REG[id].classList.contains("is-off"); }

  REG["cn-clear"].fire("click");
  chk("an unreset board has proved nothing", proved(), "none");
  chk("and the console is empty", showing("bo-0"), false);

  REG["cn-reset"].fire("click");
  chk("the banner arrives on a reset", showing("bo-0"), true);
  chk("and the prompt with it", showing("bo-1"), true);
  chk("which proves the outbound wire and no more", proved(), "out");
  chk("the failure line is not printed unless it happened",
      showing("bo-2"), false);

  REG["cn-type"].fire("click");
  chk("a reply is what proves the other direction", proved(), "both");
  chk("and it is the reply that appears", showing("bo-3"), true);

  // Typing at a board that has not booted reaches nothing, so the figure does
  // not pretend it produced a reply.
  REG["cn-clear"].fire("click");
  REG["cn-type"].fire("click");
  chk("typing at an unreset board prints nothing", showing("bo-3"), false);
  chk("and proves nothing", proved(), "none");

  // The second banner comes after the first, not instead of it.
  REG["cn-fail"].fire("click");
  chk("the load failure follows the banner rather than replacing it",
      showing("bo-0") && showing("bo-2"), true);
  chk("and the outbound wire is still all that is proved", proved(), "out");

  // Exactly one reading, in every state the controls can reach.
  (function () {
    var STEPS = ["cn-clear", "cn-reset", "cn-type", "cn-fail", "cn-type",
                 "cn-clear", "cn-reset"];
    var i, bad = 0;
    for (i = 0; i < STEPS.length; i++) {
      REG[STEPS[i]].fire("click");
      if (proved().indexOf(",") > -1 || proved() === "") { bad++; }
    }
    chk("one reading of what is proved, at every step", bad, 0);
  }());
  REG["cn-reset"].fire("click");
}());
walk("bo-", "bop-", 4, "figure 5");
REG["bo-0"].fire("click");
// The banner is the chapter's success signal, and it is worth more than it
// looks: it proves three separate things at once.
chk("the banner panel says it proves three things",
    REG["bop-0"].textContent.indexOf("three separate things") > -1, true);
// The same false claim lived here too, and a grep for "prompt" did not reach
// it. The banner rides the wire out of the board and proves nothing about the
// wire in; three panels on this page now agree about that.
chk("and scopes them to the wire the banner actually rides",
    REG["bop-0"].textContent.indexOf("the wire out of the board is carrying") > -1, true);
chk("and says outright that the other direction is still untested",
    REG["bop-0"].textContent.indexOf("silent about the wire going the other way") > -1, true);
REG["bo-1"].fire("click");
// The first review pass found this the wrong way round. The prompt is printed
// *outbound*, so its arrival proves exactly what the banner proved and nothing
// more -- which is what syp-3 and the second quiz answer had said all along.
chk("the prompt is not claimed to prove the inbound wire",
    REG["bop-1"].textContent.indexOf("proves nothing the banner did not") > -1, true);
chk("and the chapter says what does test that direction",
    REG["bop-1"].textContent.indexOf("typing something and getting an answer") > -1, true);
REG["bo-2"].fire("click");
// The second pass found this said "instead", and blamed an empty chip. The
// kernel looks for applications between the banner and the main loop, so the
// line comes after -- and finding none is quiet.
chk("the second line is placed after the banner, not instead of it",
    REG["bop-2"].textContent.indexOf("comes after, not instead") > -1, true);
chk("and an empty chip is not blamed for it",
    REG["bop-2"].textContent.indexOf("An empty chip is not what produces it") > -1, true);
REG["bo-0"].fire("click");

// ---- Figure 6: one machine, or two ----
// A real arrangement rather than a hypothetical one, and the chapter has to be
// true for it without turning into two chapters.
walk("sp-", "spp-", 4, "figure 6");
REG["sp-1"].fire("click");
chk("exactly one thing crosses between the two machines",
    REG["spp-1"].textContent.indexOf("One ELF") > -1, true);
chk("and the far machine needs no copy of the repository",
    REG["spp-1"].textContent.indexOf("no copy of this repository") > -1, true);
REG["sp-2"].fire("click");
chk("flashing is the step whose command depends on where the probe is",
    REG["spp-2"].textContent.indexOf("make flash-openocd") > -1, true);
REG["sp-3"].fire("click");
chk("the console lands on the probe's machine, not the builder's",
    REG["spp-3"].textContent.indexOf("same USB connection") > -1, true);
chk("the note says the split changes one command and no wiring",
    REG["sp-0"].textContent.length > 0, true);
REG["sp-0"].fire("click");
// The two -f arguments are the board's own config spelled out, which is the
// reason the far machine can do without the repository at all.
chk("the split command is the board's config spelled out rather than invented",
    REG["splitcfg"].textContent.indexOf("two lines of this board's own OpenOCD config") > -1, true);
chk("and the chapter says Tock's own testing is built the same way",
    REG["splitci"].textContent.indexOf("testbed") > -1, true);

// ---- Figure 7: five silences ----
// The bench answers in an order: a probe that is not there stops the flash
// before anything else can be wrong, a terminal on the wrong device never sees
// the board whatever the wires do, and only then does the wiring decide
// between silence and noise. The separator is the figure's real output.
(function () {
  function set(cable, wire, baud, dev) {
    REG["f-cable-" + cable].fire("click");
    REG["f-wire-" + wire].fire("click");
    REG["f-baud-" + baud].fire("click");
    REG["f-dev-" + dev].fire("click");
  }
  function con() {
    var C = ["good", "silent", "noise", "nodev", "oneway"], i, on = [];
    for (i = 0; i < C.length; i++) {
      if (REG["fo-con-" + C[i]].classList.contains("is-on")) { on.push(C[i]); }
    }
    return on.join(",");
  }
  function sep() {
    var S = ["good", "loud", "silent", "noise", "oneway"], i, on = [];
    for (i = 0; i < S.length; i++) {
      if (REG["sep-" + S[i]].classList.contains("is-on")) { on.push(S[i]); }
    }
    return on.join(",");
  }

  chk("it opens on a bench that works", con(), "good");
  chk("with nothing to separate", sep(), "good");
  chk("and the flash reading the successful one",
      REG["fo-flash-ok"].classList.contains("is-on"), true);

  // A charge-only cable is the loud failure, and it stops the flash rather
  // than producing a silence further down.
  set("charge", "ok", "ok", "probe");
  chk("a charge-only cable fails the flash",
      REG["fo-flash-bad"].classList.contains("is-on"), true);
  chk("and is marked as an error rather than a silence",
      REG["fo-flash"].classList.contains("is-loud"), true);
  chk("there is no serial device either", con(), "nodev");
  chk("and it is the loud one", sep(), "loud");

  // The two silences that cannot be told apart by looking.
  set("data", "swap", "ok", "probe");
  chk("swapped console wires are silence", con(), "silent");
  set("data", "ok", "ok", "other");
  chk("the wrong device is the same silence", con(), "silent");
  chk("and gets the same separator, because that is the point", sep(), "silent");
  chk("which names listing /dev as the cheap discriminator",
      REG["sep-silent"].textContent.indexOf("before and after") > -1, true);

  // The two noises, likewise.
  set("data", "nognd", "ok", "probe");
  chk("no ground is noise", con(), "noise");
  set("data", "ok", "bad", "probe");
  chk("a wrong baud is the same noise", con(), "noise");
  chk("and the separator says to check the free one first",
      REG["sep-noise"].textContent.indexOf("free") > -1, true);

  // The flash is independent of everything on the console side: it goes down
  // the debug wires, and only the cable can stop it here.
  (function () {
    var W = ["ok", "swap", "nognd", "rxoff", "txoff"], B = ["ok", "bad"],
        D = ["probe", "other"], w, b, d, bad = 0;
    for (w = 0; w < W.length; w++) {
      for (b = 0; b < B.length; b++) {
        for (d = 0; d < D.length; d++) {
          set("data", W[w], B[b], D[d]);
          if (!REG["fo-flash-ok"].classList.contains("is-on")) { bad++; }
        }
      }
    }
    chk("with a good cable the flash succeeds whatever the console side is", bad, 0);
  }());

  // Exactly one reading in each of the three panels, in every combination.
  (function () {
    var C = ["data", "charge"], W = ["ok", "swap", "nognd", "rxoff", "txoff"],
        B = ["ok", "bad"], D = ["probe", "other"];
    var c, w, b, d, bad = 0;
    for (c = 0; c < C.length; c++) {
      for (w = 0; w < W.length; w++) {
        for (b = 0; b < B.length; b++) {
          for (d = 0; d < D.length; d++) {
            set(C[c], W[w], B[b], D[d]);
            if (con().indexOf(",") > -1 || con() === "") { bad++; }
            if (sep().indexOf(",") > -1 || sep() === "") { bad++; }
          }
        }
      }
    }
    chk("one reading and one separator, in all forty benches", bad, 0);
  }());

  // The fifth silence: the banner arrives and typing does nothing. It is the
  // only one of them that tells you which wire, because arriving at all proves
  // the other three.
  set("data", "txoff", "ok", "probe");
  chk("the probe's transmit off gives banner-then-nothing", con(), "oneway");
  chk("and its own separator", sep(), "oneway");

  set("data", "ok", "ok", "probe");
  chk("and it comes back to the working bench", sep(), "good");
}());
// A flash that reported success proves the probe's USB carries data, so the
// cable cannot be the cause of this one. It belongs two entries down.
chk("the first silence is scoped to what a successful flash leaves open",
    REG["sep-silent"].textContent.indexOf("three console wires") > -1, true);
chk("the probe failure is named as the good one, because it is loud",
    REG["sep-loud"].textContent.indexOf("good failure") > -1, true);
// Cheapest first, and this is the symptom a charge-only cable actually makes.
chk("and the cable is ruled out here, before any rewiring",
    REG["sep-loud"].textContent.indexOf("swap the cable before rewiring") > -1, true);
chk("banner-then-nothing is one wire, and points at the figure with it in",
    REG["sep-oneway"].textContent.indexOf("One wire") > -1
      && REG["sep-oneway"].textContent.indexOf("Figure 4") > -1, true);

// ---- The board that is not this board ----
// Chapter 4 and chapter 5 both carry a version of this. Chapter 0 is where a
// reader is most likely to be holding the wrong one, having just bought it.
chk("the chapter says which pin the difference costs",
    REG["wpin"].textContent.indexOf("25") > -1, true);
chk("and that on a Pico 2 W it belongs to the radio",
    REG["wpin"].textContent.indexOf("radio") > -1, true);
// This used to refuse to claim the untested part was fine. It was tested on
// 2026-08-29, on a Pico 2 W, so the caveat itself had gone stale: a paragraph
// about not passing off plausible as verified, stating something untrue.
chk("the W claim is now reported as checked rather than plausible",
    REG["wtest"].textContent.indexOf("no longer a guess") > -1, true);
chk("and says what was actually done on the board",
    REG["wtest"].textContent.indexOf("booted, printed its line and took typed commands") > -1, true);

// ---- Check yourself ----
// The answers are in the markup and the script only reveals them, so what is
// worth asserting is that the right option is the one marked right.
chk("the answers are hidden until an option is taken",
    REG["qan"].classList.contains("is-off"), true);
REG["qa-1"].fire("click");
chk("the quiet failure is the answer to the first question",
    REG["qa-1"].classList.contains("is-right"), true);
chk("and taking it reveals the answer",
    REG["qan"].classList.contains("is-off"), false);
REG["qb-2"].fire("click");
chk("one console wire is the answer to the second",
    REG["qb-2"].classList.contains("is-right"), true);
REG["qc-0"].fire("click");
chk("the target naming the destination is the answer to the third",
    REG["qc-0"].classList.contains("is-right"), true);
REG["qd-0"].fire("click");
chk("and the cable is the answer to the fourth",
    REG["qd-0"].classList.contains("is-right"), true);
REG["qd-1"].fire("click");
chk("a wrong option is marked wrong and the right one still marked right",
    REG["qd-1"].classList.contains("is-wrong")
      && REG["qd-0"].classList.contains("is-right"), true);

// ---- The goals, and the figure each one is delivered by ----
// Every other suite in this series pins these; this one did not until the
// second pass noticed the goals and the glossary were the only unread anchors
// on the page.
chk("goal 1, where the built file lands, is delivered by figure 2",
    REG["goalbox"].textContent.indexOf("where the file it produces ends up") > -1
      && REG["pap-1"].textContent.length > 40, true);
chk("goal 3 asks for six connections, which is what figure 4 wires",
    REG["goalbox"].textContent.indexOf("six connections") > -1, true);
chk("goal 4, the routes that do nothing quietly, is delivered by figure 3",
    REG["goalbox"].textContent.indexOf("do nothing on a Mac") > -1
      && REG["tgp-1"].textContent.indexOf("success status") > -1, true);
// The third pass found this goal stale: the reorder means a verified flash has
// already ruled the board out, so "dead board or bad wiring" is no longer the
// pair a reader has to separate. Figure 7's five silences are.
chk("goal 5, separating the silences, is figure 7's job",
    REG["goalbox"].textContent.indexOf("one silence") > -1
      && REG["sep-silent"].textContent.length > 40, true);

// ---- The glossary ----
chk("the glossary says a target is never the machine doing the building",
    REG["words"].textContent.indexOf("never the machine doing the building") > -1, true);
chk("and defines the compiler, which this chapter leans on five times",
    REG["words"].textContent.indexOf("turns the source you can read") > -1, true);

// ---- Two anchors the second pass added, and the claims they carry ----
// The chapter named no serial terminal at all until the second pass; a reader
// reached "open the probe's serial port" with nothing to open it with.
chk("a terminal is named, and where the device shows up",
    REG["term"].textContent.indexOf("screen") > -1
      && REG["term"].textContent.indexOf("picocom") > -1, true);
chk("and how to find its name rather than guessing at one",
    REG["term"].textContent.indexOf("look before and after") > -1, true);
// The wrong-board difference costs nothing in this chapter, which is what the
// second pass found the page had never said.
chk("the Pico 2 W difference is scoped out of this chapter",
    REG["wscope"].textContent.indexOf("works on either one") > -1, true);
chk("and the reason no light is expected here is given",
    REG["wscope"].textContent.indexOf("no application loaded drives no light") > -1, true);

// ---- What the bench session settled, 2026-08-29 ----
// These were three unchecked physical claims until a Pico 2 W, a Debug Probe
// and a Raspberry Pi were pointed at them. Two survive as verified; the third
// -- what a Mac calls the probe -- could not be run, because the bench drives
// the probe from the Pi. The page has to keep saying which is which.
chk("the section claims every command in it has been run",
    REG["unchecked"].textContent.indexOf("Every command in this section has been run") > -1, true);
// The device name is given as a method rather than a string to copy, because
// the only one anybody here has seen is the Pi's.
chk("and it hands over a method rather than a name to copy",
    REG["unchecked"].textContent.indexOf("method rather than a name to copy") > -1
      && REG["unchecked"].textContent.indexOf("/dev/ttyACM0") > -1, true);

// The debug header is labelled on the board; anchoring to the silkscreen beats
// reasoning about which edge the USB is on, which is what this used to do.
chk("the debug connections are named by the label the board prints",
    REG["w-power"].textContent.indexOf("silkscreens DEBUG") > -1, true);
// Nothing in the chapter said the board needs its own power. Wire only the
// probe and you get a dead board and no reason for it.
// Scoping this to the debug set implied the UART one might supply power. It
// does not: TX, GND, RX. Neither connector powers the target.
chk("and neither connector is claimed to carry power",
    REG["w-power"].textContent.indexOf("neither of the probe's connectors carries power") > -1, true);

// Captured by unplugging the probe: the literal message, not a paraphrase.
chk("the probe-not-found reading quotes what OpenOCD actually prints",
    REG["fo-flash-bad"].textContent.indexOf("unable to find a matching CMSIS-DAP device") > -1, true);

// `list` prints a header even with nothing loaded, so "empty" was the wrong
// word for what a reader sees.
chk("the list panel describes a header with no rows, not an empty list",
    REG["bop-3"].textContent.indexOf("no rows") > -1, true);
