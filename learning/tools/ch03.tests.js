// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Behavioural assertions for chapter 3, run by check.py under JavaScriptCore.

// Every figure on this page is the same shape -- one row of buttons, one row of
// panels, same index -- and the page builds them all from one function. That is
// cheaper to write and it is also a single point of failure, so the exclusivity
// property is asserted for each figure separately rather than once.
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
// The rule this series is built on: most readers never click, so a figure that
// says "select something to begin" teaches nothing. Checked before anything
// else touches a control, because everything below moves these.
chk("figure 1 opens with a part chosen", REG["sg-0"].getAttribute("aria-pressed"), "true");
chk("figure 2 opens with a candidate chosen", REG["cd-0"].getAttribute("aria-pressed"), "true");
chk("figure 3 opens on capsules", REG["ar-0"].getAttribute("aria-pressed"), "true");
chk("figure 4 opens on the first step", REG["hp-0"].getAttribute("aria-pressed"), "true");
chk("figure 6 opens on the board's line", REG["wr-0"].getAttribute("aria-pressed"), "true");
chk("figure 7 opens on the Pico 2", REG["bd-0"].getAttribute("aria-pressed"), "true");
chk("and each of those has its panel open",
    REG["sgp-0"].classList.contains("is-on")
      && REG["cdp-0"].classList.contains("is-on")
      && REG["arp-0"].classList.contains("is-on")
      && REG["hpp-0"].classList.contains("is-on")
      && REG["wrp-0"].classList.contains("is-on")
      && REG["bdp-0"].classList.contains("is-on"), true);

// Figure 5 is the exception, and deliberately: the reader arrives at a list of
// twelve addresses looking for the one chapter 1 was about, so the list opens
// on that one rather than on the numerically first.
chk("figure 5 opens on SIO rather than on the first line",
    REG["sr-11"].getAttribute("aria-pressed"), "true");
chk("and not on the first", REG["sr-0"].getAttribute("aria-pressed"), "false");
chk("the SIO panel is the open one", REG["srp-11"].classList.contains("is-on"), true);
chk("and it is the one that names chapter 1's block",
    REG["srp-11"].textContent.indexOf("gpio_out_set") > -1, true);

// ---- Figure 1: the declaration ----
walk("sg-", "sgp-", 5, "figure 1");
chk("the field panel is the one that says there is a single field",
    REG["sgp-4"].textContent.indexOf("one field") > -1, true);
chk("and the type-parameter panel names the trait's five methods",
    REG["sgp-2"].textContent.indexOf("five methods") > -1, true);
REG["sg-0"].fire("click");
chk("clicking back to the first releases the others",
    onlyOne("sg-", 5, "is-on") + REG["sg-1"].getAttribute("aria-pressed"),
    "0false");

// ---- Figure 2: which line compiles ----
// The chapter's claim is that exactly one of the three is legal, so exactly one
// verdict may be the permissive one. If a later edit softens the second or
// third panel, this is what notices.
walk("cd-", "cdp-", 3, "figure 2");
chk("the legal line is the first", REG["cdp-0"].textContent.indexOf("Legal") === 0, true);
chk("the second is refused", REG["cdp-1"].textContent.indexOf("Refused") === 0, true);
chk("the third is refused too", REG["cdp-2"].textContent.indexOf("Also refused") === 0, true);
chk("and the third says the same words are legal in the chip crate",
    REG["cdp-2"].textContent.indexOf("which crate it sits in") > -1, true);
REG["cd-0"].fire("click");

