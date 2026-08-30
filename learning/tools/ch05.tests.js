// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Behavioural assertions for chapter 5, run by check.py under JavaScriptCore.

// Same helpers as chapters 3 and 4: every figure here is one row of buttons and
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

// ---- No figure may boot empty ----
// Most readers never click, so a figure that opens on "choose something"
// teaches nothing. Checked first, because everything below moves these.
chk("figure 1 opens on when the check happens", REG["ck-0"].getAttribute("aria-pressed"), "true");
chk("figure 2 opens on the base field", REG["rf-0"].getAttribute("aria-pressed"), "true");
chk("figure 3 opens on a verb rather than on nothing", REG["vb-0"].getAttribute("aria-pressed"), "true");
chk("figure 4 opens on the first permission", REG["pm-0"].getAttribute("aria-pressed"), "true");
chk("figure 5 opens on region 0", REG["rn-0"].getAttribute("aria-pressed"), "true");
chk("figure 6 opens on this board's chip", REG["tc-0"].getAttribute("aria-pressed"), "true");
chk("figure 7 opens on the refused store", REG["fl-0"].getAttribute("aria-pressed"), "true");
chk("figure 8 opens on the enable bit", REG["cb-0"].getAttribute("aria-pressed"), "true");
chk("figure 9 opens on the kernel", REG["nt-0"].getAttribute("aria-pressed"), "true");
chk("and every one of those has its panel open",
    REG["ckp-0"].classList.contains("is-on")
      && REG["rfp-0"].classList.contains("is-on")
      && REG["vdp-0"].classList.contains("is-on")
      && REG["pmp-0"].classList.contains("is-on")
      && REG["rnp-0"].classList.contains("is-on")
      && REG["tcp-0"].classList.contains("is-on")
      && REG["flp-0"].classList.contains("is-on")
      && REG["cbp-0"].classList.contains("is-on")
      && REG["ntp-0"].classList.contains("is-on"), true);

// ---- Figure 1: what the unit is asked ----
// The one gesture the chapter turns on: nothing about the access changes, and
// the answer does.
(function () {
  chk("it opens with a process making the store", REG["ac-who"].textContent, "a process");
  chk("and the store refused", REG["f1-no"].classList.contains("is-off"), false);
  chk("with the out-of-range reason", REG["f1p-0"].classList.contains("is-off"), false);

  REG["who-kern"].fire("click");
  chk("the same store by the kernel is allowed",
      REG["f1-yes"].classList.contains("is-off"), false);
  chk("and refused is put away", REG["f1-no"].classList.contains("is-off"), true);
  chk("the who row is the only thing that moved", REG["ac-who"].textContent, "the kernel");
  chk("and the reason names the map privileged code keeps",
      REG["f1p-1"].textContent.indexOf("default memory map") > -1, true);
  chk("the panel is marked allowed",
      REG["f1-verdict"].classList.contains("is-allowed"), true);

  REG["who-proc"].fire("click");
  chk("and back again it is refused", REG["f1-no"].classList.contains("is-off"), false);
  chk("with the panel marked refused",
      REG["f1-verdict"].classList.contains("is-refused"), true);

  // Never both, never neither, however many times it is flipped.
  (function () {
    var i, bad = 0;
    for (i = 0; i < 6; i++) {
      REG[i % 2 ? "who-proc" : "who-kern"].fire("click");
      if (REG["f1-yes"].classList.contains("is-off")
          === REG["f1-no"].classList.contains("is-off")) { bad++; }
      if (REG["f1p-0"].classList.contains("is-off")
          === REG["f1p-1"].classList.contains("is-off")) { bad++; }
    }
    chk("exactly one verdict and one reason on every flip", bad, 0);
  }());
  REG["who-proc"].fire("click");
}());
walk("ck-", "ckp-", 5, "figure 1");
REG["ck-1"].fire("click");
chk("the second panel says which mode is being checked",
    REG["ckp-1"].textContent.indexOf("unprivileged") > -1, true);
chk("and hands the reader to the figure with that line in it",
    REG["ckp-1"].textContent.indexOf("Figure 8") > -1, true);
REG["ck-4"].fire("click");
// The whole chapter rests on this one. If the unit saw values, everything
// above could be a different mechanism; because it sees only addresses, every
// guarantee in the series is a guarantee about addresses.
chk("the last panel says the value is what it never sees",
    REG["ckp-4"].textContent.indexOf("The value.") > -1, true);
chk("and says what that costs, in the note",
    REG["ck-0"].textContent.length > 0
      && document.getElementById("ckp-4").textContent.indexOf("only where") > -1, true);
REG["ck-0"].fire("click");

// ---- Figure 2: the register builder ----
// The figure computes RBAR and RLAR from a base, a size and a permission, so
// what is worth checking is the arithmetic itself against mpu_v8m.rs rather
// than which paragraph is open. Every expected value below was derived by
// hand from the source formulas:
//   RBAR = BASE(start >> 5) | SH(0) | AP | XN
//   RLAR = LIMIT((end - 1) >> 5) | PXN(1) | ATTRINDX(0) | ENABLE(1)
walk("rf-", "rfp-", 8, "figure 2");

// The permission the markup opens on is what a process's RAM gets.
chk("it opens on the pair a process's RAM is given",
    REG["rb-hex"].textContent + " " + REG["rl-hex"].textContent,
    "0x20008003 0x200087F1");
