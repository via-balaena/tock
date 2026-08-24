// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Behavioural assertions for chapter 4, run by check.py under JavaScriptCore.

// Same helpers as chapter 3: every figure here is one row of buttons and one
// row of panels sharing an index, built by one function. That is a single
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
chk("figure 1 opens on a question", REG["tw-0"].getAttribute("aria-pressed"), "true");
chk("figure 2 opens on the version field", REG["hd-0"].getAttribute("aria-pressed"), "true");
chk("figure 3 opens on the first step", REG["wk-0"].getAttribute("aria-pressed"), "true");
chk("figure 4 opens on the bootloader", REG["rg-0"].getAttribute("aria-pressed"), "true");
chk("figure 6 opens on the control block", REG["ks-0"].getAttribute("aria-pressed"), "true");
chk("figure 7 opens on the first option", REG["pl-0"].getAttribute("aria-pressed"), "true");
chk("figure 8 opens on argument 0", REG["ag-0"].getAttribute("aria-pressed"), "true");
chk("figure 9 opens on Running", REG["ps-0"].getAttribute("aria-pressed"), "true");
chk("figure 10 opens on the Pico 2", REG["fp-0"].getAttribute("aria-pressed"), "true");
chk("and every one of those has its panel open",
    REG["twp-0"].classList.contains("is-on")
      && REG["hdp-0"].classList.contains("is-on")
      && REG["wkp-0"].classList.contains("is-on")
      && REG["rgp-0"].classList.contains("is-on")
      && REG["ksp-0"].classList.contains("is-on")
      && REG["plp-0"].classList.contains("is-on")
      && REG["agp-0"].classList.contains("is-on")
      && REG["psp-0"].classList.contains("is-on")
      && REG["fpp-0"].classList.contains("is-on"), true);

// Figure 5 is the deliberate exception. Seven boundaries, and the one the
// reader needs is the one the process itself can move, not the topmost.
chk("figure 5 opens on app_break rather than the top",
    REG["mm-2"].getAttribute("aria-pressed"), "true");
chk("and not on the first line", REG["mm-0"].getAttribute("aria-pressed"), "false");
chk("the app_break panel is the open one", REG["mmp-2"].classList.contains("is-on"), true);
chk("and it is the one that gives the thirty-two",
    REG["mmp-2"].textContent.indexOf("thirty-two bytes") > -1, true);

// ---- Figure 1: capsule against process ----
walk("tw-", "twp-", 5, "figure 1");
// Every panel has to answer for both sides, or the figure is a list about
// processes with a capsule mentioned. The imperative promises two answers.
(function () {
  var i, both = 0, text;
  for (i = 0; i < 5; i++) {
    text = REG["twp-" + i].textContent;
    if (text.indexOf("Capsule:") > -1 && text.indexOf("Process:") > -1) { both++; }
  }
  chk("all five panels answer for a capsule and for a process", both, 5);
}());
chk("the language row is where C and assembly could go",
    REG["twp-1"].textContent.indexOf("anything at all") > -1, true);
chk("and the last row is the one chapter 3 ended on",
    REG["twp-4"].textContent.indexOf("timeslice") > -1, true);
REG["tw-0"].fire("click");
chk("clicking back to the first releases the others",
    onlyOne("twp-", 5, "is-on") + REG["tw-1"].getAttribute("aria-pressed"), "1false");

// ---- Figure 2: the sixteen bytes ----
walk("hd-", "hdp-", 5, "figure 2");
// The five offsets are the argument. Each field has to start where the one
// before it ended, and the five together have to come to sixteen bytes -- the
// number the prose, the heading and the parser's own floor all depend on.
(function () {
  var SPAN = [[0, 1], [2, 3], [4, 7], [8, 11], [12, 15]];
  var i, at = 0, text, want;
  for (i = 0; i < SPAN.length; i++) {
    if (SPAN[i][0] !== at) {
      throw new Error("field " + i + " starts at " + SPAN[i][0] +
                      ", but the one before it ended at " + (at - 1));
    }
    want = SPAN[i][0] + "-" + SPAN[i][1];
    text = REG["hd-" + i].textContent.replace("\u2013", "-");
    if (text.indexOf(want) < 0) {
      throw new Error("field " + i + " does not show the offsets " + want);
    }
    at = SPAN[i][1] + 1;
  }
  chk("the five fields cover sixteen bytes with no gap", at, 16);
}());
chk("the version panel is the one that ends the search",
    REG["hdp-0"].textContent.indexOf("end of the list") > -1, true);
