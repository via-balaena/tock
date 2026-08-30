// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Behavioural assertions for chapter 6, run by check.py under JavaScriptCore.

// Same helpers as chapters 3, 4 and 5: every figure here is one row of buttons
// and one row of panels sharing an index, built by one function. That is a
// single point of failure, so each figure is walked separately rather than once.
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
  var BETS = [["bet-upcall", 4], ["bet-mark", 4]];
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

// ---- No figure may boot empty ----
// Most readers never click, so a figure that opens on "choose something"
// teaches nothing. Checked first, because everything below moves these.
// Both of the first two figures used to open on yield, the class the chapter
// uses least. This one opens on the class its worked example is about.
chk("figure 1 opens on the command instruction", REG["sv-1"].getAttribute("aria-pressed"), "true");
chk("and not on the yield one", REG["sv-0"].getAttribute("aria-pressed"), "false");
chk("figure 2 opens on class zero", REG["cl-0"].getAttribute("aria-pressed"), "true");
chk("figure 3 opens on asking how many LEDs there are", REG["rq-0"].getAttribute("aria-pressed"), "true");
chk("figure 4 opens on command", REG["tm-0"].getAttribute("aria-pressed"), "true");
chk("figure 5 opens on a plain success", REG["rt-0"].getAttribute("aria-pressed"), "true");
chk("figure 6 opens on the driver's first move", REG["uc-0"].getAttribute("aria-pressed"), "true");
chk("figure 7 opens on the first word of the frame", REG["fr-0"].getAttribute("aria-pressed"), "true");
chk("figure 8 opens on an offer the kernel may write", REG["ab-rw"].getAttribute("aria-pressed"), "true");
chk("figure 9 opens on the class that does not exist", REG["rf-0"].getAttribute("aria-pressed"), "true");
chk("and every one of those has its panel open",
    REG["svp-1"].classList.contains("is-on")
      && REG["clp-0"].classList.contains("is-on")
      && REG["rqp-0"].classList.contains("is-on")
      && REG["tmp-0"].classList.contains("is-on")
      && REG["rtp-0"].classList.contains("is-on")
      && REG["ucp-0"].classList.contains("is-on")
      && REG["frp-0"].classList.contains("is-on")
      && REG["abp-ram"].classList.contains("is-on")
      && REG["rfp-0"].classList.contains("is-on"), true);

// ---- Figure 1: one instruction, and the number inside it ----
walk("sv-", "svp-", 5, "figure 1");

// The readout is the whole point of this figure, so it is derived here rather
// than compared against a copy of itself: svc N assembles to 0xDF00 with N in
// the low byte, which is what the assembler produced in syscall-demo.s. If the
// table in the page ever drifts from that rule, this fails.
(function () {
  var i, bad = [];
  for (i = 0; i < 5; i++) {
    REG["sv-" + i].fire("click");
    var label = REG["sv-" + i].textContent;          // "svc 0" .. "svc 255"
    var arg = parseInt(label.replace(/[^0-9]/g, ""), 10);
    var word = REG["sv-word"].textContent;
    var shown = REG["sv-num"].textContent;
    var expect = "0xDF" + (arg < 16 ? "0" : "") + arg.toString(16).toUpperCase();
    if (word !== expect) { bad.push(label + " reads " + word + ", not " + expect); }
    if (shown !== String(arg)) { bad.push(label + " says its number is " + shown); }
  }
  chk("every halfword is 0xDF00 plus the number in the instruction", bad.join("; "), "");
}());

REG["sv-3"].fire("click");
chk("class eight decodes to nothing", REG["sv-cls"].textContent, "nothing at all");
chk("and its panel says what that costs the process",
    REG["svp-3"].textContent.indexOf("ends the process") > -1, true);
REG["sv-4"].fire("click");
chk("the kernel's own instruction carries a number nothing reads",
    REG["sv-cls"].textContent, "not read");
chk("and its panel says which bit sorts the two directions apart",
    REG["svp-4"].textContent.indexOf("link register") > -1, true);
// The claim the chapter's opening rests on: a process cannot corrupt which
// kind of request it is making, because the number is not in a register.
chk("the note says where the class number is not",
    REG["sv-note"].textContent.indexOf("not in a register") > -1, true);
REG["sv-0"].fire("click");

// ---- Figure 2: eight classes ----
walk("cl-", "clp-", 8, "figure 2");
(function () {
  var i, bad = [];
  for (i = 0; i < 8; i++) {
    // The left column is the number that goes in the instruction, so it has
    // to be the index. A figure whose numbering did not run 0 to 7 would be
    // teaching a different ABI.
    if (REG["cl-" + i].textContent.indexOf(String(i)) !== 0) {
      bad.push("class " + i + " is labelled " + REG["cl-" + i].textContent);
    }
  }
  chk("the eight classes are numbered 0 to 7 in order", bad.join("; "), "");
}());
(function () {
  // Three never leave the core kernel: yield, memop and exit. Five begin with
  // a driver number. That split is the chapter's own claim two paragraphs up,
  // so it is counted here rather than asserted panel by panel.
  var i, core = 0, driver = 0;
  for (i = 0; i < 8; i++) {
    REG["cl-" + i].fire("click");
    var t = REG["clp-" + i].textContent;
    if (t.indexOf("core kernel") > -1) { core++; }
    if (t.indexOf("names a driver") > -1 || t.indexOf("It names a driver") > -1) { driver++; }
  }
  chk("three classes are answered inside the core kernel", core, 3);
  chk("and the prose above claims the same three",
      REG["fiveline"].textContent.indexOf("The other three never leave the core kernel") > -1, true);
  chk("and the prose claims five begin with a driver number",
      REG["fiveline"].textContent.indexOf("Five of the eight begin with a driver number") > -1, true);
  chk("the driver-bearing panels do not contradict that", driver > 0, true);
}());
REG["cl-2"].fire("click");
chk("the command panel quotes the one line that reaches a driver",
    REG["clp-2"].textContent.indexOf("d.command(subdriver_number, arg0, arg1, process.processid())") > -1, true);
