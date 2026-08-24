// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Behavioural assertions for chapter 7, run by check.py under JavaScriptCore.

// Same helpers as chapters 3 to 6: every figure here is one row of buttons and
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
chk("figure 1 opens on the way this kernel takes", REG["wy-3"].getAttribute("aria-pressed"), "true");
chk("and not on one of the three it rules out", REG["wy-0"].getAttribute("aria-pressed"), "false");
chk("figure 2 opens on the table at the top", REG["bd-0"].getAttribute("aria-pressed"), "true");
chk("figure 3 opens on the counters word", REG["pt-0"].getAttribute("aria-pressed"), "true");
chk("figure 4 opens on the first unused slot", REG["ws-0"].getAttribute("aria-pressed"), "true");
chk("figure 5 opens on the board booting", REG["lf-0"].getAttribute("aria-pressed"), "true");
chk("figure 6 opens on what a capsule holds", REG["ch-0"].getAttribute("aria-pressed"), "true");
chk("figure 7 opens on the refusal that stops the board", REG["rf-0"].getAttribute("aria-pressed"), "true");
chk("figure 8 opens on the request that fits", REG["gp-0"].getAttribute("aria-pressed"), "true");
chk("figure 9 opens on chapter 1's sentence", REG["ar-0"].getAttribute("aria-pressed"), "true");
chk("and every one of those has its panel open",
    REG["wyp-3"].classList.contains("is-on")
      && REG["bdp-0"].classList.contains("is-on")
      && REG["ptp-0"].classList.contains("is-on")
      && REG["wsp-0"].classList.contains("is-on")
      && REG["lfp-0"].classList.contains("is-on")
      && REG["chp-0"].classList.contains("is-on")
      && REG["rfp-0"].classList.contains("is-on")
      && REG["gpp-0"].classList.contains("is-on")
      && REG["arp-0"].classList.contains("is-on"), true);

// ---- Figure 1: four ways to keep per-process state ----
walk("wy-", "wyp-", 4, "figure 1");
REG["wy-1"].fire("click");
chk("the heap is ruled out because there is nothing to ask",
    REG["wyp-1"].textContent.indexOf("nothing to ask") > -1, true);
REG["wy-3"].fire("click");
chk("the chosen one charges the process that caused the need",
    REG["wyp-3"].textContent.indexOf("Take the memory out of the process that caused the need") > -1, true);
chk("and the note says what that does to the accounting",
    REG["wy-note"].textContent.indexOf("charged rather than estimated") > -1, true);

// ---- Figure 2: the bands of one process's memory ----
walk("bd-", "bdp-", 6, "figure 2");
(function () {
  // The figure's argument is that two lines move and they move towards each
  // other. Counting how many panels contain the word "up" would pass on a
  // page that said nothing; these name the two and check the directions are
  // opposite.
  REG["bd-2"].fire("click");
  var kernelLine = REG["bdp-2"].textContent;
  REG["bd-4"].fire("click");
  var appLine = REG["bdp-4"].textContent;
  chk("the kernel's line only ever goes down",
      kernelLine.indexOf("Every new grant lowers it") > -1
        && kernelLine.indexOf("nothing raises it while the process runs") > -1, true);
  chk("and the process's line is the one that goes up",
      appLine.indexOf("asking to move this line up") > -1, true);
  chk("the grants under the table are a bump, downward",
      REG["bdp-1"].textContent.indexOf("only ever downward") > -1, true);
}());
REG["bd-0"].fire("click");
chk("the table is cut before the process runs",
    REG["bdp-0"].textContent.indexOf("before the process runs a single instruction") > -1, true);
chk("and every process carries all of it",
    REG["bdp-0"].textContent.indexOf("whether it uses any of those drivers or not") > -1, true);
REG["bd-3"].fire("click");
chk("the gap belongs to whoever asks first",
    REG["bdp-3"].textContent.indexOf("whichever asks first gets it") > -1, true);
chk("the note names which half is eager and which is lazy",
    REG["bd-note"].textContent.indexOf("the table at the top is eager and the grants under it are lazy") > -1, true);