chk("the total_size panel says it is believed before it is checked",
    REG["hdp-2"].textContent.indexOf("we trust the value in flash") > -1, true);
chk("and the checksum panel refuses to be mistaken for a signature",
    REG["hdp-4"].textContent.indexOf("not a signature") > -1, true);
REG["hd-0"].fire("click");

// ---- Figure 3: the walk ----
walk("wk-", "wkp-", 6, "figure 3");
// Six steps, and every one carries the file and line it came from. A step with
// no citation is the shape a made-up step would take.
(function () {
  var i, cited = 0;
  for (i = 0; i < 6; i++) {
    if (REG["wk-" + i].textContent.indexOf(".rs:") > -1) { cited++; }
  }
  chk("all six steps cite a file and line", cited, 6);
}());
chk("the version step quotes the comment that explains the ending",
    REG["wkp-2"].textContent.indexOf("signal the end of apps") > -1, true);
chk("the skip step says the length is the link",
    REG["wkp-4"].textContent.indexOf("the length is the link") > -1, true);
chk("and the last step says what erased flash reads as",
    REG["wkp-5"].textContent.indexOf("0xFF") > -1, true);
REG["wk-0"].fire("click");

// ---- Figure 4: the four regions ----
// These are read off boards/raspberry_pi_pico_2/layout.ld, so they are
// asserted rather than trusted -- and the arithmetic is asserted too, because
// a start, a length and an end that do not agree is the defect this figure
// would hide best.
(function () {
  var CASE = [
    ["bootloader",   "0x10000000", "1 kB",   "0x10000400", 1],
    ["kernel",       "0x10000400", "255 kB", "0x10040000", 255],
    ["applications", "0x10040000", "256 kB", "0x10080000", 256]
  ];
  var i, c;
  for (i = 0; i < CASE.length; i++) {
    c = CASE[i];
    REG["rg-" + i].fire("click");
    chk(c[0] + " starts where the linker script says", REG["rg-lo"].textContent, c[1]);
    chk(c[0] + " is the length the linker script gives", REG["rg-len"].textContent, c[2]);
    chk(c[0] + " ends where the linker script says", REG["rg-hi"].textContent, c[3]);
    chk("and " + c[0] + "'s three numbers agree with each other",
        parseInt(c[1], 16) + c[4] * 1024, parseInt(c[3], 16));
    chk("its panel is the open one", REG["rgp-" + i].classList.contains("is-on"), true);
  }
  // The three flash regions are laid end to end with nothing between them.
  chk("the kernel starts where the bootloader ends",
      parseInt(CASE[0][3], 16), parseInt(CASE[1][1], 16));
  chk("and the applications start where the kernel ends",
      parseInt(CASE[1][3], 16), parseInt(CASE[2][1], 16));
}());
// The fourth region is the honest one: its start is not a number, because it
// depends on how big the kernel's own data turned out to be.
REG["rg-3"].fire("click");
chk("application RAM has no fixed start", REG["rg-lo"].textContent.indexOf("0x"), -1);
chk("and its panel says why", REG["rgp-3"].textContent.indexOf("not a round number") > -1, true);
chk("its end is the last byte of the 520 kB this chip has",
    parseInt(REG["rg-hi"].textContent, 16) - 520 * 1024, parseInt("0x20000000", 16));
REG["rg-0"].fire("click");

// ---- Figure 5: seven boundaries ----
walk("mm-", "mmp-", 7, "figure 5");
chk("there are seven and not six or eight",
    REG["mm-6"] !== undefined && REG["mm-7"] === undefined, true);