REG["cl-4"].fire("click");
chk("the read-only panel is where flash is allowed",
    REG["clp-4"].textContent.indexOf("flash") > -1, true);
REG["cl-5"].fire("click");
chk("memop counts twelve operations", REG["clp-5"].textContent.indexOf("0 to 11") > -1, true);
REG["cl-0"].fire("click");
// The stale count in the kernel's own module documentation. The chapter opens
// on it, so it must still say so.
chk("the section says the file's own opening line disagrees with its enum",
    REG["eightline"].textContent.indexOf("Tock supports six system calls") > -1, true);
chk("and lands on eight", REG["eightline"].textContent.indexOf("Eight is the number") > -1, true);

// ---- Figure 3: one class, four requests ----
walk("rq-", "rqp-", 4, "figure 3");
(function () {
  var REQ = [
    ["0x00002", "0", "0", "0"],
    ["0x00002", "1", "0", "0"],
    ["0x00002", "1", "1", "0"],
    ["0x00003", "0", "0", "0"]
  ];
  var ids = ["rq-r0", "rq-r1", "rq-r2", "rq-r3"];
  var i, k, bad = [];
  for (i = 0; i < 4; i++) {
    REG["rq-" + i].fire("click");
    for (k = 0; k < 4; k++) {
      if (REG[ids[k]].textContent !== REQ[i][k]) {
        bad.push("request " + i + " " + ids[k] + " = " + REG[ids[k]].textContent);
      }
    }
  }
  chk("each request fills the four registers as the ABI says", bad.join("; "), "");
}());
(function () {
  // Three requests go to the LED driver and one to a driver this board has
  // not got. Only r0 separates the last from the first, which is the figure's
  // argument: the class is constant and the registers carry everything else.
  var i, led = 0;
  for (i = 0; i < 4; i++) {
    REG["rq-" + i].fire("click");
    if (REG["rq-r0"].textContent === "0x00002") { led++; }
  }
  chk("three of the four requests name the LED driver", led, 3);
}());
REG["rq-2"].fire("click");
chk("asking for LED 1 on a one-LED board is refused by the driver",
    REG["rqp-2"].textContent.indexOf("out of range") > -1, true);
REG["rq-3"].fire("click");
chk("and driver 3 is refused before any driver is reached",
    REG["rqp-3"].textContent.indexOf("no driver is consulted") > -1, true);
chk("the panel names the five drivers this board does have",
    REG["rqp-3"].textContent.indexOf("five numbers") > -1, true);
REG["rq-0"].fire("click");

// The listing above the figure is assembler output, and the class byte in it
// has to be the same one figure 1 decodes for svc 2.
// The shim collapses runs of whitespace the way a text node reads, so the
// listing's columns arrive as single spaces.
chk("the listing sends class 2", REG["ledasm"].textContent.indexOf("df02 svc 2") > -1, true);
chk("and loads the LED driver's number first",
    REG["ledasm"].textContent.indexOf("2002 movs r0, #2") > -1, true);
chk("the prose counts the bytes of it", REG["ledtwelve"].textContent.indexOf("Twelve bytes") > -1, true);
// The 02 in `2002` is the driver number, which on this board is also 2. A
// listing that shows the same byte twice for different reasons has to say so.
chk("and names the byte that is the class",
    REG["ledtwelve"].textContent.indexOf("the 02 is the class") > -1, true);
chk("and disowns the other 02 in the listing",
    REG["ledtwelve"].textContent.indexOf("have nothing to do with each other") > -1, true);
// Chapter 3's debt. It left this request at the boundary by name.
chk("the section says which chapter left this request unfinished",
    REG["ledline"].textContent.indexOf("Chapter 3 left a request half-finished") > -1, true);
chk("and the board note says what a wireless board does instead",
    REG["ledboard"].textContent.indexOf("chip-select line") > -1, true);

// ---- Figure 4: what a driver implements ----
walk("tm-", "tmp-", 3, "figure 4");
REG["tm-0"].fire("click");
chk("the command panel says what a driver may answer with",
    REG["tmp-0"].textContent.indexOf("success") > -1
      && REG["tmp-0"].textContent.indexOf("failure carrying an error") > -1, true);
REG["tm-2"].fire("click");
chk("the third method is the one with no default",
    REG["tmp-2"].textContent.indexOf("no default") > -1, true);