chk("and the access field reads read-write", REG["rb-ap"].textContent, "01");
// The chapter's second goal is reading a region back out of the pair, so the
// figure has to do that arithmetic in the other direction too.
chk("the pair decodes back to the addresses it was built from",
    REG["rb-decode"].textContent + " " + REG["rl-decode"].textContent,
    "0x20008000 0x200087FF");
chk("with execute-never set", REG["rb-xn"].textContent, "1");

// The four permissions, each against the AP and XN the source maps it to.
(function () {
  var WANT = [
    ["0", "01", "0"],   // ReadWriteExecute: AP ReadWrite, XN Enable
    ["1", "01", "1"],   // ReadWriteOnly
    ["2", "11", "0"],   // ReadExecuteOnly
    ["3", "11", "1"]    // ReadOnly
  ];
  var i;
  for (i = 0; i < WANT.length; i++) {
    REG["bp-" + WANT[i][0]].fire("click");
    chk("permission " + WANT[i][0] + " sets AP", REG["rb-ap"].textContent, WANT[i][1]);
    chk("permission " + WANT[i][0] + " sets XN", REG["rb-xn"].textContent, WANT[i][2]);
  }
}());

// Only two bits of the sixty-four move. That is the note's claim, so it is
// checked rather than asserted.
(function () {
  REG["bp-1"].fire("click");
  var before = REG["rl-hex"].textContent + REG["rb-base"].textContent
             + REG["rl-pxn"].textContent + REG["rl-idx"].textContent
             + REG["rl-en"].textContent + REG["rb-sh"].textContent;
  REG["bp-2"].fire("click");
  var after = REG["rl-hex"].textContent + REG["rb-base"].textContent
            + REG["rl-pxn"].textContent + REG["rl-idx"].textContent
            + REG["rl-en"].textContent + REG["rb-sh"].textContent;
  chk("changing the permission moves nothing but AP and XN", before, after);
}());

// The size slider moves the limit and never the base.
(function () {
  REG["bp-1"].fire("click");
  var base = REG["rb-hex"].textContent, i, moved = 0;
  var SIZES = [1, 2, 17, 64, 100, 128];
  var WANT = ["0x2000801F", "0x2000803F", "0x2000821F", "0x200087FF",
              "0x20008C7F", "0x20008FFF"];
  for (i = 0; i < SIZES.length; i++) {
    REG["bench-size"].value = SIZES[i];
    REG["bench-size"].fire("input");
    chk("size " + SIZES[i] + " units reads " + (SIZES[i] * 32) + " bytes",
        REG["bench-size-badge"].textContent, (SIZES[i] * 32) + " bytes");
    // RLAR carries the inclusive last address plus the constant 0x11.
    chk("and its limit is the last byte in, not the byte after",
        REG["rl-hex"].textContent,
        "0x" + (((parseInt(WANT[i].slice(2), 16) & ~31) | 0x11) >>> 0)
                 .toString(16).toUpperCase());
    if (REG["rb-hex"].textContent !== base) { moved++; }
  }
  chk("the base never moved across any of them", moved, 0);
}());

// A one-unit region: the smallest the hardware can describe, and the case
// where the limit lands in the same 32-byte unit as the base.
REG["bench-size"].value = 1;
REG["bench-size"].fire("input");
chk("the smallest region starts and ends in one unit",
    REG["rb-base"].textContent, REG["rl-limit"].textContent);
chk("and decodes back to a 32-byte range",
    REG["rb-decode"].textContent + " " + REG["rl-decode"].textContent + " "
      + REG["rg-decode"].textContent,
    "0x20008000 0x2000801F 32 bytes");
chk("and is 32 bytes", REG["bench-size-badge"].textContent, "32 bytes");

// The constants Tock never varies stay put through everything above.
chk("shareability is left at zero", REG["rb-sh"].textContent, "0");
chk("the attribute index is left at slot 0", REG["rl-idx"].textContent, "0");
chk("privileged-execute-never is always set", REG["rl-pxn"].textContent, "1");
chk("and the region is always enabled", REG["rl-en"].textContent, "1");

// The panels still carry the source's own wording.
REG["rf-0"].fire("click");
chk("the base panel gives the shift the kernel writes",
    REG["rfp-0"].textContent.indexOf("logical_start >> 5") > -1, true);
REG["rf-2"].fire("click");
chk("the execute panel warns that the value names read backwards",
    REG["rfp-2"].textContent.indexOf("XN::Disable") > -1, true);
REG["rf-3"].fire("click");
chk("the limit panel gives the other shift, minus one",
    REG["rfp-3"].textContent.indexOf("(logical_end - 1) >> 5") > -1, true);
REG["rf-4"].fire("click");
chk("PXN's panel says where the spare 0x10 comes from",
    REG["rfp-4"].textContent.indexOf("0x10") > -1, true);
REG["rf-5"].fire("click");
chk("shareability has a row of its own rather than a mention elsewhere",
    REG["rfp-5"].textContent.length > 0, true);
REG["bench-size"].value = 64;
REG["bench-size"].fire("input");
REG["bp-1"].fire("click");
REG["rf-0"].fire("click");

