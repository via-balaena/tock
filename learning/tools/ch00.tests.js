// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Behavioural assertions for chapter 0, run by check.py under JavaScriptCore.

// Same helpers as chapters 3 to 7: every figure here is one row of buttons and
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
chk("figure 1 opens on the board", REG["pt-0"].getAttribute("aria-pressed"), "true");
chk("figure 2 opens on the target directory", REG["pa-0"].getAttribute("aria-pressed"), "true");
chk("figure 3 opens on the route this chapter uses", REG["tg-0"].getAttribute("aria-pressed"), "true");
chk("figure 4 opens on the debug wires", REG["wr-0"].getAttribute("aria-pressed"), "true");
chk("figure 5 opens on the banner", REG["bo-0"].getAttribute("aria-pressed"), "true");
chk("figure 6 opens on the step that is always the same machine", REG["sp-0"].getAttribute("aria-pressed"), "true");
chk("figure 7 opens on the silence that wastes evenings", REG["sy-0"].getAttribute("aria-pressed"), "true");
chk("and every one of those has its panel open",
    REG["ptp-0"].classList.contains("is-on")
      && REG["pap-0"].classList.contains("is-on")
      && REG["tgp-0"].classList.contains("is-on")
      && REG["wrp-0"].classList.contains("is-on")
      && REG["bop-0"].classList.contains("is-on")
      && REG["spp-0"].classList.contains("is-on")
      && REG["syp-0"].classList.contains("is-on"), true);

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
chk("the route this chapter takes installs nothing board-specific",
    REG["tgp-0"].textContent.indexOf("nothing you install after that is specific to this board") > -1, true);
// It does need OpenOCD, which the first draft of Figure 1 denied.
chk("and names OpenOCD as the one thing you do fetch",
    REG["tgp-0"].textContent.indexOf("one thing you fetch") > -1, true);

// ---- Figure 4: the wiring ----
walk("wr-", "wrp-", 4, "figure 4");
// Transmit joins receive, both ways. Getting this backwards is silent, which
// is why it is a figure rather than a sentence.
REG["wr-1"].fire("click");
chk("the probe's transmit joins the board's receive, which is pin 1",
    REG["wrp-1"].textContent.indexOf("receive") > -1
      && REG["wrp-1"].textContent.indexOf("pin") > -1, true);
REG["wr-2"].fire("click");
chk("and the probe's receive joins the board's transmit, which is pin 0",
    REG["wrp-2"].textContent.indexOf("transmit") > -1, true);
REG["wr-3"].fire("click");
chk("the ground panel says the symptom is nonsense rather than silence",
    REG["wrp-3"].textContent.indexOf("not silence but nonsense") > -1, true);
REG["wr-0"].fire("click");

// ---- Figure 5: what the console offers ----
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
walk("sy-", "syp-", 5, "figure 7");
REG["sy-0"].fire("click");
// A flash that reported success proves the probe's USB carries data, so the
// cable cannot be the cause of this one. It belongs two entries down.
chk("the first silence is scoped to what a successful flash leaves open",
    REG["syp-0"].textContent.indexOf("three console wires") > -1, true);
REG["sy-2"].fire("click");
chk("the probe failure is named as the good one, because it is loud",
    REG["syp-2"].textContent.indexOf("good failure") > -1, true);
// Cheapest first, and this is the symptom a charge-only cable actually makes.
chk("and the cable is ruled out here, before any rewiring",
    REG["syp-2"].textContent.indexOf("Swap the probe's USB cable before rewiring") > -1, true);
REG["sy-3"].fire("click");
chk("banner-then-nothing is one wire, and points at the figure with it in",
    REG["syp-3"].textContent.indexOf("One wire") > -1
      && REG["syp-3"].textContent.indexOf("Figure 4") > -1, true);
REG["sy-0"].fire("click");

// ---- The board that is not this board ----
// Chapter 3 and chapter 4 both carry a version of this. Chapter 0 is where a
// reader is most likely to be holding the wrong one, having just bought it.
chk("the chapter says which pin the difference costs",
    REG["wpin"].textContent.indexOf("25") > -1, true);
chk("and that on a Pico 2 W it belongs to the radio",
    REG["wpin"].textContent.indexOf("radio") > -1, true);
chk("and refuses to claim the untested part is fine",
    REG["wtest"].textContent.indexOf("has not been tested") > -1, true);
chk("naming plausible as the thing it will not pass off as verified",
    REG["wtest"].textContent.indexOf("Plausible is not the standard") > -1, true);

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
      && REG["syp-0"].textContent.length > 40, true);

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
    REG["wrp-0"].textContent.indexOf("labelled DEBUG") > -1, true);
// Nothing in the chapter said the board needs its own power. Wire only the
// probe and you get a dead board and no reason for it.
// Scoping this to the debug set implied the UART one might supply power. It
// does not: TX, GND, RX. Neither connector powers the target.
chk("and neither connector is claimed to carry power",
    REG["wrp-0"].textContent.indexOf("Neither of the probe's connectors carries power") > -1, true);

// Captured by unplugging the probe: the literal message, not a paraphrase.
chk("the probe-not-found panel quotes what OpenOCD actually prints",
    REG["syp-2"].textContent.indexOf("unable to find a matching CMSIS-DAP device") > -1, true);

// `list` prints a header even with nothing loaded, so "empty" was the wrong
// word for what a reader sees.
chk("the list panel describes a header with no rows, not an empty list",
    REG["bop-3"].textContent.indexOf("no rows") > -1, true);