chk("and is named as not a request", REG["tmp-2"].textContent.indexOf("Not a request") > -1, true);
// The finding this figure exists for: five classes name a driver and there is
// no method for three of them.
chk("the note says which two methods are absent",
    REG["tm-note"].textContent.indexOf("no subscribe method and no read-write allow method") > -1, true);
chk("and ties it back to chapter 3's rule",
    REG["tm-note"].textContent.indexOf("only what it was handed") > -1, true);
REG["tm-0"].fire("click");

// ---- Figure 5: the answer in the same four words ----
walk("rt-", "rtp-", 5, "figure 5");
(function () {
  // Failures are numbered from 0 and successes from 128, which is the one fact
  // a process needs to sort them. Derived from the button's own name rather
  // than restated, so a table edited on one side fails here.
  var i, bad = [];
  for (i = 0; i < 5; i++) {
    REG["rt-" + i].fire("click");
    var name = REG["rt-" + i].textContent;
    var code = parseInt(REG["rt-r0"].textContent, 10);
    var isSuccess = name.indexOf("Success") === 0;
    if (isSuccess && code < 128) { bad.push(name + " is " + code); }
    if (!isSuccess && code >= 128) { bad.push(name + " is " + code); }
  }
  chk("every success is 128 or above and every failure below it", bad.join("; "), "");
}());
(function () {
  // The kernel writes only the registers a shape needs. A plain success writes
  // one of the four; the widest success writes all four.
  var i, counts = [];
  var ids = ["rt-r1", "rt-r2", "rt-r3"];
  for (i = 0; i < 5; i++) {
    REG["rt-" + i].fire("click");
    var untouched = 0, k;
    for (k = 0; k < 3; k++) {
      if (REG[ids[k]].textContent === "untouched") { untouched++; }
    }
    counts.push(untouched);
  }
  chk("a plain success leaves three registers alone", counts[0], 3);
  chk("the widest success leaves none", counts[2], 0);
  chk("a plain failure leaves two", counts[3], 2);
}());
chk("the prose gives the bit that separates the two families",
    REG["firstword"].textContent.indexOf("every failure is numbered below 128") > -1, true);
chk("the note says what untouched actually holds",
    REG["rt-note"].textContent.indexOf("its own arguments") > -1, true);
chk("and marks it as an accident rather than a promise",
    REG["rt-note"].textContent.indexOf("accident of the encoding") > -1, true);
REG["rt-0"].fire("click");

// ---- Figure 6: delivering an upcall ----
// ---- Figure 6: the queue nothing drains on its own ----
// Two things surprise people here and both are things a list cannot show: a
// running process is never stopped to take one, so the queue only grows; and
// the eleventh event is dropped with nothing kept to retry from.
(function () {
  function q() {
    return [REG["q-wait"].textContent, REG["q-done"].textContent,
            REG["q-lost"].textContent].join("/");
  }
  REG["q-reset"].fire("click");
  chk("nothing waiting to begin with", q(), "0/0/0");

  var i;
  for (i = 0; i < 4; i++) { REG["q-event"].fire("click"); }
  chk("four events queue and none is delivered", q(), "4/0/0");
  chk("a part-full rack is not marked as brimming",
      REG["q-rack"].classList.contains("is-brimmed"), false);
  chk("because a running process is never stopped to take one",
      REG["qp-holding"].classList.contains("is-on"), true);

  REG["q-yield"].fire("click");
  chk("yielding delivers exactly one", q(), "3/1/0");
  chk("and dropping below the constant clears the mark",
      REG["q-rack"].classList.contains("is-brimmed"), false);
  chk("and says so", REG["qp-drain"].classList.contains("is-on"), true);

  // Fill it to the constant, then produce the eleventh.
  REG["q-reset"].fire("click");
  for (i = 0; i < 10; i++) { REG["q-event"].fire("click"); }
  chk("ten fill it", q(), "10/0/0");
  chk("and it says it is full", REG["qp-full"].classList.contains("is-on"), true);
  REG["q-event"].fire("click");
  chk("the eleventh is dropped rather than queued", q(), "10/0/1");
  chk("and the rack itself says it is at the constant",
      REG["q-rack"].classList.contains("is-brimmed"), true);
  chk("with nothing kept to retry from",
      REG["qp-lost"].textContent.indexOf("nothing here remembers it") > -1, true);

  // A process that never yields stays there.
  for (i = 0; i < 5; i++) { REG["q-event"].fire("click"); }
  chk("and a process that never yields keeps losing them", q(), "10/0/6");

  // Yielding on an empty queue delivers nothing and is not an error.
  REG["q-reset"].fire("click");
  REG["q-yield"].fire("click");
  chk("yielding with nothing waiting delivers nothing", q(), "0/0/0");

  // The queue never exceeds the constant, however it is driven.
  (function () {
    var seq = ["q-event", "q-event", "q-yield", "q-event", "q-yield",
               "q-yield", "q-yield"], k, r, bad = 0;
    REG["q-reset"].fire("click");
    for (r = 0; r < 4; r++) {
      for (k = 0; k < seq.length; k++) {
        REG[seq[k]].fire("click");
        if (parseInt(REG["q-wait"].textContent, 10) > 10) { bad++; }
        if (parseInt(REG["q-wait"].textContent, 10) < 0) { bad++; }
      }
    }
    chk("the queue stays between nothing and the constant", bad, 0);
  }());
  REG["q-reset"].fire("click");
}());

