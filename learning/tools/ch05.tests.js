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
chk("figure 3 opens on the first instruction", REG["mm-0"].getAttribute("aria-pressed"), "true");
chk("figure 4 opens on the first permission", REG["pm-0"].getAttribute("aria-pressed"), "true");
chk("figure 5 opens on region 0", REG["rn-0"].getAttribute("aria-pressed"), "true");
chk("figure 6 opens on this board's chip", REG["tc-0"].getAttribute("aria-pressed"), "true");
chk("figure 7 opens on the refused store", REG["fl-0"].getAttribute("aria-pressed"), "true");
chk("figure 8 opens on the enable bit", REG["cb-0"].getAttribute("aria-pressed"), "true");
chk("figure 9 opens on the kernel", REG["nt-0"].getAttribute("aria-pressed"), "true");
chk("and every one of those has its panel open",
    REG["ckp-0"].classList.contains("is-on")
      && REG["rfp-0"].classList.contains("is-on")
      && REG["mmp-0"].classList.contains("is-on")
      && REG["pmp-0"].classList.contains("is-on")
      && REG["rnp-0"].classList.contains("is-on")
      && REG["tcp-0"].classList.contains("is-on")
      && REG["flp-0"].classList.contains("is-on")
      && REG["cbp-0"].classList.contains("is-on")
      && REG["ntp-0"].classList.contains("is-on"), true);

// ---- Figure 1: what the unit is asked ----
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

// ---- Figure 2: the six fields ----
walk("rf-", "rfp-", 7, "figure 2");
REG["rf-0"].fire("click");
chk("the base panel gives the shift the kernel writes",
    REG["rfp-0"].textContent.indexOf("logical_start >> 5") > -1, true);
chk("and names 32 as what the missing bits cost",
    REG["rfp-0"].textContent.indexOf("multiple of 32") > -1, true);
REG["rf-2"].fire("click");
// The Tock names for this field read backwards: XN::Disable is the value that
// sets the execute-never bit. A reader who does not meet that here will meet
// it in the source and lose an hour.
chk("the execute panel warns that the value names read backwards",
    REG["rfp-2"].textContent.indexOf("XN::Disable") > -1, true);
REG["rf-3"].fire("click");
chk("the limit panel gives the other shift, minus one",
    REG["rfp-3"].textContent.indexOf("(logical_end - 1) >> 5") > -1, true);
// The first review pass found that figure 3's limit values could not be
// derived from this figure: PXN was never named, so a reader adding up the six
// fields shown landed 0x10 short. It is a row of its own now.
REG["rf-4"].fire("click");
chk("PXN has a row of its own, not a mention in another panel",
    REG["rf-4"].textContent.indexOf("PXN, bit 4") > -1, true);
chk("and its panel says where figure 3's spare 0x10 comes from",
    REG["rfp-4"].textContent.indexOf("0x10") > -1, true);
chk("the one field left out is named in the note",
    REG["rf-note"].textContent.indexOf("SH") > -1, true);
REG["rf-0"].fire("click");

// ---- Figure 3: one region, three moments ----
// The readouts are the arithmetic of mpu_v8m.rs done by hand. If any of these
// three pairs is wrong the figure is teaching a false number, and no other
// check on this page would notice.
chk("the readouts start on the first instruction",
    REG["mm-rbar"].textContent + " " + REG["mm-rlar"].textContent + " " + REG["mm-len"].textContent,
    "0x20008003 0x20008011 32 bytes");
REG["mm-1"].fire("click");
chk("asking for 2 kB moves the limit and not the base",
    REG["mm-rbar"].textContent + " " + REG["mm-rlar"].textContent + " " + REG["mm-len"].textContent,
    "0x20008003 0x200087F1 2048 bytes");
REG["mm-2"].fire("click");
chk("and one byte more is rounded up to a whole block",
    REG["mm-rbar"].textContent + " " + REG["mm-rlar"].textContent + " " + REG["mm-len"].textContent,
    "0x20008003 0x20008811 2080 bytes");
chk("the base is the same in all three",
    REG["mm-rbar"].textContent, "0x20008003");
REG["mm-0"].fire("click");
walk("mm-", "mmp-", 3, "figure 3");
REG["mm-2"].fire("click");
// The numbers live in the readout only. With scripting off every panel is
// visible while the readout shows one moment, so a panel that restated another
// moment's value read as a contradiction.
chk("the rounding panel states the rule, not the readout's numbers",
    REG["mmp-2"].textContent.indexOf("next whole multiple") > -1, true);
chk("and no panel quotes a value the readout is showing for another moment",
    REG["mmp-0"].textContent.indexOf("0x") + REG["mmp-1"].textContent.indexOf("0x2")
      + REG["mmp-2"].textContent.indexOf("0x"), -3);
REG["mm-0"].fire("click");

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
walk("tc-", "tcp-", 2, "figure 6");
REG["tc-1"].fire("click");
chk("the older chip's panel names the constraint",
    REG["tcp-1"].textContent.indexOf("power of two") > -1, true);
chk("and says what it does when the size is not one",
    REG["tcp-1"].textContent.indexOf("subregions") > -1, true);
REG["tc-0"].fire("click");

// ---- Figure 7: the fault path ----
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
chk("goal 2, reading a real region, is delivered by figures 2 and 3",
    REG["goalbox"].textContent.indexOf("two registers that describe it") > -1
      && REG["mm-rbar"].textContent.indexOf("0x") === 0, true);
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
  for (i = 0; i < 7; i++) {
    if (REG["rfp-" + i].classList.contains("is-off")) { hidden++; }
  }
  chk("the script closes the six panels the markup leaves open", hidden, 6);
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
chk("the chapter says the hardware write is skipped when nothing changed",
    REG["skipline"].textContent.indexOf("are not rewritten") > -1, true);
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
chk("all three unused permissions are scoped to the tree, not the board",
    REG["pmp-0"].textContent.indexOf("in this tree") > -1
      && REG["pmp-3"].textContent.indexOf("in this tree") > -1
      && REG["pmp-4"].textContent.indexOf("anywhere in the tree") > -1, true);
// The closing counted the same registers two ways in adjacent sentences.
chk("the closing says two pairs confine a process, out of eight",
    REG["closing"].textContent.indexOf("two pairs of registers") > -1
      && REG["closing"].textContent.indexOf("out of the eight") > -1, true);
