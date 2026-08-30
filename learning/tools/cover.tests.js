// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Behavioural assertions for the cover, run by check.py under JavaScriptCore.
//
// This file exists because the cover's script used to reach elements with
// `querySelector`, which the shim refuses on purpose, so the front door of the
// series was the one page with nothing exercising it. The dependency map is
// also the one place where the reading order is stated as a structure rather
// than as prose, and a wrong edge there would be a wrong claim about the whole
// series with nothing to catch it.

var NEEDS = { 0: [], 1: [], 2: [1], 3: [1], 4: [1, 3], 5: [1],
              6: [5], 7: [5, 6], 8: [4, 5, 7] };

function state(n) {
  var node = REG["nd-" + n], out = [];
  if (node.classList.contains("is-done")) { out.push("done"); }
  if (node.classList.contains("is-open")) { out.push("open"); }
  return out.join(",");
}
function saying() {
  var S = ["none", "open", "shut", "done", "free"], i, on = [];
  for (i = 0; i < S.length; i++) {
    if (REG["mp-" + S[i]].classList.contains("is-on")) { on.push(S[i]); }
  }
  return on.join(",");
}
function readAll(list) {
  var i;
  for (i = 0; i <= 7; i++) {
    var want = list.indexOf(i) > -1;
    var is = REG["mark-" + i].getAttribute("aria-pressed") === "true";
    if (want !== is) { REG["mark-" + i].fire("click"); }
  }
}

// ---- What a reader with no JavaScript is shown ----
// The caption is a bordered block with a minimum height, so shipping it empty
// gave the front page an empty box under the map. The markup has to carry the
// state the script boots into, which is the same guard chapters 0 and 6 grew.
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
  var cls = shipped("mp-none");
  chk("the markup ships the caption the script opens on",
      cls === null ? "mp-none not found" : String(cls.indexOf("is-on") > -1),
      "true");
}());

// ---- The map agrees with the contents list ----
// data-needs on each entry, the chips a reader sees, and this graph are three
// hand-written copies of one fact. index_checks already pairs the first two;
// this pairs the third against the map the script actually draws.
(function () {
  var n, i, needs, missingEdge = [];
  for (n = 0; n <= 8; n++) {
    needs = NEEDS[n];
    for (i = 0; i < needs.length; i++) {
      if (!REG["eg-" + needs[i] + n]) { missingEdge.push(needs[i] + "->" + n); }
    }
  }
  chk("every dependency in the list is an edge in the map",
      missingEdge.join(","), "");
}());

// ---- Nothing read ----
readAll([]);
chk("with nothing read, only the two that stand on nothing are open",
    [state(0), state(1), state(2), state(3), state(4),
     state(5), state(6), state(7), state(8)].join("|"),
    "open|open|||||||");
chk("and the count says so", REG["mp-count"].textContent, "0 of 9 marked read");

// ---- Reading chapter 1 opens exactly what stands on it ----
readAll([1]);
chk("chapter 1 read", state(1), "done");
chk("which opens 2, 3 and 5, and nothing else",
    [state(2), state(3), state(4), state(5), state(6), state(7), state(8)].join("|"),
    "open|open||open|||");
chk("chapter 0 stays open, because it stands on nothing", state(0), "open");
chk("the edges out of 1 are now met",
    REG["eg-12"].classList.contains("is-met")
      && REG["eg-13"].classList.contains("is-met")
      && REG["eg-14"].classList.contains("is-met")
      && REG["eg-15"].classList.contains("is-met"), true);
chk("and an edge out of a chapter nobody has read is not",
    REG["eg-34"].classList.contains("is-met"), false);

// ---- The chapter with three prerequisites ----
readAll([1, 3, 4]);
chk("8 is still shut with 5 and 7 unread", state(8), "");
readAll([1, 3, 4, 5]);
chk("still shut: 7 is the one missing", state(8), "");
readAll([1, 3, 4, 5, 6, 7]);
chk("and opens once all three are behind you", state(8), "open");