walk("uc-", "ucp-", 6, "figure 6");
(function () {
  // Six numbered steps, in order, and step four is deliberately the one with
  // no source line: nothing happens there.
  var i, bad = [];
  for (i = 0; i < 6; i++) {
    if (REG["uc-" + i].textContent.indexOf(String(i + 1)) !== 0) {
      bad.push("step " + (i + 1) + " is labelled " + REG["uc-" + i].textContent);
    }
  }
  chk("the six steps are numbered 1 to 6 in order", bad.join("; "), "");
}());
REG["uc-1"].fire("click");
chk("the fourth value is the word the process passed at subscribe time",
    REG["ucp-1"].textContent.indexOf("passed a word of its own") > -1, true);
chk("and the driver is not told about it",
    REG["ucp-1"].textContent.indexOf("driver was never told") > -1, true);
REG["uc-2"].fire("click");
chk("the queue holds ten", REG["ucp-2"].textContent.indexOf("Ten slots") > -1, true);
chk("and a full one drops rather than blocking",
    REG["ucp-2"].textContent.indexOf("does not block and does not fault") > -1, true);
REG["uc-3"].fire("click");
chk("step four is the one where nothing happens", REG["uc-3"].textContent.indexOf("Nothing happens") > -1, true);
chk("because a running process is never stopped to take a call",
    REG["ucp-3"].textContent.indexOf("never stopped to take one of these") > -1, true);
REG["uc-4"].fire("click");
chk("one note is taken per yield", REG["ucp-4"].textContent.indexOf("exactly one") > -1, true);
chk("and the glossary's claim about never yielding is made good here",
    REG["ucp-4"].textContent.indexOf("never yields never receives anything") > -1, true);
chk("the section names the constant chapter 4 found",
    REG["queueline"].textContent.indexOf("room for ten of them") > -1, true);
REG["uc-0"].fire("click");

// ---- Figure 7: eight words of the frame ----
// ---- Figure 7: one frame, three jobs ----
// The note's claim is countable: none of the eight written going out, up to
// four coming back, and seven of the eight to deliver a call -- every one but
// the word the interface ignores. Counted here rather than asserted there.
(function () {
  function written() {
    var i, n = 0;
    for (i = 0; i < 8; i++) {
      if (REG["fr-" + i].classList.contains("is-written")) { n++; }
    }
    return n;
  }
  function holds(i) { return REG["fv-" + i].textContent; }

  REG["fm-out"].fire("click");
  chk("going out, the kernel writes none of the eight", written(), 0);
  chk("and r0 is the driver number", holds(0), "driver number");

  REG["fm-back"].fire("click");
  chk("coming back it writes at most the first four", written(), 4);
  chk("and r0 becomes the shape of the answer", holds(0), "which shape");

  REG["fm-call"].fire("click");
  chk("carrying a callback it writes seven of the eight", written(), 7);
  chk("and the one left out is r12", REG["fr-4"].classList.contains("is-written"), false);
  chk("which is ignored in every job",
      [holds(4), (REG["fm-out"].fire("click"), holds(4))].join(","), "ignored,ignored");

  // pc and lr are the trick, and only the callback job touches them.
  REG["fm-call"].fire("click");
  chk("pc becomes the function", holds(6), "the function");
  chk("and lr the address after the svc", holds(5), "after the svc");
  REG["fm-back"].fire("click");
  chk("neither of which the answering job writes",
      REG["fr-5"].classList.contains("is-written")
        || REG["fr-6"].classList.contains("is-written"), false);

  // Every word says something for every job, and exactly one job is chosen.
  (function () {
    var J = ["out", "back", "call"], j, i, bad = 0, on;
    for (j = 0; j < J.length; j++) {
      REG["fm-" + J[j]].fire("click");
      for (i = 0; i < 8; i++) {
        if (holds(i) === "") { bad++; }
      }
      on = 0;
      for (i = 0; i < J.length; i++) {
        if (REG["jw-" + J[i]].classList.contains("is-on")) { on++; }
      }
      if (on !== 1) { bad++; }
    }
    chk("every word holds something, and one job is chosen, in all three", bad, 0);
  }());
  REG["fm-out"].fire("click");
}());

walk("fr-", "frp-", 8, "figure 7");
(function () {
  // The frame is eight 32-bit words, so word i sits at offset 4i. Derived,
  // because a table of offsets typed out by hand is the sort of thing that
  // drifts by one.
  var i, bad = [];
  for (i = 0; i < 8; i++) {
    var want = "+" + (i * 4);
    if (REG["fr-" + i].textContent.indexOf(want) !== 0) {
      bad.push("word " + i + " is labelled " + REG["fr-" + i].textContent);
    }
  }
  chk("the eight words sit at four-byte intervals from zero", bad.join("; "), "");
}());
(function () {
  // Every one of the first four words does three jobs, and the panels say so
  // in the same three-part shape. r12 is the exception, and says so.
  var i, three = 0;
  for (i = 0; i < 4; i++) {
    REG["fr-" + i].fire("click");
    var t = REG["frp-" + i].textContent;
    if (t.indexOf("Going out:") > -1 && t.indexOf("Coming back:") > -1
        && t.indexOf("Carrying a callback:") > -1) { three++; }
  }
  chk("all four argument words carry three meanings", three, 4);
}());
REG["fr-4"].fire("click");
chk("r12 is pushed and ignored, in the source's own words",
    REG["frp-4"].textContent.indexOf("which the syscall interface ignores") > -1, true);