// The left column is the whole point of the figure: two of the seven are the
// kernel's and five are the process's, and the split is where the fence goes.
(function () {
  var i, kernel = 0, app = 0;
  for (i = 0; i < 7; i++) {
    if (REG["mm-" + i].textContent.indexOf("kernel") === 0) { kernel++; }
    if (REG["mm-" + i].textContent.indexOf("app") === 0) { app++; }
  }
  chk("two boundaries are the kernel's", kernel, 2);
  chk("and five are the process's", app, 5);
}());
chk("the top panel hands the reader on to figure 6",
    REG["mmp-0"].textContent.indexOf("Figure 6") > -1, true);
chk("the kernel's floor moves downward",
    REG["mmp-1"].textContent.indexOf("downward") > -1, true);
chk("the heap moves upward",
    REG["mmp-3"].textContent.indexOf("upward") > -1, true);
chk("and the bottom is the number the process is told",
    REG["mmp-6"].textContent.indexOf("Figure 8") > -1, true);
REG["mm-2"].fire("click");

// ---- Figure 6: what the kernel keeps inside your memory ----
walk("ks-", "ksp-", 3, "figure 6");
chk("the control block panel says the record is stored in what it records",
    REG["ksp-0"].textContent.indexOf("stored in the process") > -1, true);
chk("the upcall queue gives the number and the constant that holds it",
    REG["ksp-1"].textContent.indexOf("CALLBACK_LEN") > -1, true);
chk("and the grant pointers panel hands the mechanism to chapter 7",
    REG["ksp-2"].textContent.indexOf("chapter 7") > -1, true);
REG["ks-0"].fire("click");

// ---- Figure 7: three ways to place a program ----
walk("pl-", "plp-", 3, "figure 7");
// Two of the three exist in the tree and one does not. If a later edit softens
// the first panel, the figure stops making its point.
chk("the first is the one this kernel never does",
    REG["plp-0"].textContent.indexOf("never does") > -1, true);
chk("the second is real and names its error",
    REG["plp-1"].textContent.indexOf("MemoryAddressMismatch") > -1, true);
chk("and the third is the default",
    REG["plp-2"].textContent.indexOf("The default") === 0, true);
REG["pl-0"].fire("click");

// ---- Figure 8: the four arguments ----
walk("ag-", "agp-", 4, "figure 8");
chk("there are four and not three or five",
    REG["ag-3"] !== undefined && REG["ag-4"] === undefined, true);
chk("the first is not the start of the header",
    REG["agp-0"].textContent.indexOf("Not the start of the header") === 0, true);
chk("the third says the kernel's own structures are inside the length",
    REG["agp-2"].textContent.indexOf("Figure 6 are inside this length") > -1, true);
chk("and the fourth gives the same thirty-two as figure 5",
    REG["agp-3"].textContent.indexOf("thirty-two bytes") > -1, true);
REG["ag-0"].fire("click");

// ---- Figure 9: the six states ----
walk("ps-", "psp-", 6, "figure 9");
(function () {
  var NAMES = ["Running", "Yielded", "YieldedFor", "Stopped", "Faulted",
               "Terminated"];
  var i, wrong = 0;
  for (i = 0; i < NAMES.length; i++) {
    if (REG["ps-" + i].textContent.indexOf(NAMES[i]) < 0) { wrong++; }
  }
  chk("the six buttons carry the six names the kernel uses", wrong, 0);
}());
chk("Running is about willingness rather than about holding the processor",
    REG["psp-0"].textContent.indexOf("may not be currently scheduled") > -1, true);
chk("and Faulted says a process cannot simply be restarted",
    REG["psp-4"].textContent.indexOf("terminated first") > -1, true);
REG["ps-0"].fire("click");

