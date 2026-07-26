/* ============================================================================
 *  god-mode-live-editor.js — the Figma-style live layout editor.
 *
 *  Pick any node in the live scene, drag it, resize it with 8 handles, or type
 *  exact numbers, then export the result. Every number is in the project's own
 *  units — anchoredPos (Unity y-UP) and sizeDelta on the 1920x1080 reference
 *  grid — so the exported JSON pastes straight back into js/data.js.
 * ========================================================================== */
window.GodModeLiveEditor = function () {
  'use strict';

  var U = window.GodModeUtils;
  var GRID = 10;               // snap-to-grid step, in reference px
  var MIN_SIZE = 10;           // never resize below this (reference px)
  var STORE_KEY = 'fancyDressGodLayout';

  var panel = null, box = null, els = {};
  var sel = null;              // the selected Node
  var cursorEdit = false, snap = false, locked = false;
  var drag = null;             // { mode:'move'|'resize', dir, startClient, ... }
  var origs = {};              // id -> captured original geometry
  var edited = {};             // id -> true once touched
  var ghosts = [];
  var raf = null;

  // ============================================================== panel ====
  function buildPanel() {
    panel = document.createElement('div');
    panel.className = 'godPanel';
    panel.id = 'godEditPanel';
    panel.innerHTML =
      '<div class="godHead"><b>Layout Editor</b><span class="godSpacer"></span>' +
      '<button data-god-min title="Minimise">&minus;</button></div>' +
      '<div class="godBody">' +

      '<div class="godSection"><h4>Target</h4>' +
      '<div class="godRow"><input id="godFilter" placeholder="filter by name or path…"></div>' +
      '<div class="godRow"><select id="godTarget" size="1"></select></div>' +
      '<div class="godGrid3">' +
      '<button id="godCursorEdit" title="Click elements on screen to select (E)">Cursor Edit</button>' +
      '<button id="godSnap" title="Snap to a 10px grid (or hold Shift)">Snap 10</button>' +
      '<button id="godLock" title="Prevent dragging the selection">Lock</button>' +
      '</div>' +
      '<p class="godNote" id="godSelInfo">Nothing selected.</p></div>' +

      '<div class="godSection"><h4>Transform &nbsp;<span class="godNote">anchoredPos · y-up</span></h4>' +
      '<div class="godGrid">' +
      fieldHtml('godX', 'X') + fieldHtml('godY', 'Y') +
      fieldHtml('godW', 'Width') + fieldHtml('godH', 'Height') +
      fieldHtml('godScale', 'Scale') + fieldHtml('godRot', 'Rotation') +
      fieldHtml('godAlpha', 'Opacity') + fieldHtml('godFont', 'Font size') +
      '</div>' +
      '<p class="godNote" id="godReadout">—</p></div>' +

      '<div class="godSection"><h4>Arrange</h4>' +
      '<div class="godGrid">' +
      '<button id="godFront">Bring to Front</button><button id="godBack">Send to Back</button>' +
      '<button id="godFwd">Forward +1</button><button id="godBwd">Backward &minus;1</button>' +
      '<button id="godFit">Fit Content</button><button id="godGhost">Duplicate Ghost</button>' +
      '<button id="godFlash">Highlight</button><button id="godReset" class="godDanger">Reset Selected</button>' +
      '</div></div>' +

      '<div class="godSection"><h4>Text</h4>' +
      '<div class="godRow"><textarea id="godText" placeholder="(selection has no text)"></textarea></div>' +
      '<div class="godRow"><button id="godApplyText" class="godWide">Apply Text</button></div></div>' +

      '<div class="godSection"><h4>Export &amp; Persist</h4>' +
      '<div class="godGrid">' +
      '<button id="godCopySel">Copy Values</button><button id="godCopyAll">Copy All Edited</button>' +
      '<button id="godCopyJson">Copy Layout JSON</button><button id="godDownload">Download JSON</button>' +
      '<button id="godSave">Save Temp</button><button id="godLoad">Load Temp</button>' +
      '</div>' +
      '<div class="godRow"><label class="godCheck"><input type="checkbox" id="godAutoApply">' +
      'Re-apply saved layout on load</label></div>' +
      '<div class="godRow"><button id="godClearTemp" class="godWide godDanger">Clear Temp &amp; Reset All</button></div>' +
      '<p class="godNote" id="godEditCount">0 elements edited.</p></div>' +

      '</div>';
    document.getElementById('godModeRoot').appendChild(panel);

    box = document.createElement('div');
    box.id = 'godSelBox';
    box.innerHTML = '<span class="godSelTag"></span>' +
      ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(function (d) {
        return '<i data-dir="' + d + '"></i>';
      }).join('');
    document.getElementById('godModeRoot').appendChild(box);

    ['Filter', 'Target', 'CursorEdit', 'Snap', 'Lock', 'SelInfo', 'X', 'Y', 'W', 'H',
     'Scale', 'Rot', 'Alpha', 'Font', 'Readout', 'Front', 'Back', 'Fwd', 'Bwd', 'Fit',
     'Ghost', 'Flash', 'Reset', 'Text', 'ApplyText', 'CopySel', 'CopyAll', 'CopyJson',
     'Download', 'Save', 'Load', 'AutoApply', 'ClearTemp', 'EditCount'
    ].forEach(function (k) { els[k] = panel.querySelector('#god' + k) || document.getElementById('god' + k); });
  }

  function fieldHtml(id, label) {
    return '<label class="godField"><span>' + label + '</span>' +
           '<input id="' + id + '" type="text" inputmode="decimal"></label>';
  }

  // =========================================================== targets ====
  function rebuildTargets() {
    if (!els.Target) return;
    var filter = (els.Filter.value || '').toLowerCase();
    var list = U.nodeList();
    var html = '<option value="">— select an element —</option>';
    list.forEach(function (it) {
      if (filter && it.path.toLowerCase().indexOf(filter) < 0) return;
      var pad = new Array(Math.max(0, it.depth)).join('  ') + (it.depth > 1 ? '└ ' : '');
      var tags = [];
      if (it.node.image) tags.push('img');
      if (it.node.tmp) tags.push('text');
      if (it.node.button) tags.push('btn');
      if (!Engine.activeInHierarchy(it.id)) tags.push('off');
      html += '<option value="' + it.id + '"' + (sel && sel.id === it.id ? ' selected' : '') + '>' +
              pad + U.esc(it.name) + (tags.length ? '  · ' + tags.join('/') : '') + '</option>';
    });
    els.Target.innerHTML = html;
    els.Target.size = 10;
  }

  // ========================================================= selection ====
  function capture(n) {
    if (origs[n.id]) return;
    origs[n.id] = {
      pos: n.anchoredPos.slice(), sizeDelta: n.sizeDelta.slice(),
      scale: n.scale.slice(), rot: n.rotZ,
      text: n.tmp ? n.tmp.text : null,
      font: n.tmp ? n.tmp.fontSize : null,
      alpha: n.canvasGroup ? n.canvasGroup.alpha : (n.image ? n.image.color[3] : 1),
      size: n.size().slice()
    };
  }

  function select(n) {
    if (!n) { sel = null; hideBox(); paintInfo(); return; }
    sel = n;
    capture(n);
    paintInfo();
    refreshFields();
    drawBox();
    document.dispatchEvent(new CustomEvent('godEditorSelectionChanged', {
      detail: { element: n.el, id: n.id, name: n.name, node: n, path: U.pathOf(n) }
    }));
  }
  function selectById(id) { select(Engine.node(id)); }

  function paintInfo() {
    if (!els.SelInfo) return;
    if (!sel) { els.SelInfo.textContent = 'Nothing selected.'; return; }
    els.SelInfo.innerHTML = '<b>' + U.esc(sel.name) + '</b> · id ' + sel.id + '<br>' +
      '<span class="godNote">' + U.esc(U.pathOf(sel)) + '</span>';
  }

  function refreshFields() {
    if (!sel || !els.X) return;
    var n = sel, s = n.size();
    if (document.activeElement !== els.X) els.X.value = U.r1(n.anchoredPos[0]);
    if (document.activeElement !== els.Y) els.Y.value = U.r1(n.anchoredPos[1]);
    if (document.activeElement !== els.W) els.W.value = U.r1(s[0]);
    if (document.activeElement !== els.H) els.H.value = U.r1(s[1]);
    if (document.activeElement !== els.Scale) els.Scale.value = U.r1(n.scale[0]);
    if (document.activeElement !== els.Rot) els.Rot.value = U.r1(n.rotZ);
    if (document.activeElement !== els.Alpha) els.Alpha.value =
      n.canvasGroup ? n.canvasGroup.alpha : (n.image ? n.image.color[3] : 1);
    els.Font.value = n.tmp ? n.tmp.fontSize : '';
    els.Font.disabled = !n.tmp;
    els.Text.value = n.tmp ? (n.tmp.text || '') : '';
    els.Text.disabled = !n.tmp;

    var rr = U.refRectOf(n.el), sr = U.stageRectOf(n.el);
    els.Readout.innerHTML =
      'ref frame <b>' + Math.round(rr.x) + ', ' + Math.round(rr.y) + '</b> · ' +
      Math.round(rr.w) + '×' + Math.round(rr.h) +
      '<br>stage <b>' + Math.round(sr.x) + ', ' + Math.round(sr.y) + '</b>' +
      ' · pivot ' + n.pivot[0] + ',' + n.pivot[1] +
      ' · sizeDelta ' + U.r1(n.sizeDelta[0]) + ',' + U.r1(n.sizeDelta[1]);
    els.EditCount.textContent = Object.keys(edited).length + ' elements edited.';
  }

  // ======================================================= selection box ====
  function drawBox() {
    if (!sel || !box) return;
    if (!U.isVisible(sel.el)) { hideBox(); return; }
    var r = sel.el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = r.left + 'px';
    box.style.top = r.top + 'px';
    box.style.width = r.width + 'px';
    box.style.height = r.height + 'px';
    box.classList.toggle('godLocked', locked);
    var s = sel.size();
    box.querySelector('.godSelTag').textContent =
      sel.name + '  ' + Math.round(s[0]) + '×' + Math.round(s[1]) +
      '  @ ' + Math.round(sel.anchoredPos[0]) + ',' + Math.round(sel.anchoredPos[1]);
  }
  function hideBox() { if (box) box.style.display = 'none'; }

  function tick() {
    if (sel && !drag) drawBox();
    raf = requestAnimationFrame(tick);
  }

  // ========================================================== edit verbs ====
  function markEdited() {
    if (!sel) return;
    edited[sel.id] = true;
    if (els.EditCount) els.EditCount.textContent = Object.keys(edited).length + ' elements edited.';
  }

  function moveTo(nx, ny) {
    if (!sel) return;
    capture(sel);
    Engine.setAnchoredPos(sel.id, nx, ny);
    markEdited(); refreshFields(); drawBox();
  }

  function nudge(dx, dy) {
    if (!sel || locked) return;
    moveTo(sel.anchoredPos[0] + dx, sel.anchoredPos[1] + dy);
  }

  function applyFields() {
    if (!sel) return;
    var n = sel;
    capture(n);
    var x = U.num(els.X.value, n.anchoredPos[0]), y = U.num(els.Y.value, n.anchoredPos[1]);
    Engine.setAnchoredPos(n.id, x, y);
    var s = n.size();
    var w = Math.max(MIN_SIZE, U.num(els.W.value, s[0])), h = Math.max(MIN_SIZE, U.num(els.H.value, s[1]));
    U.setSize(n, w, h);
    Engine.setScale(n.id, U.num(els.Scale.value, n.scale[0]));
    Engine.setRotZ(n.id, U.num(els.Rot.value, n.rotZ));
    var a = Math.max(0, Math.min(1, U.num(els.Alpha.value, 1)));
    if (n.canvasGroup) Engine.setCanvasGroupAlpha(n.id, a);
    else if (n.image) Engine.setImageAlpha(n.id, a);
    if (n.tmp) {
      n.tmp.fontSize = U.num(els.Font.value, n.tmp.fontSize);
      n.applyText();
    }
    markEdited(); refreshFields(); drawBox();
  }

  function stepOrder(dir) {
    if (!sel || !sel.parent) return;
    var kids = sel.parent.children, i = kids.indexOf(sel), j = i + dir;
    if (i < 0 || j < 0 || j >= kids.length) return;
    kids.splice(i, 1); kids.splice(j, 0, sel);
    var pe = sel.parent.el;
    if (dir > 0) {
      var after = kids[j + 1];
      after ? pe.insertBefore(sel.el, after.el) : pe.appendChild(sel.el);
    } else {
      pe.insertBefore(sel.el, kids[j + 1] ? kids[j + 1].el : pe.firstChild);
    }
    markEdited();
  }

  function fitContent() {
    if (!sel) return;
    capture(sel);
    if (sel.image && sel.image.sprite && sel.image.sprite.w) {
      Engine.setNativeSize(sel.id);
    } else if (sel.tmp) {
      var inner = sel.textEl;
      var keepW = inner.style.right, keepH = inner.style.bottom;
      inner.style.right = 'auto'; inner.style.bottom = 'auto';
      var w = inner.scrollWidth, h = inner.scrollHeight;
      inner.style.right = keepW; inner.style.bottom = keepH;
      U.setSize(sel, w, h);
    }
    markEdited(); refreshFields(); drawBox();
  }

  function duplicateGhost() {
    if (!sel) return;
    var clone = sel.el.cloneNode(true);
    clone.classList.add('godGhostClone');
    clone.removeAttribute('data-id');
    clone.style.left = (parseFloat(sel.el.style.left) || 0) + 40 + 'px';
    clone.style.top = (parseFloat(sel.el.style.top) || 0) + 40 + 'px';
    sel.el.parentNode.appendChild(clone);
    ghosts.push(clone);
    U.toast('Ghost clone (8s)');
    setTimeout(function () { removeGhost(clone); }, 8000);
  }
  function removeGhost(c) {
    var i = ghosts.indexOf(c);
    if (i >= 0) ghosts.splice(i, 1);
    if (c && c.parentNode) c.parentNode.removeChild(c);
  }

  function resetSelected() {
    if (!sel) return;
    restore(sel.id);
    delete edited[sel.id];
    refreshFields(); drawBox();
  }

  function restore(id) {
    var o = origs[id], n = Engine.node(id);
    if (!o || !n) return;
    Engine.setAnchoredPos(id, o.pos[0], o.pos[1]);
    Engine.setSizeDelta(id, o.sizeDelta[0], o.sizeDelta[1]);
    Engine.setScale(id, o.scale[0], o.scale[1]);
    Engine.setRotZ(id, o.rot);
    if (n.canvasGroup) Engine.setCanvasGroupAlpha(id, o.alpha);
    else if (n.image) Engine.setImageAlpha(id, o.alpha);
    if (n.tmp) {
      if (o.font !== null) n.tmp.fontSize = o.font;
      if (o.text !== null) n.tmp.text = o.text;
      n.applyText();
    }
  }

  function resetAll() {
    Object.keys(origs).forEach(restore);
    edited = {};
    ghosts.slice().forEach(removeGhost);
    setCursorEdit(false);
    locked = false;
    sel = null;
    hideBox();
    if (els.EditCount) { paintInfo(); els.EditCount.textContent = '0 elements edited.'; }
  }

  // ======================================================= cursor editing ===
  function setCursorEdit(on) {
    cursorEdit = !!on;
    document.body.classList.toggle('godCursorEdit', cursorEdit);
    if (els.CursorEdit) els.CursorEdit.classList.toggle('godOn', cursorEdit);
    if (cursorEdit) {
      window.addEventListener('pointerdown', onPickDown, true);
      window.addEventListener('click', swallow, true);
    } else {
      window.removeEventListener('pointerdown', onPickDown, true);
      window.removeEventListener('click', swallow, true);
    }
  }

  var swallowNextClick = false;
  function swallow(ev) {
    if (U.isGodEl(ev.target)) return;
    if (!swallowNextClick) return;
    swallowNextClick = false;
    ev.stopPropagation(); ev.preventDefault();
  }

  /* Deepest editable node under the pointer; full-bleed layers and ghost
     clones are never pickable. */
  function nodeAtPoint(x, y) {
    var stack = document.elementsFromPoint(x, y);
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      if (U.isGodEl(el) || el.classList.contains('godGhostClone')) continue;
      var un = el.closest ? el.closest('.un') : null;
      if (!un || !un.dataset.id) continue;
      var n = Engine.node(un.dataset.id);
      if (!n || U.isFullBleed(n)) continue;
      return n;
    }
    return null;
  }

  function onPickDown(ev) {
    if (U.isGodEl(ev.target)) return;          // let the resize handles work
    var n = nodeAtPoint(ev.clientX, ev.clientY);
    if (!n) return;
    ev.stopPropagation(); ev.preventDefault();
    swallowNextClick = true;
    if (!sel || sel.id !== n.id) select(n);
    rebuildTargets();
    if (!locked) beginDrag(ev, 'move', null);
  }

  function beginDrag(ev, mode, dir) {
    if (!sel) return;
    capture(sel);
    drag = {
      mode: mode, dir: dir || '',
      client: [ev.clientX, ev.clientY],
      pos: sel.anchoredPos.slice(),
      size: sel.size().slice(),
      shift: ev.shiftKey
    };
    window.addEventListener('pointermove', onDragMove, true);
    window.addEventListener('pointerup', onDragUp, true);
    window.addEventListener('pointercancel', onDragUp, true);
  }

  function onDragMove(ev) {
    if (!drag || !sel) return;
    ev.stopPropagation(); ev.preventDefault();
    var k = U.scale() || 1;
    var dx = (ev.clientX - drag.client[0]) / k;
    var dy = (ev.clientY - drag.client[1]) / k;
    var doSnap = snap || ev.shiftKey;

    if (drag.mode === 'move') {
      var l = U.stageDeltaToLocal(sel, dx, dy);
      var nx = drag.pos[0] + l[0], ny = drag.pos[1] + l[1];
      if (doSnap) { nx = Math.round(nx / GRID) * GRID; ny = Math.round(ny / GRID) * GRID; }
      Engine.setAnchoredPos(sel.id, nx, ny);
    } else {
      resizeBy(dx, dy, doSnap);
    }
    markEdited(); refreshFields(); drawBox();
  }

  /* Resize keeps the edge opposite the grabbed handle pinned, which needs the
     matching anchoredPos correction because the rect grows around its pivot. */
  function resizeBy(dx, dy, doSnap) {
    var f = U.parentFrame(sel);
    var sx = dx / f.k, sy = dy / f.k;
    var d = drag.dir;
    var dw = d.indexOf('e') >= 0 ? sx : d.indexOf('w') >= 0 ? -sx : 0;
    var dh = d.indexOf('s') >= 0 ? sy : d.indexOf('n') >= 0 ? -sy : 0;
    var w = Math.max(MIN_SIZE, drag.size[0] + dw);
    var h = Math.max(MIN_SIZE, drag.size[1] + dh);
    if (doSnap) { w = Math.max(MIN_SIZE, Math.round(w / GRID) * GRID); h = Math.max(MIN_SIZE, Math.round(h / GRID) * GRID); }
    dw = w - drag.size[0]; dh = h - drag.size[1];

    var px = sel.pivot[0], py = sel.pivot[1];
    var ax = drag.pos[0], ay = drag.pos[1];
    if (d.indexOf('e') >= 0) ax += px * dw;
    else if (d.indexOf('w') >= 0) ax -= (1 - px) * dw;
    if (d.indexOf('n') >= 0) ay += py * dh;          // screen top edge moves, bottom pinned
    else if (d.indexOf('s') >= 0) ay -= (1 - py) * dh;

    U.setSize(sel, w, h);
    Engine.setAnchoredPos(sel.id, ax, ay);
  }

  function onDragUp(ev) {
    window.removeEventListener('pointermove', onDragMove, true);
    window.removeEventListener('pointerup', onDragUp, true);
    window.removeEventListener('pointercancel', onDragUp, true);
    if (drag) { drag = null; swallowNextClick = true; }
    refreshFields(); drawBox();
  }

  // ============================================================= exports ====
  function valuesOf(n) {
    var o = origs[n.id], s = n.size(), rr = U.refRectOf(n.el);
    return {
      id: n.id, name: n.name, path: U.pathOf(n),
      x: U.r1(n.anchoredPos[0]), y: U.r1(n.anchoredPos[1]),
      sizeDelta: [U.r1(n.sizeDelta[0]), U.r1(n.sizeDelta[1])],
      size: [U.r1(s[0]), U.r1(s[1])],
      scale: U.r1(n.scale[0]), rot: U.r1(n.rotZ),
      pivot: n.pivot.slice(), anchorMin: n.anchorMin.slice(), anchorMax: n.anchorMax.slice(),
      refFrame: { x: Math.round(rr.x), y: Math.round(rr.y), w: Math.round(rr.w), h: Math.round(rr.h) },
      sprite: U.spriteOf(n) || undefined,
      text: n.tmp ? n.tmp.text : undefined,
      fontSize: n.tmp ? n.tmp.fontSize : undefined,
      was: o ? { x: U.r1(o.pos[0]), y: U.r1(o.pos[1]), sizeDelta: [U.r1(o.sizeDelta[0]), U.r1(o.sizeDelta[1])],
                 scale: U.r1(o.scale[0]), rot: U.r1(o.rot) } : undefined
    };
  }

  function textBlock(n) {
    var v = valuesOf(n);
    var lines = [
      n.name + '  (id ' + n.id + ')',
      '  path        ' + v.path,
      '  anchoredPos ' + v.x + ', ' + v.y + '   (Unity y-up)',
      '  sizeDelta   ' + v.sizeDelta[0] + ', ' + v.sizeDelta[1],
      '  size        ' + v.size[0] + ' x ' + v.size[1],
      '  scale       ' + v.scale + '        rotation ' + v.rot,
      '  pivot       ' + v.pivot.join(', ') + '   anchors ' + v.anchorMin.join(',') + ' / ' + v.anchorMax.join(','),
      '  ref frame   ' + v.refFrame.x + ', ' + v.refFrame.y + '  ' + v.refFrame.w + 'x' + v.refFrame.h
    ];
    if (v.sprite) lines.push('  sprite      ' + v.sprite);
    if (v.text !== undefined) lines.push('  text        ' + JSON.stringify(String(v.text).slice(0, 120)));
    if (v.was) lines.push('  was         ' + v.was.x + ', ' + v.was.y + '  sizeDelta ' + v.was.sizeDelta.join(', '));
    return lines.join('\n');
  }

  function layoutJson() {
    var screen = U.activeScreen();
    return {
      scene: window.Game ? Game.currentScene() : '',
      screen: screen ? screen.name : '',
      generated: new Date().toISOString(),
      reference: U.ref(),
      units: 'x/y = anchoredPos (Unity y-up); sizeDelta/size in reference px',
      assets: Object.keys(edited).map(function (id) {
        var n = Engine.node(id);
        return n ? valuesOf(n) : null;
      }).filter(Boolean)
    };
  }

  function copySelected() {
    if (!sel) { U.toast('Nothing selected'); return; }
    U.copyText(textBlock(sel));
    U.toast('Values copied');
  }
  function copyAllEdited() {
    var ids = Object.keys(edited);
    if (!ids.length) { U.toast('No edits yet'); return; }
    U.copyText(ids.map(function (id) {
      var n = Engine.node(id);
      return n ? textBlock(n) : '';
    }).filter(Boolean).join('\n' + new Array(60).join('-') + '\n'));
    U.toast(ids.length + ' elements copied');
  }
  function copyJson() {
    U.copyText(JSON.stringify(layoutJson(), null, 2));
    U.toast('Layout JSON copied');
  }
  function downloadJson() {
    var j = layoutJson();
    var safe = (j.screen || 'screen').replace(/[^\w]+/g, '_').toLowerCase();
    U.download('layout_' + safe + '_' + U.stamp() + '.json', JSON.stringify(j, null, 2));
    U.toast('layout_' + safe + '_… .json');
  }

  // ------------------------------------------------------------- persistence
  function saveTemp() {
    var store = readStore();
    var scene = window.Game ? Game.currentScene() : 'scene';
    store[scene] = store[scene] || {};
    Object.keys(edited).forEach(function (id) {
      var n = Engine.node(id);
      if (!n) return;
      store[scene][id] = {
        pos: n.anchoredPos.slice(), sizeDelta: n.sizeDelta.slice(),
        scale: n.scale.slice(), rot: n.rotZ,
        font: n.tmp ? n.tmp.fontSize : null, text: n.tmp ? n.tmp.text : null
      };
    });
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); U.toast('Saved to localStorage'); }
    catch (e) { U.toast('Save failed: ' + e.message); }
  }

  function readStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function applySaved(quiet) {
    var scene = window.Game ? Game.currentScene() : 'scene';
    var saved = readStore()[scene];
    if (!saved) { if (!quiet) U.toast('Nothing saved for ' + scene); return 0; }
    var count = 0;
    Object.keys(saved).forEach(function (id) {
      var n = Engine.node(id), v = saved[id];
      if (!n) return;
      capture(n);
      Engine.setAnchoredPos(id, v.pos[0], v.pos[1]);
      Engine.setSizeDelta(id, v.sizeDelta[0], v.sizeDelta[1]);
      Engine.setScale(id, v.scale[0], v.scale[1]);
      Engine.setRotZ(id, v.rot);
      if (n.tmp) {
        if (v.font !== null && v.font !== undefined) n.tmp.fontSize = v.font;
        if (v.text !== null && v.text !== undefined) n.tmp.text = v.text;
        n.applyText();
      }
      edited[id] = true;
      count++;
    });
    if (!quiet) U.toast('Applied ' + count + ' saved elements');
    refreshFields();
    return count;
  }

  function clearTemp() {
    var store = readStore();
    delete store[window.Game ? Game.currentScene() : 'scene'];
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
    resetAll();
    U.toast('Temp cleared, edits reset');
  }

  function autoApplyOn() {
    return localStorage.getItem(STORE_KEY + ':auto') === '1';
  }

  // ================================================================ wiring ==
  function wire() {
    els.Filter.addEventListener('input', rebuildTargets);
    els.Target.addEventListener('change', function () {
      if (this.value) { selectById(this.value); }
    });
    els.CursorEdit.addEventListener('click', function () { setCursorEdit(!cursorEdit); });
    els.Snap.addEventListener('click', function () {
      snap = !snap; this.classList.toggle('godOn', snap);
    });
    els.Lock.addEventListener('click', function () {
      locked = !locked; this.classList.toggle('godOn', locked); drawBox();
    });

    ['X', 'Y', 'W', 'H', 'Scale', 'Rot', 'Alpha', 'Font'].forEach(function (k) {
      els[k].addEventListener('change', applyFields);
      els[k].addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { applyFields(); return; }
        if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
        ev.preventDefault();
        var step = (ev.shiftKey ? 10 : 1) * (ev.key === 'ArrowUp' ? 1 : -1);
        this.value = U.r1(U.num(this.value, 0) + step);
        applyFields();
      });
    });

    els.Front.addEventListener('click', function () { if (sel) { Engine.setAsLastSibling(sel.id); markEdited(); } });
    els.Back.addEventListener('click', function () { if (sel) { Engine.setAsFirstSibling(sel.id); markEdited(); } });
    els.Fwd.addEventListener('click', function () { stepOrder(1); });
    els.Bwd.addEventListener('click', function () { stepOrder(-1); });
    els.Fit.addEventListener('click', fitContent);
    els.Ghost.addEventListener('click', duplicateGhost);
    els.Flash.addEventListener('click', function () {
      if (!sel) return;
      sel.el.classList.add('uxGood');
      setTimeout(function () { sel.el.classList.remove('uxGood'); }, 900);
    });
    els.Reset.addEventListener('click', resetSelected);
    els.ApplyText.addEventListener('click', function () {
      if (!sel || !sel.tmp) return;
      capture(sel);
      Engine.setText(sel.id, els.Text.value);
      markEdited(); drawBox();
    });

    els.CopySel.addEventListener('click', copySelected);
    els.CopyAll.addEventListener('click', copyAllEdited);
    els.CopyJson.addEventListener('click', copyJson);
    els.Download.addEventListener('click', downloadJson);
    els.Save.addEventListener('click', saveTemp);
    els.Load.addEventListener('click', function () { applySaved(false); });
    els.ClearTemp.addEventListener('click', clearTemp);
    els.AutoApply.checked = autoApplyOn();
    els.AutoApply.addEventListener('change', function () {
      localStorage.setItem(STORE_KEY + ':auto', this.checked ? '1' : '0');
    });

    U.qsa('#godSelBox i').forEach(function (h) {
      h.addEventListener('pointerdown', function (ev) {
        if (!sel || locked) return;
        ev.stopPropagation(); ev.preventDefault();
        beginDrag(ev, 'resize', h.dataset.dir);
      });
    });

    window.addEventListener('resize', function () { drawBox(); });
  }

  function init() {
    buildPanel();
    wire();
    rebuildTargets();
    raf = requestAnimationFrame(tick);
    if (autoApplyOn()) applySaved(true);
  }

  return {
    init: init,
    panel: function () { return panel; },
    select: select, selectById: selectById, selected: function () { return sel; },
    rebuildTargets: rebuildTargets, refreshFields: refreshFields,
    setCursorEdit: setCursorEdit, cursorEdit: function () { return cursorEdit; },
    toggleSnap: function () { els.Snap.click(); },
    toggleLock: function () { els.Lock.click(); },
    nudge: nudge, copySelected: copySelected, copyAllEdited: copyAllEdited,
    copyJson: copyJson, downloadJson: downloadJson,
    applySaved: applySaved, resetAll: resetAll,
    editedCount: function () { return Object.keys(edited).length; }
  };
};