REG["fr-6"].fire("click");
chk("the program counter is where the trick happens",
    REG["frp-6"].textContent.indexOf("the whole of the trick") > -1, true);
REG["fr-5"].fire("click");
chk("and the link register is where the process comes back to",
    REG["frp-5"].textContent.indexOf("just after the") > -1, true);
chk("the section quotes the comment that names the trick",
    REG["blline"].textContent.indexOf("converts svc into bl callback") > -1, true);
chk("and explains the low bit rather than pointing at an earlier chapter",
    REG["thumbline"].textContent.indexOf("called Thumb") > -1, true);
REG["fr-0"].fire("click");

// ---- Figure 8: the allow bench ----
// The bench computes the source's own arithmetic, so what is worth asserting
// is that each comparison fails on its own and that the mark only climbs.
(function () {
  function set(startU, lenU) {
    REG["ab-start"].value = String(startU); REG["ab-start"].fire("input");
    REG["ab-len"].value = String(lenU); REG["ab-len"].fire("input");
  }
  function out() { return REG["ab-out"].textContent; }
  function open_() {
    var SAY = ["ram", "flash", "zero", "rwflash", "ceiling", "floor"], i, on = [];
    for (i = 0; i < SAY.length; i++) {
      if (REG["abp-" + SAY[i]].classList.contains("is-on")) { on.push(SAY[i]); }
    }
    return on.join("+");
  }
  function row(id) { return REG[id].textContent; }

  REG["ab-reset"].fire("click");
  REG["ab-rw"].fire("click");

  // Squarely inside the process's own memory: all three comparisons hold.
  set(30, 4);
  chk("a run inside its own memory is accepted", out(), "accepted, its memory");
  chk("and all three comparisons hold",
      [row("ab-r1"), row("ab-r2"), row("ab-r3")].join(","), "yes,yes,yes");
  chk("and the panel is the ordinary one", open_(), "ram");

  // Same start, long enough to pass the break: only the ceiling fails.
  set(30, 12);
  chk("running past the break is refused", out(), "refused");
  chk("and the ceiling is the only comparison that failed",
      [row("ab-r1"), row("ab-r2"), row("ab-r3")].join(","), "yes,yes,no");
  chk("and the refusal is named as arithmetic, not the fence",
      REG["abp-ceiling"].textContent.indexOf("arithmetic on two pointers") > -1, true);

  // Below the start of its memory: only the floor fails.
  set(17, 2);
  chk("starting below its memory is refused", out(), "refused");
  chk("and the floor is the only comparison that failed",
      [row("ab-r1"), row("ab-r2"), row("ab-r3")].join(","), "yes,no,yes");
  chk("and it says so", open_(), "floor");

  // Flash, which turns entirely on what the kernel may do with it.
  set(6, 4);
  chk("a flash address offered for writing is refused", out(), "refused");
  chk("and the flash comparisons were never asked",
      [row("ab-f1"), row("ab-f2"), row("ab-f3")].join(","),
      "not asked,not asked,not asked");
  REG["ab-ro"].fire("click");
  chk("the same run offered read-only is accepted", out(), "accepted, its flash");
  chk("and now the flash comparisons are the ones that hold",
      [row("ab-f1"), row("ab-f2"), row("ab-f3")].join(","), "yes,yes,yes");
  chk("while its memory still refuses it", row("ab-r2"), "no");
  chk("which is the read-only panel", open_(), "flash");

  // The protected header is below the flash floor even read-only.
  set(1, 2);
  chk("the protected header is below the flash floor too", out(), "refused");
  chk("and both floors say no",
      [row("ab-r2"), row("ab-f2")].join(","), "no,no");

  // The comparisons are <= and >=, so the only settings that tell a correct
  // bench from a nearly-correct one are the ones sitting exactly on a bound.
  REG["ab-rw"].fire("click");
  set(32, 4);
  chk("a run ending exactly at the break is accepted",
      REG["ab-run"].textContent + " " + out(),
      "0x20008300 to 0x20008400 accepted, its memory");
  set(33, 4);
  chk("and one ending a single step past it is not",
      REG["ab-run"].textContent + " " + out(),
      "0x20008340 to 0x20008440 refused");
  set(20, 1);
  chk("a run starting exactly at the floor is accepted",
      REG["ab-start-v"].textContent + " " + out(), "0x20008000 accepted, its memory");
  set(19, 1);
  chk("and one starting a single step below it is not",
      REG["ab-start-v"].textContent + " " + out(), "0x20007fc0 refused");
  REG["ab-ro"].fire("click");
  set(12, 4);
  chk("the same two bounds hold for flash, at its end",
      REG["ab-run"].textContent + " " + out(),
      "0x10020300 to 0x10020400 accepted, its flash");
  set(13, 4);
  chk("and a step past the end of flash is refused",
      REG["ab-run"].textContent + " " + out(),
      "0x10020340 to 0x10020440 refused");
  set(4, 1);
  chk("and at the first byte the header does not protect",
      REG["ab-start-v"].textContent + " " + out(), "0x10020100 accepted, its flash");
  set(3, 1);
  chk("with the byte below it refused",
      REG["ab-start-v"].textContent + " " + out(), "0x100200c0 refused");
  REG["ab-rw"].fire("click");

  // Length zero: accepted at any address, with nothing asked.
  set(1, 0);
  chk("a length of zero is accepted at an address nothing else would take",
      out(), "accepted, no check");
  chk("with not one of the six comparisons made",
      [row("ab-r1"), row("ab-r2"), row("ab-r3"),
       row("ab-f1"), row("ab-f2"), row("ab-f3")].join(","),
      "not asked,not asked,not asked,not asked,not asked,not asked");
  chk("and the bench says why a row it cannot fail is still shown",
      REG["ab-foot"].textContent.indexOf("cannot be made to fail here") > -1, true);
  chk("and the run reads as empty rather than as a span",
      REG["ab-run"].textContent.indexOf("empty") > -1, true);
  REG["ab-rw"].fire("click");
  set(40, 0);
  chk("and past the break as well", out(), "accepted, no check");

  // The mark. It starts at the floor, climbs on a RAM acceptance, and the
  // point of the whole figure is that nothing here brings it back down.
  REG["ab-reset"].fire("click");
  chk("the mark starts at the floor of its memory", row("ab-mark-v"), "0x20008000");
  set(22, 4);
  REG["ab-offer"].fire("click");
  chk("an accepted offer moves the mark to its far end", row("ab-mark-v"), "0x20008180");
  set(20, 1);
  REG["ab-offer"].fire("click");
  chk("a lower offer, also accepted, does not bring it back down",
      row("ab-mark-v"), "0x20008180");
  set(30, 12);
  REG["ab-offer"].fire("click");
  chk("and a refused offer does not move it at all", row("ab-mark-v"), "0x20008180");
  REG["ab-ro"].fire("click");
  set(6, 4);
  REG["ab-offer"].fire("click");
  chk("nor does one accepted in flash, which the break cannot reach",
      row("ab-mark-v"), "0x20008180");
  REG["ab-reset"].fire("click");
  chk("only a restart puts it back", row("ab-mark-v"), "0x20008000");

  // Exactly one sentence is showing, whatever the bench is set to.
  (function () {
    var u, n, bad = 0;
    REG["ab-rw"].fire("click");
    for (u = 0; u <= 43; u += 3) {
      for (n = 0; n <= 12; n += 2) {
        set(u, n);
        if (open_().indexOf("+") > -1 || open_() === "") { bad++; }
      }
    }
    REG["ab-ro"].fire("click");
    for (u = 0; u <= 43; u += 3) {
      for (n = 0; n <= 12; n += 2) {
        set(u, n);
        if (open_().indexOf("+") > -1 || open_() === "") { bad++; }
      }
    }
    chk("one sentence is showing at every setting of the bench", bad, 0);
  }());

  REG["ab-rw"].fire("click");
  set(22, 4);
}());
chk("the section says what the class actually buys",
    REG["consentline"].textContent.indexOf("a record of consent") > -1, true);
