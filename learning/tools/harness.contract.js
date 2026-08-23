// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// The shim decides whether every behavioural assertion in this repository
// means anything, so the places it is *supposed* to copy the DOM are checked
// on every run. A permissive shim is worse than none: it makes a broken widget
// pass. These cases all correspond to a divergence that was found and closed.
//
// check.py runs this immediately after harness.js and before any page script.

(function () {
  "use strict";

  function ok(name, got, want) {
    if (got !== want) {
      throw new Error("harness contract: " + name +
                      "\n          got:  " + got +
                      "\n          want: " + want);
    }
  }

  function throws(name, fn) {
    try { fn(); } catch (e) { return; }
    throw new Error("harness contract: " + name + " should have thrown");
  }

  var el = new El("contract-probe");

  // className and classList are two views of one attribute.
  ok("className starts empty", el.className, "");
  el.className = "alpha beta";
  ok("className feeds classList", el.classList.contains("alpha"), true);
  el.classList.add("gamma");
  ok("classList feeds className", el.className, "alpha beta gamma");
  el.classList.remove("beta");
  ok("removing updates className", el.className, "alpha gamma");
  el.className = "";
  ok("clearing className clears the list", el.classList.contains("alpha"), false);

  // A browser refuses these outright.
  throws("classList.add(\"\")", function () { el.classList.add(""); });
  throws("a token with a space", function () { el.classList.add("a b"); });

  // Attribute values are strings; a missing one reads back as null.
  el.setAttribute("data-bit", 5);
  ok("setAttribute coerces to string", el.getAttribute("data-bit"), "5");
  ok("a missing attribute is null", el.getAttribute("nope"), null);

  // textContent coerces too.
  el.textContent = 25;
  ok("textContent coerces to string", el.textContent, "25");

  // querySelectorAll actually filters, and refuses what it cannot do.
  var parent = new El("contract-parent");
  var a = new El("a"), b = new El("b");
  a.className = "wanted";
  b.className = "other";
  parent.appendChild(a);
  parent.appendChild(b);
  ok("selector filters by class", parent.querySelectorAll(".wanted").length, 1);
  ok("and returns the right one", parent.querySelectorAll(".wanted")[0].id, "a");
  ok("no match is an empty list", parent.querySelectorAll(".missing").length, 0);
  throws("an unsupported selector", function () { parent.querySelectorAll("div"); });

  // innerHTML keeps the text rather than dropping the assignment.
  el.innerHTML = "<b>kept</b>";
  ok("innerHTML strips tags and keeps text", el.textContent, "kept");

  // createElement remembers what it was asked for. Three of this page's CSS
  // rules select generated content by tag -- `.trace-what b` among them -- and
  // a shim that forgets the tag can neither catch a wrong one nor be used to
  // render what a figure builds.
  ok("createElement records the tag", document.createElement("div").tagName, "DIV");
  ok("and reports it uppercased", document.createElement("b").tagName, "B");
  throws("createElement with no tag", function () { document.createElement(); });
  throws("createElement with an empty tag", function () { document.createElement(""); });
}());
