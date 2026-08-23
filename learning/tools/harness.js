// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Minimal DOM shim so a chapter's page JavaScript can be executed headlessly
// under JavaScriptCore. Implements only what the chapters actually use.
//
// check.py prepends `var PAGE_IDS = [...]` (every id="" in the page), plus
// PAGE_VALUES and PAGE_TEXT carrying what the markup already put in each one,
// before this file, then the page's own script, then the chapter's assertions.

function El(id, tag) {
  this.id = id || "";
  // A browser records what you asked createElement for, and reports it
  // uppercased. Dropping it made every generated element tagless, so nothing
  // could assert that a row is a <div> or that `.trace-what b` has a <b> to
  // match -- and no fixture could be rendered from what a script builds, which
  // is exactly the half of these figures a screenshot never reaches.
  this.tagName = tag === undefined ? "" : String(tag).toUpperCase();
  // A range input clamps whatever you assign into [min, max]; assigning 8 to a
  // max="7" slider leaves it at 7. The shim stored it verbatim, so a figure
  // could be driven into a position the control cannot actually reach -- this
  // one reported "9 of 8" with no step highlighted.
  var value = "";
  Object.defineProperty(this, "value", {
    get: function () { return value; },
    set: function (v) {
      v = v === null || v === undefined ? "" : String(v);
      if (self._attrs.type === "range" && v !== "" && isFinite(Number(v))) {
        var n = Number(v);
        var lo = self._attrs.min, hi = self._attrs.max;
        if (lo !== undefined && n < Number(lo)) { n = Number(lo); }
        if (hi !== undefined && n > Number(hi)) { n = Number(hi); }
        v = String(n);
      }
      value = v;
    }
  });
  this.disabled = false;
  this.type = "";
  this.children = [];
  this._attrs = {};
  this._h = {};
  var self = this;
  var classes = {};
  // DOMTokenList refuses an empty token -- "The token provided must not be
  // empty" -- and a browser throws where a permissive shim would carry on. That
  // divergence hid a real bug: chapter 1's prediction widget called
  // classList.add("") on its first iteration, so clicking any option threw
  // before anything was revealed, and every headless test still passed. The
  // shim now enforces the same contract the browser does.
  function token(c) {
    if (c === "" || c === null || c === undefined) {
      throw new Error("classList: the token provided must not be empty");
    }
    if (String(c).indexOf(" ") > -1) {
      throw new Error("classList: the token provided must not contain spaces");
    }
    return c;
  }
  this.classList = {
    add: function (c) { classes[token(c)] = 1; },
    remove: function (c) { delete classes[token(c)]; },
    contains: function (c) { return !!classes[token(c)]; },
    // Returns whether the class is present afterwards, as the real
    // classList.toggle does -- page code is entitled to use the result.
    toggle: function (c, v) {
      token(c);
      if (v === undefined) { classes[c] ? delete classes[c] : classes[c] = 1; }
      else { v ? classes[c] = 1 : delete classes[c]; }
      return !!classes[c];
    }
  };
  // `className` and `classList` are two views of one attribute in the DOM.
  // They were separate here, so a figure that set `el.className = "map-row"`
  // and a check that asked `el.classList.contains("map-row")` disagreed, and
  // any selector matching would have been answered from an empty set. Backing
  // both with the same object removes a divergence rather than a symptom.
  Object.defineProperty(this, "className", {
    get: function () { return Object.keys(classes).join(" "); },
    set: function (v) {
      Object.keys(classes).forEach(function (k) { delete classes[k]; });
      String(v === null || v === undefined ? "" : v)
        .split(/\s+/).forEach(function (c) { if (c) { classes[c] = 1; } });
    }
  });
  // The DOM coerces whatever you assign to textContent into a string, so
  // `el.textContent = 25` reads back as "25". Without this a test comparing
  // against "25" fails against the number 25 for no reason a reader would care
  // about.
  var text = "";
  Object.defineProperty(this, "textContent", {
    get: function () { return text; },
    set: function (v) { text = v === null || v === undefined ? "" : String(v); }
  });

  // Chapters clear containers with `el.innerHTML = ""` before rebuilding, and
  // occasionally assign real markup. Dropping the second case silently is the
  // kind of permissiveness that lets a broken page pass: a browser would render
  // it and expose its text, so the shim strips the tags and keeps the text,
  // which is what an assertion about that element would reasonably read.
  Object.defineProperty(this, "innerHTML", {
    get: function () { return text === "" ? "" : text; },
    set: function (v) {
      self.children = [];
      text = v === "" ? "" : String(v).replace(/<[^>]*>/g, "");
    }
  });
}