chk("and that the two bounds are the ones the region was built from",
    REG["checkline"].textContent.indexOf("start at or after the start of the process's memory") > -1, true);
// The mark does come down, once: a restart rebuilds the layout. The chapter
// documented the exit variant that gets there and still said "ever".
chk("the note scopes the mark to a running process",
    REG["bf-note"].textContent.indexOf("nothing a running process can do lowers that line") > -1, true);
chk("and names the one thing that clears it",
    REG["bf-note"].textContent.indexOf("the restart variant of exit") > -1, true);

// ---- Figure 9: three refusals ----
walk("rf-", "rfp-", 3, "figure 9");
(function () {
  // Two of the three end the process and one is answered. That asymmetry is
  // the figure's whole point, so it is counted rather than described.
  var i, stopped = 0;
  for (i = 0; i < 3; i++) {
    REG["rf-" + i].fire("click");
    if (REG["rfp-" + i].textContent.indexOf("stopped") > -1) { stopped++; }
  }
  chk("two of the three refusals stop the process", stopped, 2);
}());
REG["rf-2"].fire("click");
chk("the third is answered and the process keeps running",
    REG["rfp-2"].textContent.indexOf("keeps running") > -1, true);
chk("the note draws the line between the two kinds",
    REG["rf-note"].textContent.indexOf("cannot parse") > -1
      && REG["rf-note"].textContent.indexOf("cannot satisfy") > -1, true);
chk("and names exit as the same shape",
    REG["rf-note"].textContent.indexOf("Exit is the same shape") > -1, true);
REG["rf-0"].fire("click");