// ---- Figure 10: two boards, two policies ----
(function () {
  var i;
  for (i = 0; i < 2; i++) {
    REG["fp-" + i].fire("click");
    if (!REG["fpp-" + i].classList.contains("is-on")) {
      throw new Error("board " + i + " did not light its own panel");
    }
  }
  chk("exactly one board is lit at a time", onlyOne("fpp-", 2, "is-on"), 1);
}());
REG["fp-0"].fire("click");
chk("the two boards name different policies",
    REG["fp-0"].textContent.indexOf("PanicFaultPolicy") > -1
      && REG["fp-1"].textContent.indexOf("StopFaultPolicy") > -1, true);
chk("the Pico 2 takes everything down with it",
    REG["fpp-0"].textContent.indexOf("The whole board panics") > -1, true);
chk("imix does not",
    REG["fpp-1"].textContent.indexOf("Everything else carries on") > -1, true);
chk("and the panel says how many policies there are to choose from",
    REG["fpp-1"].textContent.indexOf("Seven of these policies") > -1, true);

// ---- Check yourself ----
// The answers live in the markup and start hidden; clicking any option reveals
// the answer and marks which one was right. A wrong click must still reveal.
(function () {
  var CASE = [["qa-", 3, 0, "qan"], ["qb-", 3, 0, "qbn"],
              ["qc-", 3, 1, "qcn"], ["qd-", 3, 1, "qdn"]];
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
// The right answer must not be findable by shape alone. Chapter 3 shipped with
// three of four answers as the structurally odd option, so this one spreads
// them and checks the two that are easiest to make give themselves away.
chk("the first question's three options all begin the same way",
    REG["qa-0"].textContent.indexOf("The version is 2") === 0
      && REG["qa-1"].textContent.indexOf("The version is 2") === 0
      && REG["qa-2"].textContent.indexOf("The version is 2") === 0, true);
// Read the positions back off the page rather than restating them: the
// quiz loop above clicked a wrong option in each question, so the script has
// marked the right one in all four by now.
(function () {
  var Q = ["qa-", "qb-", "qc-", "qd-"], i, j, at = "";
  for (i = 0; i < Q.length; i++) {
    for (j = 0; j < 3; j++) {
      if (REG[Q[i] + j].classList.contains("is-right")) { at += j; }
    }
  }
  chk("the right answer is not in the same position every time", at, "0011");
}());

// ---- What the chapter promised it would do ----
// Four goals at the top, each tied to what on the page delivers it. A goal
// nothing answers is the failure this catches.
chk("goal 1, what a process is in flash and in RAM, is delivered by figures 4 and 5",
    REG["rgp-2"].textContent.indexOf("flashed separately from the kernel") > -1
      && REG["mmp-6"].textContent.indexOf("The bottom") === 0, true);
chk("goal 2, why chapter 3's promise cannot be made, is delivered by figure 1",
    REG["twp-0"].textContent.indexOf("it arrives as bytes") > -1, true);
chk("goal 3, the search and what stops it, is delivered by figure 3",
    REG["wkp-5"].textContent.indexOf("fails to be an entry") > -1, true);
chk("goal 4, what a process is handed, is delivered by figure 8",
    REG["agp-1"].textContent.indexOf("worked out from this one") > -1, true);

// ---- The rule chapter 3's fifth pass established ----
// Panels ship visible in the markup so a reader with no JavaScript meets all
// of them, and the script is what puts the rest away. That inverts which side
// has to be asserted: what matters is that the script did the hiding.
(function () {
  var i, hidden = 0;
  for (i = 0; i < 5; i++) {
    if (REG["twp-" + i].classList.contains("is-off")) { hidden++; }
  }
  chk("the script closes the panels the markup leaves open", hidden, 4);
}());
(function () {
  var i, hidden = 0;
  for (i = 0; i < 7; i++) {
    if (REG["mmp-" + i].classList.contains("is-off")) { hidden++; }
  }
  chk("and does it for the seven-panel figure too", hidden, 6);
}());

// ---- The edge of what this chapter buys ----
// The chapter describes boundaries and enforces none of them. Saying so is the
// finding chapter 3's first review pass turned up, applied before shipping.
chk("the page says what holds the boundary and what only records it",
    REG["pairs-enforce"].textContent.indexOf("what the kernel knows") > -1
      && REG["pairs-enforce"].textContent.indexOf("what enforces it") > -1, true);
chk("and names hardware as the half that is missing",
    REG["pairs-enforce"].textContent.indexOf("hardware") > -1, true);

// ---- The vocabulary the chapter leans on ----
(function () {
  var WORDS = ["process", "userspace", "TBF", "stack", "heap", "scheduler",
               "timeslice", "fault", "panic", "syscall", "grant"];
  var i, missing = 0;
  for (i = 0; i < WORDS.length; i++) {
    if (REG["words"].textContent.indexOf(WORDS[i]) < 0) { missing++; }
  }
  chk("all eleven of the words the heading promises are in the list", missing, 0);
}());

// ---- what the first review pass found ----
// The checksum panel said "every four-byte word of the header". The loop skips
// word three, which is the checksum field itself, so a reader working one out
// by hand would have got a different number than the kernel does.
chk("the checksum panel says which word is left out",
    REG["hdp-4"].textContent.indexOf("except this one") > -1, true);
chk("and no longer claims every word goes in",
    REG["hdp-4"].textContent.indexOf("Every four-byte word of the header, exclusive"), -1);

// The chapter never said the thing every mechanism in it is a consequence of.
// Tock's threat model was on the page only inside a citation.
chk("the chapter states its own premise in the prose",
    REG["premise"].textContent.indexOf("untrusted") > -1, true);
chk("and quotes the clause that says what replaces trust",
    REG["premise"].textContent.indexOf("hardware memory protection") > -1, true);

// Goal 2 promised to name what the kernel uses instead, and the name appeared
// once on the whole page -- in the next chapter's heading.
chk("the body names the fence rather than describing it",
    REG["closing"].textContent.indexOf("memory protection unit") > -1, true);

// Chapter 3's next card promised what the isolation costs to run, and the
// chapter delivered the memory cost only.
chk("the run-time cost is on the page too",
    REG["runcost"].textContent.indexOf("every single visit to a process") > -1, true);
chk("and it is counted rather than gestured at",
    REG["runcost"].textContent.indexOf("Six operations") > -1, true);

// ---- Figure 11: the limits section was prose only ----
// Chapter 3's second pass found exactly this shape -- the section about what a
// chapter does not buy, sitting on the skim path as a bare heading.
chk("figure 11 opens on the first of the three",
    REG["tb-0"].getAttribute("aria-pressed"), "true");
walk("tb-", "tbp-", 3, "figure 11");
REG["tb-0"].fire("click");
chk("the header panel says total_size is believed outright",
    REG["tbp-0"].textContent.indexOf("believed outright") > -1, true);
chk("the app_break panel hands enforcement to chapter 5",
    REG["tbp-1"].textContent.indexOf("chapter 5") > -1, true);
chk("and the timeslice is named as the one that already works",
    REG["tbp-2"].textContent.indexOf("already works") > -1, true);

// ---- The reader has this board on the desk ----
// Nothing in chapters 1 to 3 was actionable. This one describes a thing with an
// observable consequence, so it says how to cause it.
chk("the two objcopy flags are both on the page",
    REG["pairs-install"].textContent.indexOf("--set-section-flags") > -1
      && REG["pairs-install"].textContent.indexOf("--update-section") > -1, true);
chk("and the app lands where figure 3 starts looking",
    REG["pairs-install"].textContent.indexOf("0x10040000") > -1, true);

// ---- Every glossary word is used again ----
// The section promises "repeated in context below", and two of the eleven were
// not: `userspace` and `TBF` appeared once each, in the list itself. The
// general rule is a static check now; these are the two places that were fixed.
chk("userspace is used where the line it names is drawn",
    REG["userspaceline"].textContent.indexOf("userspace") > -1, true);
chk("and TBF is used where the chapter is about a TBF header",
    REG["trusts"].textContent.indexOf("TBF header") > -1, true);

// ---- The self-check cannot be passed on length ----
// Chapter 3 shipped with the right answer as the structurally odd option. The
// fix there was parallel phrasing, which left length unguarded: here the right
// answer was never longer than any distractor in any of the four questions.
(function () {
  var CASE = [["qa-", 0], ["qb-", 0], ["qc-", 1], ["qd-", 1]];
  var i, j, len, right, uniqueShortest = 0;
  for (i = 0; i < CASE.length; i++) {
    len = [];
    for (j = 0; j < 3; j++) {
      len.push(REG[CASE[i][0] + j].textContent.split(/\s+/).length);
    }
    right = len[CASE[i][1]];
    if (len.filter(function (n) { return n < right; }).length === 0
        && len.filter(function (n) { return n === right; }).length === 1) {
      uniqueShortest++;
    }
  }
  chk("the right answer is never the one shortest option", uniqueShortest, 0);
}());

// ---- what the second review pass found ----
// Figure 4's last row and Figure 5 were the same memory at two scales, and
// nothing joined them. `_sappmem` was cited in the sources and named nowhere on
// the page, so a reader finishing Figure 5 could not say where memory_start
// came from.
chk("the pool and one slice out of it are joined",
    REG["poolbridge"].textContent.indexOf("Figure 4's last row") > -1, true);

// The chapter was singular end to end while two figures leaned on there being
// more than one process. NUM_PROCS = 4 was cited and claimed nowhere.
chk("the chapter says how many fit at a time",
    REG["plural"].textContent.indexOf("four at a time") > -1, true);
chk("and that they are handed memory in the order they were found",
    REG["plural"].textContent.indexOf("in the order it found them") > -1, true);

// Figures 5, 6 and 9 describe ProcessStandard. Pass 1 caught the CALLBACK_LEN
// instance of stating an implementation's property as Tock's; this is the
// general case, in a chapter whose method is "the board decides".
chk("the chapter says whose implementation this is",
    REG["whoseimpl"].textContent.indexOf("ProcessStandard") > -1, true);

// Four sources bullets backed claims the page did not make. The one that was a
// real loss: the kernel zeroes what a process can reach before it runs, which
// is the only isolation guarantee here the kernel provides itself.
chk("the zeroing is on the page, not only in the citations",
    REG["mmp-6"].textContent.indexOf("written to zero first") > -1, true);
chk("and it says what that prevents",
    REG["mmp-6"].textContent.indexOf("the last process to hold this memory") > -1, true);
chk("the timer is named and clocked rather than left as 'a hardware timer'",
    REG["tbp-2"].textContent.indexOf("125") > -1, true);

// The install section stopped one step short of being usable.
chk("the reader is told where a .tbf comes from",
    REG["installsrc"].textContent.indexOf("libtock-c") > -1, true);

// Three panels opened with a deictic that has no referent once the script is
// off and every panel is stacked.
chk("the version panel names its field",
    REG["hdp-0"].textContent.indexOf("The version must be 2") === 0, true);
chk("the YieldedFor panel names its state",
    REG["psp-2"].textContent.indexOf("YieldedFor") === 0, true);
chk("and the imix panel names its board",
    REG["fpp-1"].textContent.indexOf("On imix") === 0, true);

// Figure 5's note counted three moving boundaries and then named the heap,
// whose own boundary does not move.
(function () {
  var note = REG["mm-note"].textContent, i, named = 0;
  var MOVERS = ["stack pointer", "app_break", "kernel_memory_break"];
  for (i = 0; i < MOVERS.length; i++) {
    if (note.indexOf(MOVERS[i]) > -1) { named++; }
  }
  chk("the note names the three boundaries that actually move", named, 3);
}());

// "Six operations" is right for this board and general as written; the hook
// that would make it seven is now on the page.
chk("the count is scoped to this board",
    REG["runcost"].textContent.indexOf("on this board") > -1, true);
chk("and the seventh has somewhere to go",
    REG["runcost"].textContent.indexOf("hook") > -1, true);