// ---- Figure 3: the console's grant, added up ----
walk("pt-", "ptp-", 6, "figure 3");
(function () {
  // The running total is the figure's argument, so it is checked as a total
  // rather than as six strings: each part adds to the one before, and the last
  // is the number the compiled probe beside the page reports.
  var i, seen = [], bad = [];
  for (i = 0; i < 6; i++) {
    REG["pt-" + i].fire("click");
    seen.push(parseInt(REG["pt-total"].textContent, 10));
    var part = parseInt(REG["pt-size"].textContent, 10);
    if (i > 0 && seen[i] !== seen[i - 1] + part) {
      bad.push("step " + i + " totals " + seen[i] + " after " + seen[i - 1] + " plus " + part);
    }
  }
  chk("each part adds to the running total before it", bad.join("; "), "");
  chk("and the first part is the counters word", seen[0], 4);
  chk("the total is what the kernel's own grant_size returns", seen[5], 76);
}());
REG["pt-4"].fire("click");
chk("the padding part explains why there is none here",
    REG["ptp-4"].textContent.indexOf("already a multiple of four") > -1, true);
chk("and says who would pay it",
    REG["ptp-4"].textContent.indexOf("eight-byte alignment would pay four bytes") > -1, true);
REG["pt-0"].fire("click");
chk("the note says the number was compiled, not added up",
    REG["pt-note"].textContent.indexOf("not a number worked out by adding up field widths") > -1, true);
chk("and gives the slotless comparison", REG["pt-note"].textContent.indexOf("would be twenty") > -1, true);
chk("the listing shows the counts living in the type",
    REG["conslist"].textContent.indexOf("UpcallCount") > -1
      && REG["conslist"].textContent.indexOf("AllowRoCount") > -1, true);
chk("and the prose says those counts are fixed at compile time",
    REG["constgen"].textContent.indexOf("has to be recompiled") > -1, true);

// ---- Figure 4: the slots nobody fills ----
walk("ws-", "wsp-", 3, "figure 4");
(function () {
  // All three are the same eight bytes for the same reason, and the figure
  // fails if any of them stops saying so.
  var i, eights = 0;
  for (i = 0; i < 3; i++) {
    REG["ws-" + i].fire("click");
    if (REG["wsp-" + i].textContent.indexOf("Eight bytes") > -1
        || REG["wsp-" + i].textContent.indexOf("eight bytes") > -1) { eights++; }
  }
  chk("all three unused slots are eight bytes", eights, 3);
}());
chk("the note prices them against the whole grant",
    REG["ws-note"].textContent.indexOf("Twenty-four bytes of a seventy-six-byte grant") > -1, true);
chk("and says the cost lands on the process, not the kernel",
    REG["ws-note"].textContent.indexOf("paid again by every process") > -1, true);
chk("the section quotes the comment that explains the numbering",
    REG["whyzero"].textContent.indexOf("so to preserve compatibility we still use allow number 1 now") > -1, true);
REG["ws-0"].fire("click");

// ---- Figure 5: a grant's life ----
walk("lf-", "lfp-", 5, "figure 5");
(function () {
  var i, bad = [];
  for (i = 0; i < 5; i++) {
    if (REG["lf-" + i].textContent.indexOf(String(i + 1)) !== 0) {
      bad.push("moment " + (i + 1) + " is labelled " + REG["lf-" + i].textContent);
    }
  }
  chk("the five moments are numbered 1 to 5 in order", bad.join("; "), "");
}());
REG["lf-0"].fire("click");
chk("creating a grant allocates nothing",
    REG["lfp-0"].textContent.indexOf("No memory anywhere") > -1, true);
REG["lf-1"].fire("click");
chk("a table entry uses null as the flag, not the driver number",
    REG["lfp-1"].textContent.indexOf("zero is a real driver number") > -1, true);
REG["lf-2"].fire("click");
chk("first use is the only moment the region shrinks",
    REG["lfp-2"].textContent.indexOf("the only moment in the five where the region gets smaller") > -1, true);
REG["lf-3"].fire("click");
chk("and every use after the first allocates nothing",
    REG["lfp-3"].textContent.indexOf("allocates once") > -1, true);
REG["lf-4"].fire("click");
chk("a restart is the only refund",
    REG["lfp-4"].textContent.indexOf("the only refund in this chapter") > -1, true);
// Chapter 6 said a running process could never lower that mark. This chapter
// is where the exception lives, and the two have to agree.
chk("and it says which chapter 6 claim it qualifies",
    REG["lfp-4"].textContent.indexOf("could never lower comes down with them") > -1, true);