// ---- Figure 3: growth, and the edge ----
// align32 rounds the end up and never down, so the granted size is always the
// next multiple of 32 at or above what was asked for, and the difference is
// memory the process did not request and is never told about.
(function () {
  var CASES = [
    [1, 32, 31], [31, 32, 1], [32, 32, 0], [33, 64, 31],
    [2048, 2048, 0], [2049, 2080, 31], [4095, 4096, 1], [4096, 4096, 0]
  ];
  var i;
  for (i = 0; i < CASES.length; i++) {
    REG["brk"].value = CASES[i][0];
    REG["brk"].fire("input");
    chk("asking for " + CASES[i][0] + " bytes grants " + CASES[i][1],
        REG["ro-grant"].textContent, CASES[i][1] + " bytes");
    chk("and hands over " + CASES[i][2] + " unasked",
        REG["ro-waste"].textContent, CASES[i][2] + " bytes");
  }
}());

// The rounding never goes the other way: granted is never below asked.
(function () {
  var i, short_by = 0;
  for (i = 1; i <= 4096; i += 7) {
    REG["brk"].value = i;
    REG["brk"].fire("input");
    if (parseInt(REG["ro-grant"].textContent, 10) < i) { short_by++; }
  }
  chk("no request anywhere in range is answered with less than it asked for",
      short_by, 0);
}());

// The last address inside, and the register that carries it.
REG["brk"].value = 2049;
REG["brk"].fire("input");
chk("the last address inside is one below the end",
    REG["ro-last"].textContent, "0x2000881F");
chk("and RLAR holds that address masked, plus PXN and enable",
    REG["ro-rlar"].textContent, "0x20008811");

// The verdict. Outside beats the verb, and the edge is where it turns over.
(function () {
  // 2080 bytes granted from 0x20008000, so the last address in is 0x2000881F.
  // The probe slider counts from 0x20007FC0, so that address is 64 + 2079.
  var LAST = 64 + 2079;
  REG["vb-0"].fire("click");

  // The head ships with one word already hidden, so a reader with no
  // JavaScript sees "Allowed" alone rather than both run together.
  chk("the markup opens with only one of the two verdict words showing",
      REG["vd-no"].classList.contains("is-off"), true);

  REG["probe"].value = LAST;
  REG["probe"].fire("input");
  chk("the last byte inside is allowed", REG["vd-yes"].classList.contains("is-off"), false);
  chk("and the reason given is the one for a read inside",
      REG["vdp-0"].classList.contains("is-on"), true);

  REG["probe"].value = LAST + 1;
  REG["probe"].fire("input");
  chk("one byte further is refused", REG["vd-no"].classList.contains("is-off"), false);
  chk("and the reason given is that it is past the limit",
      REG["vdp-4"].classList.contains("is-on"), true);

  REG["probe"].value = 63;
  REG["probe"].fire("input");
  chk("one byte below the base is refused too",
      REG["vd-no"].classList.contains("is-off"), false);
  chk("and names the other edge",
      REG["vdp-3"].classList.contains("is-on"), true);

  REG["probe"].value = 64;
  REG["probe"].fire("input");
  chk("the base itself is inside", REG["vd-yes"].classList.contains("is-off"), false);

  // Execute is the verb a process's RAM refuses, and it refuses it inside the
  // region -- which is the whole point of the execute-never bit.
  REG["vb-2"].fire("click");
  chk("executing inside the region is refused",
      REG["vd-no"].classList.contains("is-off"), false);
  chk("for the execute-never reason, not an out-of-range one",
      REG["vdp-2"].classList.contains("is-on"), true);
  REG["vb-1"].fire("click");
  chk("but writing there is allowed", REG["vd-yes"].classList.contains("is-off"), false);

  // An address outside is refused whatever verb is pressed.
  (function () {
    var v, allowed = 0;
    for (v = 0; v < 3; v++) {
      REG["vb-" + v].fire("click");
      REG["probe"].value = 0;
      REG["probe"].fire("input");
      if (!REG["vd-yes"].classList.contains("is-off")) { allowed++; }
    }
    chk("no verb is allowed at an address outside every region", allowed, 0);
  }());
  REG["vb-0"].fire("click");
  REG["probe"].value = 64;
  REG["probe"].fire("input");
}());

// Exactly one answer shows at a time, at every probe position tried.
(function () {
  var i, k, bad = 0, shown;
  for (i = 0; i <= 4224; i += 97) {
    REG["probe"].value = i;
    REG["probe"].fire("input");
    shown = 0;
    for (k = 0; k < 5; k++) {
      if (REG["vdp-" + k].classList.contains("is-on")) { shown++; }
    }
    if (shown !== 1) { bad++; }
  }
  chk("one reason, and only one, at every position", bad, 0);
}());

// The head never says both things at once.
(function () {
  var i, bad = 0;
  for (i = 0; i <= 4224; i += 211) {
    REG["probe"].value = i;
    REG["probe"].fire("input");
    if (REG["vd-yes"].classList.contains("is-off")
        === REG["vd-no"].classList.contains("is-off")) { bad++; }
  }
  chk("allowed and refused are never both showing, or both hidden", bad, 0);
}());
REG["brk"].value = 2049;
REG["brk"].fire("input");
REG["probe"].value = 64;
REG["probe"].fire("input");

// ---- Figure 4: the five permission names ----
walk("pm-", "pmp-", 5, "figure 4");
REG["pm-2"].fire("click");
chk("read-execute is named as what flash gets",
    REG["pmp-2"].textContent.indexOf("flash") > -1, true);