// ---- Check yourself ----
// Nothing is revealed before the reader commits, and the right answer is not
// in the same slot every time.
(function () {
  var i, hidden = 0, ids = ["qan", "qbn", "qcn", "qdn"];
  for (i = 0; i < 4; i++) {
    if (REG[ids[i]].classList.contains("is-off")) { hidden++; }
  }
  chk("all four answers are put away before anything is clicked", hidden, 4);
}());
(function () {
  var QUIZ = [["qa-", 2, "qan"], ["qb-", 1, "qbn"], ["qc-", 0, "qcn"], ["qd-", 2, "qdn"]];
  var i, k, bad = [], positions = [];
  for (i = 0; i < QUIZ.length; i++) {
    var prefix = QUIZ[i][0], right = QUIZ[i][1], answer = QUIZ[i][2];
    REG[prefix + right].fire("click");
    if (!REG[prefix + right].classList.contains("is-right")) {
      bad.push(prefix + right + " was not marked right");
    }
    if (REG[prefix + right].classList.contains("is-wrong")) {
      bad.push(prefix + right + " was marked wrong as well");
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
  chk("the middle slot is not the answer more than once",
      (positions[0] === 1 ? 1 : 0) + (positions[1] === 1 ? 1 : 0)
        + (positions[2] === 1 ? 1 : 0) + (positions[3] === 1 ? 1 : 0), 1);
}());
(function () {
  // A wrong click has to be marked wrong and the right one still shown.
  REG["qc-2"].fire("click");
  chk("a wrong click is marked wrong", REG["qc-2"].classList.contains("is-wrong"), true);
  chk("and the right option is marked anyway", REG["qc-0"].classList.contains("is-right"), true);
}());

// ---- What the chapter owes, and what it says it will do ----
// The goals box promises counts. Each one is checked against the figure that
// is supposed to keep it, because a goal is written before the figures move.
chk("the first goal promises where the class number is kept",
    REG["goalbox"].textContent.indexOf("where the number picking a syscall class is kept") > -1, true);
// "two reach" flatly contradicted the closing's "exactly one ... in the
// ordinary case"; "can reach" is what makes both true at once.
chk("the second goal promises three classes and two that can reach code",
    REG["goalbox"].textContent.indexOf("which three never reach a driver and which two can reach a line of its code") > -1, true);
chk("and the closing says how many do in practice",
    REG["closing"].textContent.indexOf("exactly one reaches a line of that capsule's own code") > -1, true);
chk("figure 4 has exactly the two methods that are requests",
    REG["tm-0"].textContent + "/" + REG["tm-1"].textContent, "command/allow_userspace_readable");
chk("the third goal promises four registers", REG["goalbox"].textContent.indexOf("four registers") > -1, true);
chk("the fourth goal promises a named queue",
    REG["goalbox"].textContent.indexOf("naming the queue it waited in") > -1, true);
// Chapter 4 was told this chapter would say what fills its queue, and chapter
// 3 that the crossing would be here. Both are load-bearing for the ledger.
chk("the chapter says what puts things in chapter 4's queue",
    REG["queueline"].textContent.indexOf("This is what fills it") > -1, true);
chk("and hands the reader on to grants",
    REG["lastline"].textContent.indexOf("last mechanism this series has left") > -1, true);
// ---- The claims a review pass had to correct once ----
// Each of these was wrong on the page at some point, so each is pinned here.
// Written as what the page says rather than as what changed: this suite is
// what a later pass reads to decide what is already covered, and a
// description dated to one afternoon tells that reader nothing.
(function () {
  var g = REG["words"].textContent;
  // `word` was used twenty times in two senses and no chapter had defined it.
  chk("the glossary says what a word is", g.indexOf("Four bytes") > -1, true);
  chk("and which sense the list itself is using",
      g.indexOf("in the ordinary sense") > -1, true);
  // The frame entry claimed everything a request carries travels in it, which
  // is what figure 1's note exists to deny.
  chk("the frame entry excepts the one thing that is not in it",
      g.indexOf("Which kind of request it is does not") > -1, true);
  chk("and figure 1's note is the other half of that",
      REG["sv-note"].textContent.indexOf("not in a register") > -1, true);
  // A subscribed upcall is not one-shot.
  chk("a subscribed pointer is not one-shot",
      g.indexOf("keeps it until the process hands over another") > -1, true);
}());
(function () {
  // Two return shapes were illustrated with invented uses. One has a single
  // caller in the tree and one has none, and the page now says so.
  REG["rt-2"].fire("click");
  chk("the three-value success has one caller and the page names it",
      REG["rtp-2"].textContent.indexOf("One capsule in the tree returns it") > -1, true);
  chk("and says what that caller hands back",
      REG["rtp-2"].textContent.indexOf("three counters about a network device") > -1, true);
  REG["rt-4"].fire("click");
  chk("the failure-with-a-value shape is returned by no driver",
      REG["rtp-4"].textContent.indexOf("the unit test that checks it encodes correctly") > -1, true);
  chk("and the page says why the ABI carries it",
      REG["rtp-4"].textContent.indexOf("numbered from opposite ends") > -1, true);
  REG["rt-0"].fire("click");
}());
(function () {
  // `shape` is this chapter's coinage and now says so, and the specification's
  // own names for the two endings are on the page rather than only in a
  // source bullet.
  chk("shape is marked as the chapter's own word",
      REG["firstword"].textContent.indexOf("Shape is this chapter's word for it") > -1, true);
  chk("and the kernel's name for the same thing is given",
      REG["firstword"].textContent.indexOf("the kernel calls them variants") > -1, true);
  // The specification's reason for class 7 is cost, not simultaneity: a
  // process can already revoke, read and re-allow, and this class exists so
  // it need not pay a syscall to do it.
  REG["tm-1"].fire("click");
  chk("the shared-buffer class is explained by what it saves",
      REG["tmp-1"].textContent.indexOf("exists to save a syscall") > -1, true);
  chk("and by what a process would otherwise have to do",
      REG["tmp-1"].textContent.indexOf("revoke a buffer, read it and hand it back") > -1, true);
  // command takes four parameters and only two of them are data. The chapter
  // counted "arguments" three different ways before this was pinned.
  REG["tm-0"].fire("click");
  chk("the command panel counts parameters, not data words",
      REG["tmp-0"].textContent.indexOf("Four parameters in") > -1, true);
  chk("and says which of the four the two data words are",
      REG["tmp-0"].textContent.indexOf("two words of data, and which process is asking") > -1, true);
  chk("and the buffer section counts only the data",
      REG["bufline"].textContent.indexOf("two words of data and nothing more") > -1, true);
  REG["tm-0"].fire("click");
  // `allowed buffer` was in the glossary with a single use, in a sentence
  // written to satisfy the glossary-use gate. Four uses is a term earning it.
  (function () {
    var i, n = 0, ids = ["bufline", "abp-ram", "bf-note", "lastline"];
    for (i = 0; i < ids.length; i++) {
      if (REG[ids[i]].textContent.indexOf("allowed buffer") > -1) { n++; }
    }
    chk("the term the glossary defines is used where it is the precise one", n, 4);
  }());
  chk("the two endings carry the specification's names",
      REG["blline"].textContent.indexOf("Direct Resume") > -1
        && REG["blline"].textContent.indexOf("Pushed Callback") > -1, true);
}());
(function () {
  // One queued call, one word for it. The chapter used upcall, note and task
  // interchangeably before this pass.
  var i, stray = [];
  var ids = ["uc-0", "uc-1", "uc-2", "uc-3", "uc-4", "uc-5",
             "ucp-0", "ucp-1", "ucp-2", "ucp-3", "ucp-4", "ucp-5",
             "queueline", "uc-note", "qbn"];
  for (i = 0; i < ids.length; i++) {
    if (/\bnotes?\b/.test(REG[ids[i]].textContent)) { stray.push(ids[i]); }
  }
  chk("nothing in the upcall path calls an upcall a note", stray.join(", "), "");
}());

// ---- The claims no assertion reached ----
// Fifteen ids were read by neither the script nor this suite, three of them
// figure notes -- which is where each figure states its conclusion. Each of
// these asserts what the anchor claims, not that it exists, so a rewrite that
// drops the claim fails rather than passing on an empty string.
(function () {
  var CLAIMS = [
    ["doorline",   "can compute and do nothing else"],
    ["notaddr",    "a wrong pointer can reach by accident"],
    ["trapline",   "the exit is not an address at all"],
    ["classline",  "That number is the syscall class"],
    ["ledreq",     "Command number 1 means turn one on"],
    ["traitline",  "has three methods, and only two of them are requests"],
    ["threemeth",  "is not a request at all"],
    ["backline",   "There is no returning from a syscall in the ordinary sense"],
    ["splitline",  "no amount of waiting inside a driver will make that sooner"],
    ["twoparts",   "a request that cannot finish is split in two"],
    ["frameline",  "The exception frame is eight words"],
    ["refuseline", "A door that cannot refuse is a hole"],
    ["rq-note",    "fail in different places"],
    ["cl-note",    "the numbers do not group anything"],
    ["fr-note",    "the third writes seven"]
  ];
  var i, missing = [];
  for (i = 0; i < CLAIMS.length; i++) {
    if (REG[CLAIMS[i][0]].textContent.indexOf(CLAIMS[i][1]) === -1) {
      missing.push(CLAIMS[i][0] + " no longer says " + CLAIMS[i][1]);
    }
  }
  chk("every anchored paragraph still makes the claim it was anchored for",
      missing.join("; "), "");
  // The three figure notes are what this was really about: a note is where a
  // figure says what to take from it, and three of the nine had nothing.
  chk("and figure 2's note is one of the three that had nothing",
      REG["cl-note"].textContent.indexOf("record of what was needed when") > -1, true);
  chk("figure 3's note names where each of the two failures happens",
      REG["rq-note"].textContent.indexOf("before any driver code runs") > -1, true);
  chk("and figure 7's note counts the words each job writes",
      REG["fr-note"].textContent.indexOf("leaving out exactly the one the interface ignores") > -1, true);
}());

// The glossary says eleven words, and the lead sentence makes a claim about the
// order of them as well as the count.
(function () {
  var TERMS = ["syscall class", "svc", "exception frame", "driver number",
               "command", "subscribe", "allowed buffer", "yield", "upcall"];
  var i, missing = [], text = REG["words"].textContent;
  for (i = 0; i < TERMS.length; i++) {
    if (text.indexOf(TERMS[i]) === -1) { missing.push(TERMS[i]); }
  }
  chk("every word the section promises is in the list", missing.join(", "), "");
  chk("and syscall itself is the first of them", text.indexOf("syscall"), 0);
  // "the last is the only one describing traffic going the other way" -- so
  // upcall has to be last rather than merely present.
  chk("the one going the other way is last",
      text.lastIndexOf("upcall") > text.lastIndexOf("yield"), true);
  chk("the lead sentence is what makes that claim",
      REG["wordcount"].textContent
        .indexOf("the last is the only one describing traffic going the other way") > -1, true);
}());