REG["lf-0"].fire("click");

// ---- Figure 6: two numbers to a mutable reference ----
walk("ch-", "chp-", 4, "figure 6");
REG["ch-0"].fire("click");
chk("what a capsule holds refers to no memory",
    REG["chp-0"].textContent.indexOf("refers to no memory") > -1, true);
REG["ch-1"].fire("click");
chk("the middle step is where allocation can happen",
    REG["chp-1"].textContent.indexOf("where allocation can happen") > -1, true);
REG["ch-3"].fire("click");
chk("closing happens by a value going out of scope",
    REG["chp-3"].textContent.indexOf("going out of scope") > -1, true);
chk("and the section says why that matters",
    REG["enterline"].textContent.indexOf("even on an early return") > -1, true);
chk("the note ties the borrow back to chapter 3's rule",
    REG["ch-note"].textContent.indexOf("reaches what it is handed, for as long as it is handed it") > -1, true);
REG["ch-0"].fire("click");

// ---- Figure 7: three refusals ----
walk("rf-", "rfp-", 3, "figure 7");
(function () {
  // One of the three stops the board and two come back as values. That split
  // is the figure's whole point, so it is counted rather than described.
  var i, fatal = 0;
  for (i = 0; i < 3; i++) {
    REG["rf-" + i].fire("click");
    if (REG["rfp-" + i].textContent.indexOf("Panic") === 0) { fatal++; }
  }
  chk("exactly one of the three refusals stops the board", fatal, 1);
}());
REG["rf-0"].fire("click");
chk("the panic is explained by the two references it would create",
    REG["rfp-0"].textContent.indexOf("Two mutable references to one object") > -1, true);
chk("and the loop's escape from it is named",
    REG["rfp-0"].textContent.indexOf("silently skips a grant that is already open") > -1, true);
chk("the note draws the same line chapter 6 drew",
    REG["rf-note"].textContent.indexOf("a fact about a process") > -1
      && REG["rf-note"].textContent.indexOf("a fact about the capsule's code") > -1, true);

// ---- Figure 8: three requests into one gap ----
walk("gp-", "gpp-", 3, "figure 8");
(function () {
  var GAP = [
    ["app_break", "up", "8 bytes"],
    ["neither", "nothing moves", "40 bytes"],
    ["neither", "nothing moves", "40 bytes"]
  ];
  var ids = ["gp-line", "gp-way", "gp-left"];
  var i, k, bad = [];
  for (i = 0; i < 3; i++) {
    REG["gp-" + i].fire("click");
    for (k = 0; k < 3; k++) {
      if (REG[ids[k]].textContent !== GAP[i][k]) {
        bad.push("request " + i + " " + ids[k] + " = " + REG[ids[k]].textContent);
      }
    }
  }
  chk("each request reads out which line moves and what is left", bad.join("; "), "");
  // 32 fits in 40 and 76 does not, which is the arithmetic the figure rests on.
  chk("and only the one that fits leaves a smaller gap",
      GAP[0][2] !== GAP[1][2] && GAP[1][2] === GAP[2][2], true);
}());
REG["gp-1"].fire("click");
chk("the refused grant comes back as an error, not a fault",
    REG["gpp-1"].textContent.indexOf("no-memory error") > -1, true);
REG["gp-2"].fire("click");
chk("and the process cannot see what consumed the gap",
    REG["gpp-2"].textContent.indexOf("no way to see the cause") > -1, true);
chk("the note says what the design buys instead",
    REG["gp-note"].textContent.indexOf("no other process on the board is any worse off") > -1, true);
REG["gp-0"].fire("click");

// ---- Figure 9: what the seven chapters took ----
walk("ar-", "arp-", 7, "figure 9");
(function () {
  // Seven rows, one per chapter, in order. A figure that closes a seven-part
  // series has to have seven parts.
  var WORDS = ["one", "two", "three", "four", "five", "six", "seven"];
  var i, bad = [];
  for (i = 0; i < 7; i++) {
    if (REG["ar-" + i].textContent.indexOf(WORDS[i]) !== 0) {
      bad.push("row " + i + " is labelled " + REG["ar-" + i].textContent);
    }
  }
  chk("the seven chapters are in order, one to seven", bad.join("; "), "");
}());
REG["ar-4"].fire("click");
chk("chapter 5 is named as the one the hardware enforces",
    REG["arp-4"].textContent.indexOf("The cut that is hardware") > -1, true);