REG["pm-1"].fire("click");
chk("and read-write as what RAM gets",
    REG["pmp-1"].textContent.indexOf("RAM") > -1, true);
REG["pm-4"].fire("click");
// The odd one. It is the only variant whose name does not describe what
// unprivileged code can do with it, and saying so is the point of including it.
chk("execute-only is explained as run but not read",
    REG["pmp-4"].textContent.indexOf("may not read them back") > -1, true);
REG["pm-0"].fire("click");

// ---- Figure 5: where the eight regions go ----
// The rack hands out six and then refuses, and never offers region 0 however
// many times it is asked. Both of those are the figure's whole claim.
(function () {
  var i;
  chk("the rack starts with nothing handed out", REG["rk-count"].textContent, "0");
  chk("and opens saying two are already gone",
      REG["rk-0"].classList.contains("is-off"), false);

  for (i = 1; i <= 6; i++) {
    REG["rk-ask"].fire("click");
    chk("request " + i + " is granted", REG["rk-count"].textContent, String(i));
    chk("and the answer says so", REG["rk-1"].classList.contains("is-off"), false);
  }

  // The seventh, and every one after it.
  for (i = 0; i < 3; i++) {
    REG["rk-ask"].fire("click");
    chk("the request after the sixth is refused",
        REG["rk-2"].classList.contains("is-off"), false);
    chk("and the count does not creep past six", REG["rk-count"].textContent, "6");
  }

  // Region 0 and region 1 are never in the pool.
  chk("region 0 is never handed out",
      REG["rs-0"].classList.contains("is-taken"), false);
  chk("nor is region 1, which flash already took",
      REG["rs-1"].classList.contains("is-taken"), false);
  chk("and all six of the rest are",
      REG["rs-2"].classList.contains("is-taken")
        && REG["rs-3"].classList.contains("is-taken")
        && REG["rs-4"].classList.contains("is-taken")
        && REG["rs-5"].classList.contains("is-taken")
        && REG["rs-6"].classList.contains("is-taken")
        && REG["rs-7"].classList.contains("is-taken"), true);
  chk("the last slot reads as given rather than free",
      REG["rw-7"].textContent, "given");

  REG["rk-reset"].fire("click");
  chk("starting over empties the rack", REG["rk-count"].textContent, "0");
  chk("and the slots read free again", REG["rw-2"].textContent, "free");
  chk("and none of them is still marked taken",
      REG["rs-2"].classList.contains("is-taken"), false);
}());
walk("rn-", "rnp-", 4, "figure 5");
REG["rn-0"].fire("click");
chk("region 0 is named as reserved by a constant",
    REG["rnp-0"].textContent.indexOf("APP_MEMORY_REGION_MAX_NUM") > -1, true);
REG["rn-3"].fire("click");
// Two independent limits produce the same six. Nothing in the source ties them
// together, which is the observation worth pinning.
chk("the seventh request explains both limits",
    REG["rnp-3"].textContent.indexOf("nothing in the source makes them agree") > -1, true);
REG["rn-0"].fire("click");

// ---- Figure 6: two chips ----
chk("the two chips are the only two cards",
    onlyOne("tc-", 2, "is-on"), 1);
// The two size rules, computed rather than described. Each expected value is
// the rule applied by hand: the newer unit rounds up to 32; the older one needs
// a power-of-two region of at least 256 bytes, aligned to its own size, and
// steps in eighths of it.
(function () {
  var CASES = [
    // asked,  M33 space, M33 step, M0+ space, M0+ gets, M0+ step
    [   32,       32,  32,    256,    32,   32],
    [  100,      128,  32,    256,   128,   32],
    [ 2048,     2048,  32,   2048,  2048,  256],
    [ 2049,     2080,  32,   4096,  2560,  512],
    [ 3072,     3072,  32,   4096,  3072,  512],
    [ 8192,     8192,  32,   8192,  8192, 1024]
  ];
  var i, c;
  for (i = 0; i < CASES.length; i++) {
    c = CASES[i];
    REG["cmp"].value = c[0];
    REG["cmp"].fire("input");
    chk(c[0] + ": the newer unit takes " + c[1],
        REG["cmp-a8"].textContent, c[1] + " bytes");
    chk(c[0] + ": and steps by " + c[2],
        REG["cmp-s8"].textContent, c[2] + " bytes");
    chk(c[0] + ": the older unit takes " + c[3],
        REG["cmp-a7"].textContent, c[3] + " bytes");
    chk(c[0] + ": and hands over " + c[4],
        REG["cmp-g7"].textContent, c[4] + " bytes");
    chk(c[0] + ": stepping by " + c[5],
        REG["cmp-s7"].textContent, c[5] + " bytes");
    // The older unit must start on a multiple of its whole region.
    chk(c[0] + ": aligned to its own size",
        REG["cmp-l7"].textContent, c[3] + " bytes");
    chk(c[0] + ": while the newer one starts anywhere on 32",
        REG["cmp-l8"].textContent, "32 bytes");
  }
}());

