/* ============================================================================
 *  god-mode-utils.js — shared primitives. Loaded FIRST; every other God Mode
 *  module depends on window.GodModeUtils.
 * ========================================================================== */
window.GodModeUtils = (function () {
  'use strict';

  var REF = [1920, 1080];      // the project's CanvasScaler reference resolution

  // ------------------------------------------------------------- dom / misc --
  function qa(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* Shortcuts must never hijack typing in the panel's own fields. */
  function isTypingInField(ev) {
    var t = ev && ev.target;
    if (!t) return false;
    var tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
  }

  function isGodEl(el) {
    return !!(el && el.closest && el.closest('#godModeRoot, .godPanel, #godSelBox, #godBadge, #godToast'));
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(function () { legacyCopy(text); });
      return;
    }
    legacyCopy(text);          // file:// and other non-secure contexts
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' +
           p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function toast(msg) {
    var t = qa('#godToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('godShow');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('godShow'); }, 1600);
  }

  function r1(v) { return Math.round(v * 10) / 10; }
  function num(v, fallback) { var n = parseFloat(v); return isFinite(n) ? n : fallback; }
  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }

  // -------------------------------------------------------------- the stage --
  function stage() { return window.Engine ? Engine.stage() : null; }
  function scale() { return window.Engine ? Engine.scaleFactor() : 1; }
  function canvas() { return window.Engine ? Engine.canvas() : REF.slice(); }
  function ref() { return (window.Engine && Engine.ref) ? Engine.ref() : REF.slice(); }
  function nodes() { return window.Engine ? Engine.nodes() : {}; }

  /* Client rect -> stage space (top-left origin of the canvas, y DOWN). */
  function stageRectOf(el) {
    var st = stage();
    if (!el || !st) return { x: 0, y: 0, w: 0, h: 0 };
    var r = el.getBoundingClientRect(), sr = st.getBoundingClientRect(), k = scale() || 1;
    return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k };
  }

  /* Same rect expressed in the 1920x1080 reference frame, which sits centred
     in the canvas (canvas = screen / scaleFactor, so it grows with the aspect
     ratio). Anything outside 0..1920 / 0..1080 was authored off-design. */
  function refRectOf(el) {
    var s = stageRectOf(el), c = canvas(), rf = ref();
    return { x: s.x - (c[0] - rf[0]) / 2, y: s.y - (c[1] - rf[1]) / 2, w: s.w, h: s.h };
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.02) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  }

  function nodeVisible(n) {
    return !!(n && window.Engine && Engine.activeInHierarchy(n.id) && isVisible(n.el));
  }

  // --------------------------------------------------------------- the tree --
  function pathOf(n) {
    var parts = [], p = n;
    while (p) { parts.unshift(p.name); p = p.parent; }
    return parts.join('/');
  }

  function depthOf(n) {
    var d = 0, p = n.parent;
    while (p) { d++; p = p.parent; }
    return d;
  }

  /* Every node in the live scene, in tree order, with a display path. */
  function nodeList(opts) {
    opts = opts || {};
    var all = nodes(), out = [];
    var root = null;
    Object.keys(all).forEach(function (k) { if (!all[k].parent) root = all[k]; });
    if (!root) return out;
    (function walk(n) {
      if (n !== root) {
        if (!opts.visibleOnly || nodeVisible(n)) {
          out.push({ id: n.id, node: n, name: n.name, path: pathOf(n), depth: depthOf(n) });
        }
      }
      (n.children || []).forEach(walk);
    })(root);
    return out;
  }

  /* Top-level screens: the direct children of the Canvas that hold a screen
     (Tutorial: Intro / GamePlay, Lbd1: Level 01..Level 7). */
  function screens() {
    var all = nodes(), root = null;
    Object.keys(all).forEach(function (k) { if (!all[k].parent) root = all[k]; });
    if (!root) return [];
    return (root.children || []).filter(function (n) {
      return (n.children || []).length > 1;
    });
  }

  function activeScreen() {
    var list = screens();
    for (var i = 0; i < list.length; i++) if (list[i].active) return list[i];
    return null;
  }

  /* A full-bleed background layer is not a positioned asset: never let the
     editor drag or resize one, and keep it out of the UX/tap-target checks. */
  function isFullBleed(n) {
    if (!n) return true;
    if (/^(bg|background|canvas)$/i.test(n.name)) return true;
    var c = canvas(), s = n.size();
    return (s[0] * n.scale[0]) >= c[0] * 0.97 && (s[1] * n.scale[1]) >= c[1] * 0.97;
  }

  // --------------------------------------------------------- node geometry --
  /* Accumulated parent scale + rotation, mirroring Engine's setStagePos so a
     pointer delta in stage space converts back into anchoredPos units. */
  function parentFrame(n) {
    var k = 1, r = 0, p = n.parent;
    while (p) { k *= p.scale[0]; r += p.rotZ; if (!p.parent) break; p = p.parent; }
    return { k: k || 1, rot: r };
  }

  function stageDeltaToLocal(n, dx, dy) {
    var f = parentFrame(n);
    var lx = dx / f.k, ly = -dy / f.k;      // Unity y is UP
    if (f.rot) {
      var a = -f.rot * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
      var nx = lx * cs - ly * sn, ny = lx * sn + ly * cs;
      lx = nx; ly = ny;
    }
    return [lx, ly];
  }

  /* size = (anchorMax - anchorMin) * parentSize + sizeDelta, so setting a size
     means writing the sizeDelta that lands on it. */
  function setSize(n, w, h) {
    var s = n.size();
    var baseW = s[0] - n.sizeDelta[0], baseH = s[1] - n.sizeDelta[1];
    Engine.setSizeDelta(n.id, w - baseW, h - baseH);
  }

  function textOf(n) {
    if (n.tmp) return n.tmp.text || '';
    return '';
  }

  function spriteOf(n) {
    return (n.image && n.image.sprite && n.image.sprite.path) || '';
  }

  /* Best-effort CSS-ish selector for exported animation snippets. */
  function selectorFor(n) {
    if (!n) return '';
    return '[data-id="' + n.id + '"]';
  }

  return {
    REF: REF,
    qa: qa, qsa: qsa, isTypingInField: isTypingInField, isGodEl: isGodEl,
    copyText: copyText, download: download, stamp: stamp, toast: toast,
    r1: r1, num: num, esc: esc,
    stage: stage, scale: scale, canvas: canvas, ref: ref, nodes: nodes,
    stageRectOf: stageRectOf, refRectOf: refRectOf,
    isVisible: isVisible, nodeVisible: nodeVisible,
    pathOf: pathOf, depthOf: depthOf, nodeList: nodeList,
    screens: screens, activeScreen: activeScreen, isFullBleed: isFullBleed,
    parentFrame: parentFrame, stageDeltaToLocal: stageDeltaToLocal, setSize: setSize,
    textOf: textOf, spriteOf: spriteOf, selectorFor: selectorFor
  };
})();
