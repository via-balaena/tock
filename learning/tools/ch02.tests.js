// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Behavioural assertions for chapter 2, run by check.py under JavaScriptCore.

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
    REG["bw-3"].textContent, "0x10000400");
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