// The older unit never does better than the newer one on any of the three
// numbers that matter. That is the figure's claim, so it is swept rather than
// asserted at one point.
(function () {
  var i, better = 0, a8, a7, s8, s7;
  for (i = 32; i <= 8192; i += 97) {
    REG["cmp"].value = i;
    REG["cmp"].fire("input");
    a8 = parseInt(REG["cmp-a8"].textContent, 10);
    a7 = parseInt(REG["cmp-a7"].textContent, 10);
    s8 = parseInt(REG["cmp-s8"].textContent, 10);
    s7 = parseInt(REG["cmp-s7"].textContent, 10);
    if (a7 < a8 || s7 < s8) { better++; }
  }
  chk("the older unit is never tighter, at any size in range", better, 0);
}());
REG["cmp"].value = 3072;
REG["cmp"].fire("input");
walk("tc-", "tcp-", 2, "figure 6");
REG["tc-1"].fire("click");
chk("the older chip's panel names the constraint",
    REG["tcp-1"].textContent.indexOf("power of two") > -1, true);
chk("and says what it does when the size is not one",
    REG["tcp-1"].textContent.indexOf("subregions") > -1, true);
REG["tc-0"].fire("click");

// ---- Figure 7: the fault path ----
// The four readings are the figure now, so they are what is worth asserting.
// MMFAR and the flag both turn over at step 5, which is the moment the fault
// stops being something only the hardware knows about.
(function () {
  var i;
  chk("it opens on step 1 of 6", REG["fl-at"].textContent, "1");
  chk("with the process still running", REG["mx-who"].textContent, "the process");
  chk("unprivileged", REG["mx-mode"].textContent, "unprivileged");
  chk("nothing recorded yet", REG["mx-mmfar"].textContent, "nothing yet");
  chk("and the flag clear", REG["mx-flag"].textContent, "clear");
  chk("back is disabled at the start", REG["fl-prev"].disabled, true);

  // Walk it forward and watch for the turnover.
  REG["fl-next"].fire("click");
  REG["fl-next"].fire("click");
  chk("step 3 is still the process's own fault to have", REG["fl-at"].textContent, "3");
  chk("and nothing has been recorded", REG["mx-mmfar"].textContent, "nothing yet");

  REG["fl-next"].fire("click");
  chk("step 4 is where the handler is running", REG["mx-who"].textContent,
      "the HardFault handler");
  chk("in privileged mode", REG["mx-mode"].textContent, "privileged");
  chk("but the address is still not saved", REG["mx-mmfar"].textContent, "nothing yet");

  REG["fl-next"].fire("click");
  chk("step 5 is where the refused address lands in MMFAR",
      REG["mx-mmfar"].textContent, "0x20008820");
  chk("and the flag the kernel reads is set", REG["mx-flag"].textContent, "set");
  chk("both are marked as the readings that changed",
      REG["mx-mmfar"].classList.contains("is-hot")
        && REG["mx-flag"].classList.contains("is-hot"), true);

  REG["fl-next"].fire("click");
  chk("step 6 is back in the kernel", REG["mx-who"].textContent, "the kernel");
  chk("and forward is disabled at the end", REG["fl-next"].disabled, true);
  chk("the counter agrees", REG["fl-at"].textContent, "6");

  // Stepping past either end does not move.
  REG["fl-next"].fire("click");
  chk("pressing forward at the end goes nowhere", REG["fl-at"].textContent, "6");
  for (i = 0; i < 9; i++) { REG["fl-prev"].fire("click"); }
  chk("and back stops at the first step", REG["fl-at"].textContent, "1");
  chk("with the readings reset too", REG["mx-flag"].textContent, "clear");
  chk("and no longer marked", REG["mx-mmfar"].classList.contains("is-hot"), false);

  // The address the figure reports is the one past the region figure 3 builds.
  chk("the refused address is one past figure 3's last byte in",
      REG["mx-mmfar"].textContent, "nothing yet");
}());
walk("fl-", "flp-", 6, "figure 7");
REG["fl-1"].fire("click");
chk("step 2 quotes the datasheet rather than paraphrasing it",
    REG["flp-1"].textContent.indexOf("invoke the MemManage handler") > -1, true);
REG["fl-2"].fire("click");
// The chapter's sharpest fact: the exception the documentation names is not
// the one that runs, and the reason is a bit nobody ever writes.
chk("step 3 says the enable bit resets to zero",
    REG["flp-2"].textContent.indexOf("resets to zero") > -1, true);
chk("and that escalation is what happens instead",
    REG["flp-2"].textContent.indexOf("escalates") > -1, true);
REG["fl-3"].fire("click");
chk("step 4 gives the instruction that splits kernel from process",
    REG["flp-3"].textContent.indexOf("tst lr, #4") > -1, true);
REG["fl-4"].fire("click");
chk("step 5 names the register holding the refused address",
    REG["flp-4"].textContent.indexOf("MMFAR") > -1, true);
REG["fl-0"].fire("click");

