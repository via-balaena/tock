// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Jon Hillesheim 2026.
//
// Minimal DOM shim so a chapter's page JavaScript can be executed headlessly
// under JavaScriptCore. Implements only what the chapters actually use.
//
// check.py prepends `var PAGE_IDS = [...]` (every id="" in the page) before
// this file, then the page's own script, then the chapter's assertions.

function El(id) {
  this.id = id || "";
  this.textContent = "";
  this.className = "";
  this.value = "";
  this.disabled = false;
  this.type = "";
  this.children = [];
  this._attrs = {};
  this._h = {};
  var self = this;
  var classes = {};
  this.classList = {
    add: function (c) { classes[c] = 1; },
    remove: function (c) { delete classes[c]; },
    contains: function (c) { return !!classes[c]; },
    toggle: function (c, v) {
      if (v === undefined) { classes[c] ? delete classes[c] : classes[c] = 1; }
      else { v ? classes[c] = 1 : delete classes[c]; }
    }
  };
  // Chapters clear containers with `el.innerHTML = ""` before rebuilding.
  Object.defineProperty(this, "innerHTML", {
    get: function () { return ""; },
    set: function (v) { if (v === "") self.children = []; }
  });
}

El.prototype.setAttribute = function (k, v) { this._attrs[k] = v; };
El.prototype.getAttribute = function (k) { return this._attrs[k]; };
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.addEventListener = function (e, f) { (this._h[e] = this._h[e] || []).push(f); };
El.prototype.querySelectorAll = function () { return this.children; };

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

var document = {
  getElementById: function (i) {
    if (!REG[i]) { throw new Error("page JS asked for an id that is not in the HTML: " + i); }
    return REG[i];
  },
  createElement: function () { return new El(); }
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