// Attribute values are strings in the DOM, whatever you pass, and a missing
// attribute reads back as null rather than undefined. `setAttribute("data-bit",
// i)` handed this shim a number where a browser would have stored "5".
El.prototype.setAttribute = function (k, v) {
  this._attrs[k] = v === null || v === undefined ? String(v) : String(v);
};
El.prototype.getAttribute = function (k) {
  return Object.prototype.hasOwnProperty.call(this._attrs, k)
    ? this._attrs[k] : null;
};
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.addEventListener = function (e, f) { (this._h[e] = this._h[e] || []).push(f); };
// Only the one selector shape the chapters use. Returning every child
// regardless of the selector is the kind of permissiveness that makes a wrong
// query look right; anything else refuses loudly instead.
El.prototype.querySelectorAll = function (sel) {
  var m = /^\.([\w-]+)$/.exec(String(sel || "").trim());
  if (!m) {
    throw new Error("querySelectorAll: this shim only supports a single "
                    + "class selector, got " + sel);
  }
  return this.children.filter(function (c) {
    return c.classList.contains(m[1]);
  });
};

// Dispatch an event to this element's registered handlers.
El.prototype.focus = function () { REG._focused = this.id; };

// Dispatch an event to this element's registered handlers. `detail` is passed
// through as the event object, so keyboard handlers can be exercised.
El.prototype.fire = function (e, detail) {
  var self = this;
  var ev = detail || {};
  if (!ev.preventDefault) { ev.preventDefault = function () { ev.defaultPrevented = true; }; }
  (this._h[e] || []).forEach(function (f) { f.call(self, ev); });
};

var REG = {};
PAGE_IDS.forEach(function (i) { REG[i] = new El(i); });
// Elements carrying value="" in the markup start with it, as they do in a
// browser, so the page's first render is exercised the way a reader sees it.
// The markup's own text, the same way PAGE_VALUES carries the markup's own
// input values. A page whose rule is "the script writes no words" keeps every
// sentence here, so a shim that starts every element empty can only ever test
// the words the script writes -- exactly the ones this page tries not to have.
// Attributes first: the value setter reads type/min/max off them to clamp.
if (typeof PAGE_ATTRS === "object" && PAGE_ATTRS) {
  Object.keys(PAGE_ATTRS).forEach(function (i) {
    if (!REG[i]) { return; }
    Object.keys(PAGE_ATTRS[i]).forEach(function (k) {
      REG[i]._attrs[k] = PAGE_ATTRS[i][k];
    });
    if (PAGE_ATTRS[i].type) { REG[i].type = PAGE_ATTRS[i].type; }
  });
}
if (typeof PAGE_CLASS === "object" && PAGE_CLASS) {
  Object.keys(PAGE_CLASS).forEach(function (i) {
    if (REG[i]) { REG[i].className = PAGE_CLASS[i]; }
  });
}
if (typeof PAGE_TEXT === "object" && PAGE_TEXT) {
  Object.keys(PAGE_TEXT).forEach(function (i) {
    if (REG[i]) { REG[i].textContent = PAGE_TEXT[i]; }
  });
}
if (typeof PAGE_VALUES === "object" && PAGE_VALUES) {
  Object.keys(PAGE_VALUES).forEach(function (i) {
    if (REG[i]) { REG[i].value = PAGE_VALUES[i]; }
  });
}

var document = {
  getElementById: function (i) {
    if (!REG[i]) { throw new Error("page JS asked for an id that is not in the HTML: " + i); }
    return REG[i];
  },
  // createElement() with no name, or an empty one, is an InvalidCharacterError
  // in a browser rather than an anonymous element.
  createElement: function (tag) {
    if (tag === undefined || String(tag) === "") {
      throw new Error("createElement: the tag name provided is not valid");
    }
    return new El("", tag);
  }
};

// ---- assertion helpers, used by the per-chapter *.tests.js files ----

var RESULTS = [];

function chk(name, got, want) {
  var ok = got === want;
  RESULTS.push({
    ok: ok,
    line: (ok ? "pass  " : "FAIL  ") + name +
          (ok ? "" : "\n          got:  " + got + "\n          want: " + want)
  });
}

// Run an adversarial sequence. Passes if it neither throws nor trips an
// internal consistency check of its own.
function t(name, fn) {
  try { fn(); RESULTS.push({ ok: true, line: "pass  " + name }); }
  catch (e) { RESULTS.push({ ok: false, line: "FAIL  " + name + "\n          threw: " + e }); }
}

function report() {
  RESULTS.forEach(function (r) { print("  " + r.line); });
  var failed = RESULTS.filter(function (r) { return !r.ok; }).length;
  print("");
  if (failed) { print("  " + failed + " of " + RESULTS.length + " assertions FAILED"); }
  else { print("  all " + RESULTS.length + " assertions passed"); }
  return failed;
}