// ---- Figure 8: the three control bits ----
// The three switches, and MPU_CTRL as their sum. PRIVDEFENA is bit 2,
// HFNMIENA bit 1, ENABLE bit 0, so Tock's setting is 0b101.
(function () {
  // With no JavaScript the sentence under each switch has to describe the
  // value that switch is actually shipping. This was backwards for HFNMIENA:
  // the switch read 0 and the sentence described a 1, which no behavioural
  // check could see because the script fixes it on load.
  (function () {
    // PAGE_CLASS carries what the markup shipped, before the script ran. It is
    // a global rather than one of the scoped proxies, so in the assembled book
    // its keys carry the page prefix and a literal lookup finds nothing --
    // which is a check that silently stops checking. Match on the suffix.
    function shipped(id) {
      var k;
      for (k in PAGE_CLASS) {
        if (k === id || k.slice(-(id.length + 2)) === "--" + id) {
          return PAGE_CLASS[k] || "";
        }
      }
      return null;
    }
    var N = ["en", "priv", "hf"], SET = [true, true, false], i, cls, bad = [];
    for (i = 0; i < 3; i++) {
      cls = shipped("cq-" + N[i] + "-a");
      if (cls === null) { bad.push(N[i] + " (not found)"); continue; }
      if ((cls.indexOf("is-off") > -1) === SET[i]) { bad.push(N[i]); }
    }
    chk("the markup's opening sentence matches each switch's own value",
        bad.join(","), "");
  }());
  chk("it opens on what Tock actually writes", REG["ctrl-hex"].textContent, "0x00000005");
  chk("and says so", REG["ctrl-tag"].classList.contains("is-off"), false);
  chk("with the two set bits reading 1",
      REG["swv-en"].textContent + REG["swv-priv"].textContent
        + REG["swv-hf"].textContent, "110");

  // Each switch, and the bit it owns.
  REG["sw-en"].fire("click");
  chk("clearing ENABLE leaves only PRIVDEFENA", REG["ctrl-hex"].textContent, "0x00000004");
  chk("and the tag stops claiming this is Tock's setting",
      REG["ctrl-tag"].classList.contains("is-off"), true);
  chk("the consequence swaps to the inert one",
      REG["cq-en-b"].classList.contains("is-off"), false);
  chk("and the live one is put away",
      REG["cq-en-a"].classList.contains("is-off"), true);
  REG["sw-en"].fire("click");
  chk("and flipping it back restores Tock's value",
      REG["ctrl-hex"].textContent, "0x00000005");

  REG["sw-priv"].fire("click");
  chk("clearing PRIVDEFENA leaves only ENABLE", REG["ctrl-hex"].textContent, "0x00000001");
  chk("and warns that the kernel is fenced too",
      REG["cq-priv-b"].textContent.indexOf("fenced by the same eight regions") > -1
        && REG["cq-priv-b"].classList.contains("is-off"), false);
  REG["sw-priv"].fire("click");

  REG["sw-hf"].fire("click");
  chk("setting HFNMIENA adds bit 1", REG["ctrl-hex"].textContent, "0x00000007");
  chk("and takes away what lets the handler read the process's stack",
      REG["cq-hf-a"].classList.contains("is-off"), false);
  REG["sw-hf"].fire("click");

  // All off is the state the board boots into.
  REG["sw-en"].fire("click");
  REG["sw-priv"].fire("click");
  chk("all three clear is the reset value", REG["ctrl-hex"].textContent, "0x00000000");
  REG["sw-en"].fire("click");
  REG["sw-priv"].fire("click");
  chk("and it comes back to Tock's own setting",
      REG["ctrl-hex"].textContent, "0x00000005");
  chk("tagged as such again", REG["ctrl-tag"].classList.contains("is-off"), false);

  // Exactly one of each consequence pair shows, whatever the combination.
  (function () {
    var N = ["en", "priv", "hf"], i, k, bad = 0;
    for (i = 0; i < 8; i++) {
      for (k = 0; k < 3; k++) {
        if (!!(i & (1 << k)) !== (REG["swv-" + N[k]].textContent === "1")) {
          REG["sw-" + N[k]].fire("click");
        }
      }
      for (k = 0; k < 3; k++) {
        if (REG["cq-" + N[k] + "-a"].classList.contains("is-off")
            === REG["cq-" + N[k] + "-b"].classList.contains("is-off")) { bad++; }
      }
    }
    chk("one consequence per switch, in all eight combinations", bad, 0);
  }());
  // Leave it on Tock's setting.
  if (REG["swv-en"].textContent !== "1") { REG["sw-en"].fire("click"); }
  if (REG["swv-priv"].textContent !== "1") { REG["sw-priv"].fire("click"); }
  if (REG["swv-hf"].textContent !== "0") { REG["sw-hf"].fire("click"); }
  chk("and the figure is left as the board really runs",
      REG["ctrl-hex"].textContent, "0x00000005");
}());
walk("cb-", "cbp-", 3, "figure 8");
REG["cb-1"].fire("click");
chk("the second bit is the one that exempts the kernel",
    REG["cbp-1"].textContent.indexOf("all unprotected memory") > -1, true);
REG["cb-2"].fire("click");
chk("and the third says the fence is off inside the handler",
    REG["cbp-2"].textContent.indexOf("HardFault") > -1, true);
REG["cb-0"].fire("click");

// ---- Figure 9: what the fence is not ----
walk("nt-", "ntp-", 3, "figure 9");
REG["nt-2"].fire("click");
chk("the third names the method nobody calls",
    REG["ntp-2"].textContent.indexOf("MPU_TYPE") > -1, true);
REG["nt-0"].fire("click");

// ---- The goals are delivered by named figures ----
// Chapter 3's third pass found a goal nothing on the page met. These read the
// goal text off the page rather than restating it here, so rewording a goal
// without moving the figure breaks the assertion.
chk("goal 1, what the unit checks and does not, is delivered by figure 1",
    REG["goalbox"].textContent.indexOf("the one thing it never sees") > -1
      && REG["ckp-4"].textContent.length > 40, true);