// "Only one of the seven is enforced by hardware" left a reader arriving from
// chapter 6 with an obvious objection: svc is hardware too. The note answers
// it now rather than inviting it.
chk("and the note counts the hardware honestly",
    REG["ar-note"].textContent.indexOf("Notice how little of this is hardware") > -1, true);
chk("and says why chapter 6's instruction does not count as enforcement",
    REG["ar-note"].textContent.indexOf("it enforces nothing on its own") > -1, true);
chk("which is the answer the chapter closes on",
    REG["ar-note"].textContent.indexOf("nothing on the chip stops it, so people did") > -1, true);
REG["ar-0"].fire("click");

// ---- Check yourself ----
(function () {
  var i, hidden = 0, ids = ["qan", "qbn", "qcn", "qdn"];
  for (i = 0; i < 4; i++) {
    if (REG[ids[i]].classList.contains("is-off")) { hidden++; }
  }
  chk("all four answers are put away before anything is clicked", hidden, 4);
}());
(function () {
  var QUIZ = [["qa-", 1, "qan"], ["qb-", 0, "qbn"], ["qc-", 2, "qcn"], ["qd-", 0, "qdn"]];
  var i, bad = [], positions = [];
  for (i = 0; i < QUIZ.length; i++) {
    var prefix = QUIZ[i][0], right = QUIZ[i][1], answer = QUIZ[i][2];
    REG[prefix + right].fire("click");
    if (!REG[prefix + right].classList.contains("is-right")) {
      bad.push(prefix + right + " was not marked right");
    }
    if (REG[answer].classList.contains("is-off")) {
      bad.push(answer + " stayed hidden after a click");
    }
    positions.push(right);
  }
  chk("clicking the right option marks it and reveals the answer", bad.join("; "), "");
  chk("and the right answers are not all in one slot",
      positions[0] === positions[1] && positions[1] === positions[2]
        && positions[2] === positions[3], false);
  // Chapter 5's were 1,2,0,1 and chapter 6's 2,1,0,2. Repeating either would
  // be a pattern a reader could play across chapters rather than think through.
  chk("and the sequence is neither chapter 5's nor chapter 6's",
      positions.join("") !== "1201" && positions.join("") !== "2102", true);
}());
(function () {
  REG["qa-0"].fire("click");
  chk("a wrong click is marked wrong", REG["qa-0"].classList.contains("is-wrong"), true);
  chk("and the right option is marked anyway", REG["qa-1"].classList.contains("is-right"), true);
}());

// ---- What this chapter says about the other six ----
// A closing chapter summarises six chapters it cannot check by reading its own
// source files, and four of the seven panels were wrong on the first draft.
// Each of these pins the summary against what that chapter actually says.
(function () {
  REG["ar-1"].fire("click");
  // Chapter 2's headline is "The first instruction is never yours."
  chk("the chapter 2 panel does not say the chip fetches your first instruction",
      REG["arp-1"].textContent.indexOf("The first instruction is never yours") > -1, true);
  chk("and names the ROM that hunts for it",
      REG["arp-1"].textContent.indexOf("hunts through flash") > -1, true);
  REG["ar-2"].fire("click");
  // Chapter 3 credits a crate-level refusal and says outright that this is the
  // half the type system does not cover.
  chk("the chapter 3 panel credits the crate, not the type system",
      REG["arp-2"].textContent.indexOf("the crate it lives in will not compile") > -1, true);
  chk("and puts the refusal at build time",
      REG["arp-2"].textContent.indexOf("refused at build time") > -1, true);
  REG["ar-3"].fire("click");
  // Chapter 4's distinction is the compiler, and it spends a figure on the
  // header the kernel does check.
  chk("the chapter 4 panel says which tool never saw the code",
      REG["arp-3"].textContent.indexOf("the compiler behind the kernel never saw") > -1, true);
  chk("and does not claim the kernel checks nothing",
      REG["arp-3"].textContent.indexOf("sixteen bytes at the front") > -1, true);
  REG["ar-0"].fire("click");
  // Chapter 1's sentence, as chapter 1 has it, without the clause this chapter
  // had been adding to it.
  chk("chapter 1's sentence is quoted as chapter 1 has it",
      REG["closingq"].textContent.indexOf("everything Tock does is an answer to: any code can write any address") > -1, true);
}());

