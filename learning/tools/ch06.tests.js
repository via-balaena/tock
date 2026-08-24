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

// ---- No figure may boot empty ----
// Most readers never click, so a figure that opens on "choose something"
// teaches nothing. Checked first, because everything below moves these.
chk("figure 1 opens on the yield instruction", REG["sv-0"].getAttribute("aria-pressed"), "true");
chk("figure 2 opens on class zero", REG["cl-0"].getAttribute("aria-pressed"), "true");
chk("figure 3 opens on asking how many LEDs there are", REG["rq-0"].getAttribute("aria-pressed"), "true");
chk("figure 4 opens on command", REG["tm-0"].getAttribute("aria-pressed"), "true");
chk("figure 5 opens on a plain success", REG["rt-0"].getAttribute("aria-pressed"), "true");
chk("figure 6 opens on the driver's first move", REG["uc-0"].getAttribute("aria-pressed"), "true");
chk("figure 7 opens on the first word of the frame", REG["fr-0"].getAttribute("aria-pressed"), "true");
chk("figure 8 opens on a buffer that is accepted", REG["bf-0"].getAttribute("aria-pressed"), "true");
chk("figure 9 opens on the class that does not exist", REG["rf-0"].getAttribute("aria-pressed"), "true");
chk("and every one of those has its panel open",
    REG["svp-0"].classList.contains("is-on")
      && REG["clp-0"].classList.contains("is-on")
      && REG["rqp-0"].classList.contains("is-on")
      && REG["tmp-0"].classList.contains("is-on")
      && REG["rtp-0"].classList.contains("is-on")
      && REG["ucp-0"].classList.contains("is-on")
      && REG["frp-0"].classList.contains("is-on")
      && REG["bfp-0"].classList.contains("is-on")
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

// ---- Figure 8: four buffers offered ----
walk("bf-", "bfp-", 4, "figure 8");
(function () {
  var BUF = [
    ["inside my memory", "start and break", "accepted"],
    ["past my break", "start and break", "refused"],
    ["inside my flash", "start and break, or flash", "accepted"],
    ["anywhere at all", "nothing is checked", "accepted"]
  ];
  var ids = ["bf-where", "bf-test", "bf-out"];
  var i, k, bad = [];
  for (i = 0; i < 4; i++) {
    REG["bf-" + i].fire("click");
    for (k = 0; k < 3; k++) {
      if (REG[ids[k]].textContent !== BUF[i][k]) {
        bad.push("offer " + i + " " + ids[k] + " = " + REG[ids[k]].textContent);
      }
    }
  }
  chk("each offer reads out where it points and what decided it", bad.join("; "), "");
}());
(function () {
  var i, accepted = 0;
  for (i = 0; i < 4; i++) {
    REG["bf-" + i].fire("click");
    if (REG["bf-out"].textContent === "accepted") { accepted++; }
  }
  chk("three of the four offers are accepted", accepted, 3);
}());
REG["bf-3"].fire("click");
chk("the zero-length offer is how a buffer is taken back",
    REG["bfp-3"].textContent.indexOf("takes a buffer back") > -1, true);
REG["bf-2"].fire("click");
chk("read-only is the flavour that may point into flash",
    REG["bfp-2"].textContent.indexOf("only because it is read-only") > -1, true);
REG["bf-1"].fire("click");
chk("and the refusal is arithmetic, not the fence from chapter 5",
    REG["bfp-1"].textContent.indexOf("arithmetic on two pointers") > -1, true);
chk("the section says what the class actually buys",
    REG["consentline"].textContent.indexOf("a record of consent") > -1, true);
chk("and that the two bounds are the ones the region was built from",
    REG["checkline"].textContent.indexOf("start at or after the start of the process's memory") > -1, true);
chk("the note says the mark never comes down",
    REG["bf-note"].textContent.indexOf("nothing lowers that mark") > -1, true);
REG["bf-0"].fire("click");

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
chk("the second goal promises three classes and two methods",
    REG["goalbox"].textContent.indexOf("which three never reach a driver and which two reach a line of its code") > -1, true);
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
// The glossary says ten words, and the lead sentence makes a claim about the
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