// ---- The script's own copy of the graph ----
// The dependency list is written three times: data-needs on each card, the
// chips a reader sees, and NEEDS inside the page's script. index_checks pairs
// the first two. Nothing pinned the third -- the edge check above reads this
// file's copy, and the staged reads above only ever add prerequisites in one
// order, so dropping chapter 6 out of what chapter 7 needs changed no
// assertion at all. Removing one prerequisite at a time is what catches it,
// because it is the only arrangement where a missing entry has to show.
(function () {
  var n, i, k, needs, keep, shut = [], opened = [];
  for (n = 0; n <= 7; n++) {
    needs = NEEDS[n];
    for (i = 0; i < needs.length; i++) {
      keep = [];
      for (k = 0; k < needs.length; k++) {
        if (k !== i) { keep.push(needs[k]); }
      }
      readAll(keep);
      if (state(n) === "open") { shut.push(n + " without " + needs[i]); }
    }
    readAll(needs);
    if (needs.length && state(n) !== "open") { opened.push(String(n)); }
  }
  chk("a chapter stays shut while any one of its prerequisites is unread",
      shut.join(", "), "");
  chk("and opens as soon as all of them are read", opened.join(", "), "");
}());

// ---- What the caption says, and the numbers it writes ----
// 7 stands on 3, 4 and 6. Mark 4 read and the caption should name the other
// two and not that one -- which is the only way to see that it is listing what
// is *missing* rather than reprinting the dependency list.
readAll([1, 4]);
REG["nd-8"].fire("click");
chk("choosing a chapter you cannot start yet says so", saying(), "shut");
chk("and names the ones still to read, in order",
    REG["mp-needs"].textContent, " Still to read: 5, 7.");
chk("a prerequisite already read is not listed as missing",
    REG["mp-needs"].textContent.indexOf("4") > -1, false);

REG["nd-2"].fire("click");
chk("a chapter whose prerequisites are behind you reads as ready", saying(), "open");
chk("and nothing is listed as missing", REG["mp-needs"].textContent, "");

REG["nd-1"].fire("click");
chk("one you have read says that instead", saying(), "done");

REG["nd-0"].fire("click");
chk("and chapter 0 gets its own sentence, because it is optional",
    saying(), "free");

// ---- Exactly one sentence, in every combination the reader can reach ----
(function () {
  var n, bad = 0, sets = [[], [1], [1, 2], [1, 4], [1, 2, 3, 4, 5, 6],
                          [0, 1, 2, 3, 4, 5, 6, 7]];
  var i;
  for (i = 0; i < sets.length; i++) {
    readAll(sets[i]);
    for (n = 0; n <= 7; n++) {
      REG["nd-" + n].fire("click");
      if (saying().indexOf(",") > -1 || saying() === "") { bad++; }
    }
  }
  chk("one caption and only one, for every chapter in every state", bad, 0);
}());

// ---- A node is never both read and merely open ----
(function () {
  var n, i, bad = 0, sets = [[], [1], [1, 4], [1, 2, 3, 4, 5, 6, 7]];
  for (i = 0; i < sets.length; i++) {
    readAll(sets[i]);
    for (n = 0; n <= 7; n++) {
      if (state(n).indexOf(",") > -1) { bad++; }
    }
  }
  chk("done and open are never both set on one chapter", bad, 0);
}());

// ---- The controls are actually reachable ----
// Every mark button is `display: none` until the shelf carries `interactive`,
// so a rewrite that forgets the one line adding it hides all eight and takes
// the map's only input with them. The shim cannot see a CSS rule, so this is
// the only thing between that and a page where nothing can be marked.
chk("the shelf is switched on, or every mark button is invisible",
    REG["shelf"].classList.contains("interactive"), true);

// ---- Marking is a toggle, and the card follows the node ----
readAll([]);
REG["mark-3"].fire("click");
chk("marking read sets the button's own state",
    REG["mark-3"].getAttribute("aria-pressed"), "true");
chk("and the card in the list follows it",
    REG["entry-3"].classList.contains("read"), true);
chk("and so does the node", state(3), "done");
REG["mark-3"].fire("click");
chk("clicking again unmarks it",
    REG["mark-3"].getAttribute("aria-pressed"), "false");
chk("and the card follows that too",
    REG["entry-3"].classList.contains("read"), false);

// ---- Hovering a card is the same relation the map draws ----
readAll([]);
REG["entry-7"].fire("mouseenter");
chk("hovering a card chooses it", saying(), "shut");
chk("and lights the cards it stands on",
    REG["entry-5"].classList.contains("lit")
      && REG["entry-6"].classList.contains("lit"), true);
chk("and not one it does not",
    REG["entry-2"].classList.contains("lit"), false);

// ---- Keyboard reaches the map ----
readAll([]);
REG["nd-5"].fire("keydown", { key: "Enter" });
chk("Enter on a node chooses it", saying(), "shut");
chk("and the chosen node is the only tab stop",
    REG["nd-5"].getAttribute("tabindex"), "0");
chk("with the rest taken out of the order",
    REG["nd-1"].getAttribute("tabindex"), "-1");

report();