// 'real' came out of this goal in the first pass, because the worked example's
// base is chosen rather than read. The description kept it for two passes.
chk("goal 2, reading one region out of two registers, is delivered by figures 2 and 3",
    REG["goalbox"].textContent.indexOf("two registers that describe it") > -1
      && REG["goalbox"].textContent.indexOf("real region") < 0
      && REG["rfp-0"].textContent.indexOf("logical_start >> 5") > -1, true);
chk("goal 3, how many regions and what runs out, is delivered by figure 5",
    REG["goalbox"].textContent.indexOf("which two are spoken for") > -1
      && REG["goalbox"].textContent.indexOf("what runs out first") > -1
      && REG["rnp-3"].textContent.length > 40, true);
chk("goal 4, following one forbidden store, is delivered by figure 7",
    REG["goalbox"].textContent.indexOf("forbidden store") > -1
      && REG["flp-5"].textContent.length > 40, true);

// ---- The self-check ----
chk("the first answer starts hidden", REG["qan"].classList.contains("is-off"), true);
chk("the second answer starts hidden", REG["qbn"].classList.contains("is-off"), true);
chk("the third answer starts hidden", REG["qcn"].classList.contains("is-off"), true);
chk("the fourth answer starts hidden", REG["qdn"].classList.contains("is-off"), true);
REG["qa-0"].fire("click");
chk("a wrong guess still reveals the answer", REG["qan"].classList.contains("is-off"), false);
chk("and marks the guess wrong", REG["qa-0"].classList.contains("is-wrong"), true);
chk("while marking the right one right", REG["qa-1"].classList.contains("is-right"), true);
REG["qb-0"].fire("click");
REG["qc-0"].fire("click");
REG["qd-0"].fire("click");
(function () {
  // Which option is correct is a fact about the page, not about the script, so
  // read the four right answers back rather than trusting the quiz() calls.
  var i, out = "";
  var groups = [["qa-", 3], ["qb-", 3], ["qc-", 3], ["qd-", 3]];
  for (i = 0; i < groups.length; i++) {
    var j, mark = "?";
    for (j = 0; j < groups[i][1]; j++) {
      if (REG[groups[i][0] + j].classList.contains("is-right")) { mark = "" + j; }
    }
    out += mark;
  }
  chk("the four right answers are the ones the prose argues for", out, "1201");
}());

// ---- The script does the hiding the markup does not ----
// Every panel ships visible so a reader with no JavaScript meets all of them.
// That makes "one panel open" a claim about the script, and worth asserting
// on the figure with the most panels.
(function () {
  var i, hidden = 0;
  for (i = 0; i < 8; i++) {
    if (REG["rfp-" + i].classList.contains("is-off")) { hidden++; }
  }
  chk("the script closes the seven panels the markup leaves open", hidden, 7);
}());

// ---- Facts the prose must carry, not only the sources list ----
// Chapter 4's second pass found four sources bullets backing claims the page
// never made. These pin the reverse: the load-bearing facts are on the page.
chk("the chapter says where the register block is",
    REG["whereregs"].textContent.indexOf("0xE000ED90") > -1, true);
chk("and names the register that selects a region",
    REG["whereregs"].textContent.indexOf("MPU_RNR") > -1, true);
chk("the eight is attributed to the chip crate, not the hardware",
    REG["eightline"].textContent.indexOf("MPU<8>") > -1, true);
chk("and the datasheet's own count is quoted beside it",
    REG["eightline"].textContent.indexOf("8 secure and 8 non-secure") > -1, true);
chk("the worked example says which base it starts from",
    REG["workline"].textContent.indexOf("0x20008000") > -1, true);
chk("the chapter states the enforcement cannot be in the kernel",
    REG["unitline"].textContent.indexOf("in the processor") > -1
      && REG["unitline"].textContent.indexOf("not software") > -1, true);
chk("and says why, in the sentence before it",
    REG["gapline"].textContent.indexOf("a number in a struct") > -1, true);
chk("the closing names the two regions a process starts with",
    REG["closing"].textContent.indexOf("read-write and never executable") > -1
      && REG["closing"].textContent.indexOf("read-execute and never writable") > -1, true);

// ---- what the first review pass found ----
// Two source bullets backed claims the page never made: the skip-if-unchanged
// optimisation, and the older unit writing the identical three control fields.
// Both are prose now, so both are assertable.
chk("the chapter says which of the two writes is skipped",
    REG["skipline"].textContent.indexOf("the eight pairs are left alone") > -1, true);
chk("and that the three control fields are not the skipped one",
    REG["sameline"].textContent.indexOf("written every time") > -1, true);
chk("and what the comparison is against",
    REG["skipline"].textContent.indexOf("dirty flag") > -1, true);
chk("the older unit writing the same three fields is on the page",
    REG["sameline"].textContent.indexOf("identical three") > -1, true);
// 'region' is the word chapter 4 used for what a linker script cuts the chip
// into. This chapter redefines it and now says so.
chk("the collision with chapter 4's sense of the word is named",
    REG["wordregion"].textContent.indexOf("linker script") > -1, true);
// The one address in the chapter that was chosen rather than read.
chk("the worked example admits its base is picked, not read off the board",
    REG["workline"].textContent.indexOf("picked to make the arithmetic") > -1, true);