// ---- Figure 3: counting the word ----
// The numbers are the argument, so they are asserted rather than trusted. Each
// was taken by counting `unsafe` in the .rs files under that path at the pinned
// commit, once with comments stripped and once whole.
(function () {
  var CASE = [
    ["capsules",              "269", "0",   "5"],
    ["kernel",                "101", "259", "356"],
    ["chips/rp2350",          "10",  "18",  "18"],
    ["arch/cortex-m",         "11",  "67",  "68"],
    ["the Pico 2 board",      "3",   "3",   "3"]
  ];
  var i;
  for (i = 0; i < CASE.length; i++) {
    REG["ar-" + i].fire("click");
    chk("counts for " + CASE[i][0] + " -- files",
        REG["ar-files"].textContent, CASE[i][1]);
    chk("counts for " + CASE[i][0] + " -- in code",
        REG["ar-code"].textContent, CASE[i][2]);
    chk("counts for " + CASE[i][0] + " -- counting comments",
        REG["ar-all"].textContent, CASE[i][3]);
    chk("and its panel is the open one",
        REG["arp-" + i].classList.contains("is-on"), true);
  }
}());
// The one number the whole chapter turns on.
REG["ar-0"].fire("click");
chk("capsules is the only area whose code count is zero",
    REG["ar-code"].textContent, "0");
chk("and its panel says the five matches are comments",
    REG["arp-0"].textContent.indexOf("inside a comment") > -1, true);
chk("the count with comments is not also zero, or the gap is not the point",
    REG["ar-all"].textContent !== "0", true);

// ---- Figure 4: six steps ----
walk("hp-", "hpp-", 6, "figure 4");
chk("the chip is not named before step 5",
    REG["hpp-0"].textContent.indexOf("RP2350")
      + REG["hpp-1"].textContent.indexOf("RP2350")
      + REG["hpp-2"].textContent.indexOf("RP2350")
      + REG["hpp-3"].textContent.indexOf("RP2350"), -4);
chk("step 5 is where it is named",
    REG["hpp-4"].textContent.indexOf("RP2350") > -1, true);
chk("and the last step lands on chapter 1's register",
    REG["hpp-5"].textContent.indexOf("0x018") > -1, true);
REG["hp-0"].fire("click");

// ---- Figure 5: twelve addresses ----
walk("sr-", "srp-", 12, "figure 5");
chk("there are twelve and not eleven or thirteen",
    REG["sr-11"] !== undefined && REG["sr-12"] === undefined, true);
(function () {
  // Every line in the list shows an address, and every address is distinct.
  var i, seen = {}, count = 0, text;
  for (i = 0; i < 12; i++) {
    text = REG["sr-" + i].textContent;
    if (text.indexOf("0x") < 0) { throw new Error("line " + i + " shows no address"); }
    if (!seen[text]) { seen[text] = 1; count++; }
  }
  chk("all twelve lines are different", count, 12);
}());
REG["sr-11"].fire("click");

// ---- Figure 6: the board's two lines ----
walk("wr-", "wrp-", 2, "figure 6");
chk("the second line is the commented-out one",
    REG["wr-1"].textContent.indexOf("//") > -1, true);
chk("and its panel says a person took the pin back",
    REG["wrp-1"].textContent.indexOf("by hand") > -1, true);
REG["wr-0"].fire("click");

// ---- Figure 7: two boards ----
(function () {
  var i;
  for (i = 0; i < 2; i++) {
    REG["bd-" + i].fire("click");
    if (!REG["bdp-" + i].classList.contains("is-on")) {
      throw new Error("board " + i + " did not light its own panel");
    }
  }
  chk("exactly one board is lit at a time", onlyOne("bdp-", 2, "is-on"), 1);
}());
REG["bd-0"].fire("click");
chk("the two boards differ in polarity",
    REG["bdp-0"].textContent.indexOf("LedHigh") > -1
      && REG["bdp-1"].textContent.indexOf("LedLow") > -1, true);
chk("and in how many LEDs they have",
    REG["bdp-0"].textContent.indexOf(", 1&gt;") > -1
      || REG["bdp-0"].textContent.indexOf(", 1>") > -1, true);

