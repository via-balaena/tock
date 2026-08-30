// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Drive the book's chrome under a minimal window, which is the one part of
// the assembled book the chapter harness deliberately cannot reach: it guards
// on `typeof window` so that ten coexisting pages stay visible for the gate.
//
// Run by mkbook.py against the book it just assembled. The chapter harness
// cannot reach this code: the chrome guards on `typeof window`, because the
// gate's shim deliberately leaves all ten pages visible so that nine
// coexisting chapters can be tested at once. So this supplies a window.
const fs = require("fs");
const book = fs.readFileSync(process.argv[2], "utf8");

const m = book.match(/\/\* ---- where you are in the book ----[\s\S]*?\}\(\)\);/);
if (!m) { console.log("FAIL: chrome script not found in the book"); process.exit(1); }

const ids = {};
function mk(id) {
  return ids[id] = { id, hidden: false, textContent: "", className: "",
    children: [], attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; } };
}
const ORDER = JSON.parse(book.match(/var ORDER = (\[[^\]]*\]), TITLES/)[1]);
ORDER.forEach(k => mk("page-" + k));
["bookbar-where","bookbar-prev","bookbar-next","bookread"].forEach(mk);
const pips = mk("bookbar-pips");
pips.children = ORDER.map(() => ({ className: "" }));

const handlers = {};
const store = {};
global.window = {
  addEventListener: (e, f) => { (handlers[e] = handlers[e] || []).push(f); },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  },
};
global.document = {
  getElementById: id => ids[id] || null,
  documentElement: { scrollHeight: 4000, clientHeight: 1000, scrollTop: 0 },
};
eval(m[0]);

let fails = 0;
function chk(what, got, want) {
  if (String(got) !== String(want)) { fails++; console.log("  FAIL " + what + ": " + got + " != " + want); }
  else { console.log("  pass  " + what); }
}
function goto(key) {
  ORDER.forEach(k => { ids["page-" + k].hidden = k !== key; });
  handlers.hashchange.forEach(f => f());
}

goto("cover");
chk("nothing is marked read before anything is visited",
    pips.children.map(c => c.className).slice(1).join(""), "");
chk("the cover says so", ids["bookbar-where"].textContent, "Cover");
chk("and Back is disabled on it", ids["bookbar-prev"].getAttribute("aria-disabled"), "true");
chk("with Next naming the chapter that follows", ids["bookbar-next"].textContent, "Getting It Running →");

goto("ch04");
chk("a chapter says which one it is", ids["bookbar-where"].textContent, "Chapter 4 of 8");
chk("Back names the one before it", ids["bookbar-prev"].textContent, "← How Code Starts Running");
chk("Next names the one after", ids["bookbar-next"].textContent, "What a Process Is →");
chk("and Back is live again", ids["bookbar-prev"].getAttribute("aria-disabled"), null);
// The pips are a record of what has been read, not of what is behind you.
// ch07 stays marked below because the run above visited it.
//
// the cover and ch00..ch03 were visited above, so those are the ones marked.
chk("the pip for this page is the one marked here",
    pips.children.map(c => c.className).join(","), "is-done,,,,,is-here,,,,");

goto("ch08");
chk("the last chapter has nowhere to go next", ids["bookbar-next"].getAttribute("aria-disabled"), "true");
chk("and says so", ids["bookbar-next"].textContent, "Done →");
chk("and is the last chapter of eight", ids["bookbar-where"].textContent, "Chapter 8 of 8");

// Jump forward, then back: a chapter skipped over stays unread, and one
// already read stays read. That is the whole reason this is stored rather
// than derived from where you happen to be standing.
goto("ch07");
chk("skipping ahead does not mark what was skipped",
    pips.children.map(c => c.className).join(","), "is-done,,,,,is-done,,,is-here,is-done");
goto("ch04");
chk("and coming back finds the later one still read",
    pips.children.map(c => c.className).join(","), "is-done,,,,,is-here,,,is-done,is-done");

document.documentElement.scrollTop = 1500;
handlers.scroll.forEach(f => f());
chk("the read line follows the scroll", ids["bookread"].getAttribute("style"), "width:50%");
document.documentElement.scrollTop = 3000;
handlers.scroll.forEach(f => f());
chk("and reaches the end at the end", ids["bookread"].getAttribute("style"), "width:100%");

console.log(fails ? "\n" + fails + " FAILED" : "\nall chrome assertions passed");
process.exit(fails ? 1 : 0);