// Three of the five permission names have no caller anywhere. The chapter said
// so three different ways -- 'the loading path', 'this board', 'this tree'.
// The three unused variants have no caller anywhere. Saying so in every panel
// meant saying it four times; it is the note's job now, once.
chk("the note carries the tree-wide claim about the unused three",
    REG["pm-note"].textContent.indexOf("no caller anywhere in the tree") > -1, true);
chk("and no panel repeats it",
    REG["pmp-0"].textContent.indexOf("this tree") < 0
      && REG["pmp-3"].textContent.indexOf("this tree") < 0
      && REG["pmp-4"].textContent.indexOf("this tree") < 0, true);
// The closing counted the same registers two ways in adjacent sentences.
chk("the closing says two pairs confine a process, out of eight",
    REG["closing"].textContent.indexOf("two pairs of registers") > -1
      && REG["closing"].textContent.indexOf("holds eight pairs") > -1, true);

// ---- what the second review pass found ----
// The glossary was the one part of the page neither earlier pass had aimed at,
// and it held two errors. 'execute-never' called itself one bit while figure 2
// had grown a second, and 'privileged' blamed the chip for a line Tock writes.
chk("the glossary says there are two execute-never bits",
    REG["words"].textContent.indexOf("There are two: one aimed at the process") > -1, true);
chk("and that exempting the kernel is Tock's configuration, not the chip's",
    REG["words"].textContent.indexOf("Tock configures the unit not to constrain it") > -1, true);
// It also miscounted its own exception names: MemManage never fires here and
// HardFault is the handler this board installs, so one of two, not two of three.
chk("the count of exception names is two, one of which never fires",
    REG["wordcount"].textContent.indexOf("Two of them are the names") > -1
      && REG["wordcount"].textContent.indexOf("only one of the two ever fires") > -1, true);
// Figure 2's note said ten bits had nowhere to go, in a figure whose rows now
// account for all ten.
chk("the note says the ten register positions carry fields",
    REG["rf-note"].textContent.indexOf("carrying the fields in the rows above") > -1, true);
// PXN's 0x10 is added to figure 3's limits, not visible inside them.
chk("the PXN panel says the 0x10 is added, not present",
    REG["rfp-4"].textContent.indexOf("adds to every limit") > -1, true);
// ATTRINDX is three bits and its own row says so.
chk("the three-bit field is named as three bits, because ATTRINDX is one",
    REG["rfp-5"].textContent.indexOf("Three bits") > -1
      && REG["rf-5"].textContent.indexOf("ATTRINDX") > -1, true);

// ---- what the third review pass found ----
// A lens over every absolute claim on the page -- never, only, nothing, always,
// every, cannot. 103 sentences of 537 carry one, and four were wrong.
// MAIR0 is written above the dirty check, so it goes in on every configure.
// Mutation testing caught this assertion pointing at the wrong paragraph: the
// sentence lives one <p> further down, so the check could never have failed.
chk("the intro no longer says the attribute is set once",
    REG["threeuses"].textContent.indexOf("sets once") < 0
      && REG["threeuses"].textContent.indexOf("one line the kernel writes on every configure") > -1, true);
chk("and figure 2 says on every configure",
    REG["rfp-5"].textContent.indexOf("set on every configure") > -1, true);
// Steps 1 and 2 both have no source line behind them, so the sentence counts
// nothing now: it says why this step has none.
chk("step 1 says why it has no source line rather than counting",
    REG["flp-0"].textContent.indexOf("no software in it") > -1
      && REG["flp-0"].textContent.indexOf("Only twice") < 0, true);
// RLAR's five bits carry the other half of the size rule.
chk("the base panel calls its five bits half the rule",
    REG["rfp-0"].textContent.indexOf("half the size rule") > -1, true);
chk("and points at the field carrying the other half",
    REG["rfp-0"].textContent.indexOf("The limit field in the pair below") > -1, true);
// A request that is already a multiple of 32 gets exactly what it asked for.
chk("the rounding claim is scoped to requests that need rounding",
    REG["mm-note"].textContent.indexOf("not already a multiple of 32") > -1, true);

// ---- what the fourth review pass found ----
// Three paragraphs carried real claims behind ids no assertion ever read. An
// anchor the suite ignores is the mirror of a control nothing wires up.
chk("the chapter states the order: regions in, then the unit on",
    REG["ctrlline"].textContent.indexOf("before a switch into a process") > -1
      && REG["ctrlline"].textContent.indexOf("turned on immediately after") > -1, true);
chk("and that two of the three control fields are about who is exempt",
    REG["ctrlline"].textContent.indexOf("who is <em>not</em> being protected against") > -1
      || REG["ctrlline"].textContent.indexOf("who is not being protected against") > -1, true);
chk("the fault section opens on the access that starts it",
    REG["instantline"].textContent.indexOf("one byte past the end of its region") > -1, true);
chk("and says how many steps it takes to become a stopped process",
    REG["instantline"].textContent.indexOf("six steps") > -1, true);
chk("the two-chips section says the kernel asks for a region, not a register",
    REG["twochips"].textContent.indexOf("It asks for a region of at least so many bytes") > -1, true);
chk("and names where the answer is worked out",
    REG["twochips"].textContent.indexOf("under") > -1
      && REG["twochips"].textContent.indexOf("arch/") > -1, true);