// ---- Check yourself ----
// The answer text lives in the markup and starts hidden; clicking any option
// reveals it and marks which was right. A wrong click must still reveal.
(function () {
  var CASE = [["qa-", 3, 0, "qan"], ["qb-", 3, 2, "qbn"], ["qc-", 3, 2, "qcn"]];
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

// ---- What the chapter promised it would do ----
// The three goals at the top, each tied to the thing on the page that delivers
// it. A goal nothing answers is the failure mode these exist to catch.
chk("goal 1, the one field, is delivered by figure 1",
    REG["sgp-4"].textContent.indexOf("whole of what the driver can reach") > -1, true);
chk("goal 2, why a driver cannot corrupt the kernel, is delivered by figure 2",
    REG["cdp-1"].textContent.indexOf("forbids the word") > -1, true);
chk("goal 3, which layer knows the chip, is delivered by figure 4",
    REG["hpp-4"].textContent.indexOf("first layer that knows") > -1, true);

// ---- what the first review pass found ----
// The chapter stated a guarantee and never stated its edge. Tock's own
// documentation calls a capsule semi-trusted; nothing on the page said what the
// second half of that word covers, which made chapter 4's "not trusted at all"
// a weaker contrast than it should be.
chk("the boundary of the guarantee is on the page",
    REG["pairs-trust"].textContent.indexOf("taken away") > -1
      && REG["pairs-trust"].textContent.indexOf("left alone") > -1, true);
chk("and the row no longer claims a capsule cannot disturb another one at all",
    REG["pairs-trust"].textContent.indexOf("may be shared") > -1, true);
// A fourth question, on the section a reader is most likely to skip.
chk("the loop question starts hidden", REG["qdn"].classList.contains("is-off"), true);
REG["qd-0"].fire("click");
chk("a wrong answer to it still reveals", REG["qdn"].classList.contains("is-off"), false);
chk("and marks the right one", REG["qd-2"].classList.contains("is-right"), true);
chk("its answer says why nothing stops it",
    REG["qdn"].textContent.indexOf("not scheduled") > -1, true);

// The four lint levels were a table written as a paragraph -- four items each
// with a behaviour, which is the shape chapter 1 converted seven times.
chk("the lint levels are a table",
    REG["pairs-levels"].textContent.indexOf("allow") > -1
      && REG["pairs-levels"].textContent.indexOf("warn") > -1
      && REG["pairs-levels"].textContent.indexOf("deny") > -1
      && REG["pairs-levels"].textContent.indexOf("forbid") > -1, true);
chk("and it says which one can be turned back off",
    REG["pairs-levels"].textContent.indexOf("turn it back off") > -1, true);

// The bounds check is not there because the length is known. It is there
// because indexing past the end panics, which finding 1 is the cost of.
chk("the NUM_LEDS panel gives the real reason for the bounds check",
    REG["sgp-3"].textContent.indexOf("it panics") > -1, true);
chk("and no longer claims the known length is the cause",
    REG["sgp-3"].textContent.indexOf("Because the length is known"), -1);

// "That line is real" has to survive being checked verbatim; the real one is a
// module-level const, not a let binding inside a function.
chk("the third candidate is the declaration that is actually in the tree",
    REG["cd-2"].textContent.indexOf("const SIO_BASE") > -1, true);
chk("and the panel cites it by line",
    REG["cdp-2"].textContent.indexOf("gpio.rs:1168") > -1, true);

// ---- what the second review pass found ----
// The boundary section was prose only. On the skim path -- headings,
// imperatives and notes, which is what most readers take -- it was a bare
// heading, in the one place a reader is most likely to stop reading.
chk("the boundary section has an instrument of its own",
    REG["st-0"].getAttribute("aria-pressed"), "true");
walk("st-", "stp-", 3, "figure 8");
REG["st-0"].fire("click");
chk("it names the panic handler's return type",
    REG["stp-0"].textContent.indexOf("never returns") > -1, true);
chk("it says nothing preempts a capsule that will not return",
    REG["stp-1"].textContent.indexOf("never left") > -1, true);
// The third one is the finding: the earlier wording said a capsule bug could
// not touch another capsule's state, which is true of memory and false of
// everything a virtualizer shares.
chk("and it says what a capsule can still do to another one",
    REG["stp-2"].textContent.indexOf("degrades every other client") > -1, true);
chk("with the board's own count of who shares what",
    REG["stp-2"].textContent.indexOf("four capsules on one serial port") > -1, true);

// Tock's kernel is no_std and has no allocator. Chapter 7 is about handing a
// driver per-process state without one, so naming an allocator here would have
// contradicted a chapter that is not written yet.
REG["ar-1"].fire("click");
chk("the kernel panel no longer lists an allocator",
    REG["arp-1"].textContent.indexOf("memory allocator"), -1);
chk("and says so as the point",
    REG["arp-1"].textContent.indexOf("there is no allocator") > -1, true);
REG["ar-0"].fire("click");

// Three of the four self-check answers used to be the structurally odd option,
// so the quiz could be passed on shape alone. Each question's options are now
// the same shape as their siblings, which no assertion can prove -- but the
// answer moving off the last position is at least visible.
chk("question 1's answer is no longer the middle one by default",
    REG["qa-0"].textContent.indexOf("raw pointer") > -1, true);
chk("and none of its options begins with yes or no",
    (REG["qa-0"].textContent + REG["qa-1"].textContent + REG["qa-2"].textContent)
      .toLowerCase().indexOf("yes,"), -1);

// Two words for one thing, joined only in the glossary until now.
chk("the two words are tied together in the prose as well",
    document.getElementById("wordpair").textContent
      .indexOf("both words for the same thing") > -1, true);

// ---- what the third review pass found ----
// The goals were written before the chapter had a fourth thing to teach: the
// boundary section and Figure 8 both arrived in later passes and neither was
// promised at the top.
chk("the goals promise the boundary as well as the guarantee",
    REG["goalbox"].textContent.indexOf("still do to you anyway") > -1, true);
// The prerequisite line named two chapters and no Rust, while Figure 1 opens on
// a lifetime and a const generic.
chk("and the prerequisites name the Rust as well as the chapters",
    REG["goalbox"].textContent.indexOf("lifetime and a type parameter") > -1, true);

// `'a` was a visible part of a declaration under an imperative that says to
// click the parts of it, and had no button.
chk("the lifetime is one of the parts you can click",
    REG["sg-1"].textContent.indexOf("'a") > -1, true);
chk("and its panel ties it to what Figure 7 shows",
    REG["sgp-1"].textContent.indexOf("'static") > -1, true);
// Both halves of Figure 1's imperative -- what a part lets in, and what it
// leaves out -- now land on every panel rather than two of four.
chk("the name panel says what the name leaves out",
    REG["sgp-0"].textContent.indexOf("leaves out") > -1, true);
chk("and the count panel says what the count is not",
    REG["sgp-3"].textContent.indexOf("not: a pin number") > -1, true);

// The chapter's central picture is the simplest capsule in the tree. The rule
// survives the field count; the picture does not, and the note said nothing.
chk("the note places this driver in the distribution",
    REG["fig1note"].textContent.indexOf("the largest has thirty-one") > -1, true);
chk("and says the rule survives the count",
    REG["fig1note"].textContent.indexOf("does not change the rule") > -1, true);

// ---- what the fourth review pass found ----
// The chapter leaned on words no chapter had ever defined: `crate` fourteen
// times, with the whole argument resting on it, and `process` twelve times,
// three chapters before the one that explains what a process is.
chk("the words the chapter leans on are in its own list",
    REG["words"].textContent.indexOf("process") > -1
      && REG["words"].textContent.indexOf("struct") > -1
      && REG["words"].textContent.indexOf("virtualizer") > -1, true);
(function () {
  var i, missing = 0;
  var WORDS = ["capsule", "board", "process", "struct", "virtualizer",
               "trait", "HIL", "generic", "unsafe"];
  for (i = 0; i < WORDS.length; i++) {
    if (REG["words"].textContent.indexOf(WORDS[i]) < 0) { missing++; }
  }
  chk("all nine of the words the heading promises are in the list", missing, 0);
}());

// The counts and the twelve lines are the same argument, and the chain sat
// between them with the only bridge buried in a panel nobody has to click.
chk("the chain section says where the answer lands before taking the detour",
    REG["bridge"].textContent.indexOf("Figure 5 is those twelve") > -1, true);
chk("and says why the detour comes first",
    REG["bridge"].textContent.indexOf("stands on top of them") > -1, true);