// ---- The claims no assertion reached ----
// Twelve ids were read by neither the script nor this suite, one of them a
// figure note. Each of these asserts what the anchor claims rather than that
// it exists, so a rewrite that drops the claim fails.
(function () {
  var CLAIMS = [
    ["needstate",  "two processes can be printing at once"],
    ["fourways",   "this kernel has ruled out three of them"],
    ["costline",   "its per-process state is four fields"],
    ["wasteline",  "Three of those seven slots are never touched"],
    ["lifeline",   "that object contains no memory at all"],
    ["reenter",    "It panics, and the board stops"],
    ["whypanic",   "two mutable references to the same bytes"],
    ["gapline",    "there is no separate pool for grants"],
    ["whofirst",   "which asks first"],
    ["closingq",   "Six chapters have been taking pieces out of"],
    ["wordcount",  "Chapter 4 defined a grant in one line"],
    ["lf-note",    "A driver installed on the board and never called by a process"]
  ];
  var i, missing = [];
  for (i = 0; i < CLAIMS.length; i++) {
    if (REG[CLAIMS[i][0]].textContent.indexOf(CLAIMS[i][1]) === -1) {
      missing.push(CLAIMS[i][0] + " no longer says " + CLAIMS[i][1]);
    }
  }
  chk("every anchored paragraph still makes the claim it was anchored for",
      missing.join("; "), "");
}());

// ---- What a process pays before it calls anything ----
// Figure 1 sold the design on "never pays for it" and figures 2 and 5 spend
// their length correcting that. The three have to agree now.
(function () {
  REG["wy-3"].fire("click");
  chk("figure 1 admits the fixed cost rather than denying it",
      REG["wyp-3"].textContent.indexOf("small fixed cost per driver") > -1, true);
  chk("figure 2's note is where it is priced",
      REG["bd-note"].textContent.indexOf("pays for a table entry per driver") > -1, true);
  chk("and figure 5's note gives the number",
      REG["lf-note"].textContent.indexOf("eight bytes and not one more") > -1, true);
}());

// ---- The debts, and the end of the series ----
// Eight forward promises across four chapters landed here. These check the
// sentences that pay the ones that named something specific.
chk("chapter 3's question is answered by name",
    REG["noalloc"].textContent.indexOf("never asks for memory it did not already have") > -1, true);
chk("chapter 4's downward movement is the one this chapter drives",
    REG["topdown"].textContent.indexOf("starts at the very top and moves downward as grants are handed out") > -1, true);
chk("chapter 5's fence is what puts the region out of reach",
    REG["fenceagain"].textContent.indexOf("outside the fence") > -1, true);
chk("chapter 6's two loose ends are the ones filed here",
    REG["chp-2"].textContent.indexOf("the filed function pointers and the filed buffers") > -1, true);
// The goals promise counts; each is checked against what delivers it.
chk("the goals promise a byte count and which bytes are wasted",
    REG["goalbox"].textContent.indexOf("which of those bytes are never used") > -1, true);
chk("the goals promise four moments and the one that refunds",
    REG["goalbox"].textContent.indexOf("the one that gives the memory back") > -1, true);
// The closing has to close the series, not hand on to a chapter 8.
chk("the closing says this is the last mechanism",
    REG["lastline"].textContent.indexOf("that is the last mechanism") > -1, true);
chk("and answers chapter 1 in chapter 1's own words",
    REG["lastline"].textContent.indexOf("nothing stops a store from landing anywhere") > -1, true);
(function () {
  var TERMS = ["allocator", "grant region", "grant number", "entering", "slot",
               "counters word", "custom grant", "bump"];
  var i, missing = [], text = REG["words"].textContent;
  for (i = 0; i < TERMS.length; i++) {
    if (text.indexOf(TERMS[i]) === -1) { missing.push(TERMS[i]); }
  }
  chk("every word the section promises is in the list", missing.join(", "), "");
  chk("and grant, which chapter 4 defined, is the first of them", text.indexOf("grant"), 0);
}());
