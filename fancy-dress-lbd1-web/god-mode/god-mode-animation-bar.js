/* ============================================================================
 *  god-mode-animation-bar.js — Animation Ideas.
 *
 *  Suggests animations for whatever the Live Editor has selected, keyed by the
 *  element's type and a condition, previews them live, and exports standalone
 *  CSS + JS that does not depend on god-mode.css.
 * ========================================================================== */
window.GodModeAnimationBar = function () {
  'use strict';

  var U = window.GodModeUtils;

  /* class -> { dur, ease, loop, frames } — the export code bank. The preview
     uses the matching .gmAnim-* class in god-mode.css; the generated snippet
     rebuilds the keyframes from `frames` so it stands alone. */
  var BANK = {
    floatUp:     { dur: '2.4s', ease: 'ease-in-out', loop: 1, frames: '0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}' },
    drift:       { dur: '5s',   ease: 'ease-in-out', loop: 1, frames: '0%,100%{transform:translate(0,0)}33%{transform:translate(10px,-8px)}66%{transform:translate(-8px,6px)}' },
    pulseGlow:   { dur: '1.8s', ease: 'ease-in-out', loop: 1, frames: '0%,100%{filter:brightness(1)}50%{filter:brightness(1.22) drop-shadow(0 0 16px rgba(255,240,160,.9))}' },
    heartbeat:   { dur: '1.1s', ease: 'ease-in-out', loop: 1, frames: '0%,100%{transform:scale(1)}14%{transform:scale(1.13)}28%{transform:scale(1)}42%{transform:scale(1.09)}56%{transform:scale(1)}' },
    breathe:     { dur: '2.6s', ease: 'ease-in-out', loop: 1, frames: '0%,100%{transform:scale(1)}50%{transform:scale(1.05)}' },
    wiggle:      { dur: '1.6s', ease: 'ease-in-out', loop: 1, frames: '0%,100%{transform:rotate(0)}25%{transform:rotate(4deg)}75%{transform:rotate(-4deg)}' },
    sway:        { dur: '3s',   ease: 'ease-in-out', loop: 1, frames: '0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}' },
    shimmer:     { dur: '2.2s', ease: 'linear',      loop: 1, frames: '0%,100%{filter:brightness(1)}50%{filter:brightness(1.3) saturate(1.3)}' },
    softBounce:  { dur: '.55s', ease: 'cubic-bezier(.34,1.56,.64,1)', frames: '0%{transform:scale(1)}40%{transform:scale(1.14)}70%{transform:scale(.95)}100%{transform:scale(1)}' },
    popBurst:    { dur: '.5s',  ease: 'cubic-bezier(.22,1.4,.36,1)',  frames: '0%{transform:scale(1)}35%{transform:scale(1.32);filter:brightness(1.3)}100%{transform:scale(1);filter:brightness(1)}' },
    jellyBounce: { dur: '.7s',  ease: 'cubic-bezier(.2,1.5,.3,1)',    frames: '0%{transform:scale(1,1)}30%{transform:scale(1.2,.82)}55%{transform:scale(.88,1.16)}80%{transform:scale(1.05,.96)}100%{transform:scale(1,1)}' },
    squish:      { dur: '.45s', ease: 'cubic-bezier(.3,1.4,.4,1)',    frames: '0%{transform:scale(1,1)}45%{transform:scale(1.22,.78)}100%{transform:scale(1,1)}' },
    shake:       { dur: '.45s', ease: 'ease-in-out', frames: '0%,100%{transform:translateX(0)}20%{transform:translateX(-11px)}40%{transform:translateX(9px)}60%{transform:translateX(-6px)}80%{transform:translateX(4px)}' },
    headShake:   { dur: '.6s',  ease: 'ease-in-out', frames: '0%,100%{transform:rotate(0)}25%{transform:rotate(-7deg)}50%{transform:rotate(6deg)}75%{transform:rotate(-3deg)}' },
    ringExpand:  { dur: '.7s',  ease: 'ease-out',    frames: '0%{box-shadow:0 0 0 0 rgba(61,245,196,.85)}100%{box-shadow:0 0 0 60px rgba(61,245,196,0)}' },
    sparkPop:    { dur: '.6s',  ease: 'ease-out',    frames: '0%{transform:scale(1);filter:brightness(1)}30%{transform:scale(1.18);filter:brightness(1.7) saturate(1.5)}100%{transform:scale(1);filter:brightness(1)}' },
    spinPop:     { dur: '.65s', ease: 'cubic-bezier(.25,1.4,.4,1)',   frames: '0%{transform:rotate(0) scale(1)}50%{transform:rotate(190deg) scale(1.16)}100%{transform:rotate(360deg) scale(1)}' },
    flyOff:      { dur: '.8s',  ease: 'cubic-bezier(.5,-0.2,.8,.4)',  frames: '0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(240px,-300px) scale(.3);opacity:0}' },
    dropIn:      { dur: '.6s',  ease: 'cubic-bezier(.3,1.5,.5,1)',    frames: '0%{transform:translateY(-160px) scale(.85);opacity:0}65%{transform:translateY(10px) scale(1.04);opacity:1}100%{transform:translateY(0) scale(1)}' },
    slideRise:   { dur: '.55s', ease: 'cubic-bezier(.2,.9,.3,1)',     frames: '0%{transform:translateY(50px);opacity:0}100%{transform:translateY(0);opacity:1}' },
    flip:        { dur: '.7s',  ease: 'ease-in-out', frames: '0%{transform:perspective(700px) rotateY(0)}100%{transform:perspective(700px) rotateY(360deg)}' },
    fadePulse:   { dur: '.8s',  ease: 'ease-in-out', frames: '0%,100%{opacity:1}50%{opacity:.25}' },
    cheerJump:   { dur: '.8s',  ease: 'cubic-bezier(.3,1.4,.4,1)',    frames: '0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(-40px) rotate(-6deg)}60%{transform:translateY(-12px) rotate(5deg)}' },
    wave:        { dur: '1.2s', ease: 'ease-in-out', frames: '0%,100%{transform:rotate(0)}20%{transform:rotate(14deg)}40%{transform:rotate(-10deg)}60%{transform:rotate(10deg)}80%{transform:rotate(-6deg)}' },
    tiltPeek:    { dur: '.9s',  ease: 'ease-in-out', frames: '0%,100%{transform:rotate(0) scale(1)}45%{transform:rotate(-8deg) scale(1.06)}' },
    scaleUp:     { dur: '.4s',  ease: 'cubic-bezier(.2,1.4,.4,1)',    frames: '0%{transform:scale(.7);opacity:.4}100%{transform:scale(1);opacity:1}' },
    freezePulse: { dur: '1s',   ease: 'ease-out',    frames: '0%{filter:brightness(1) saturate(1)}40%{filter:brightness(1.4) saturate(.2)}100%{filter:brightness(1) saturate(1)}' }
  };

  /* Ordered keyword -> class resolver: first match wins, so brand-new idea
     names keep working without touching the bank. */
  var RESOLVER = [
    [/heart|beat|urgent/i, 'heartbeat'],
    [/shake|tick|nudge/i, 'shake'],
    [/head\s*shake|deny|refuse|no\b/i, 'headShake'],
    [/ring|ripple|halo|pulse\s*ring/i, 'ringExpand'],
    [/squish|squash|boing|stretch/i, 'squish'],
    [/burst|confetti|spark|star|glitter/i, 'sparkPop'],
    [/rotate|spin|twirl/i, 'spinPop'],
    [/fly|collect|send|to\s*(hud|score|basket)/i, 'flyOff'],
    [/shine|glow|gleam|shimmer/i, 'pulseGlow'],
    [/pop/i, 'popBurst'],
    [/drop|fall|land/i, 'dropIn'],
    [/slide|rise|reveal|enter/i, 'slideRise'],
    [/flip/i, 'flip'],
    [/fade|blink|flicker/i, 'fadePulse'],
    [/jump|cheer|celebrat|hop/i, 'cheerJump'],
    [/wave|greet|hello/i, 'wave'],
    [/wiggle|wobble|jiggle/i, 'wiggle'],
    [/sway|rock|tilt|peek/i, 'sway'],
    [/drift|float|hover|idle/i, 'floatUp'],
    [/breathe|grow|scale\s*up|zoom/i, 'scaleUp'],
    [/jelly|gel|bouncy/i, 'jellyBounce'],
    [/freeze|frost|still/i, 'freezePulse'],
    [/bounce/i, 'softBounce']
  ];

  var CONDITIONS = ['On Idle', 'On Hover', 'On Tap', 'On Drag Start', 'On Drop',
    'On Correct Answer', 'On Wrong Answer', 'On Level Start', 'On Level Complete', 'On Game Over'];

  var IDEAS = {
    item: {
      'On Idle': ['Gentle Idle Float', 'Soft Breathe', 'Ready Wiggle', 'Pick Me Glow'],
      'On Hover': ['Lift And Shine', 'Tiny Scale Up', 'Warm Glow'],
      'On Tap': ['Happy Jelly Bounce', 'Squish And Stretch', 'Quick Pop'],
      'On Drag Start': ['Grab Lift Pop', 'Tilt Peek', 'Carry Sway'],
      'On Drop': ['Settle Jelly Bounce', 'Land Squish', 'Drop In Bounce', 'Basket Land Ripple'],
      'On Correct Answer': ['Crystal Pop Burst', 'Star Confetti Pop', 'Happy Cheer Jump', 'Rainbow Ring Expand'],
      'On Wrong Answer': ['Soft Wrong Shake', 'Sad Wobble', 'Bubble Squish Deny', 'Gentle Freeze Pulse'],
      'On Level Start': ['Slide In From Table', 'Drop In Bounce', 'Scale Up Reveal']
    },
    basket: {
      'On Idle': ['Barely There Sway', 'Waiting Glow'],
      'On Hover': ['Ready Ring Expand', 'Warm Highlight Glow'],
      'On Drop': ['Catch Squish', 'Accept Ring Ripple', 'Weight Settle Bounce'],
      'On Correct Answer': ['Success Ring Expand', 'Sparkle Rim Pop'],
      'On Wrong Answer': ['Reject Shake', 'Deny Head Shake']
    },
    balance: {
      'On Idle': ['Idle Micro Sway', 'Needle Breathe'],
      'On Drop': ['Tip Settle Wobble', 'Heavy Side Squish', 'Beam Rock Sway'],
      'On Correct Answer': ['Winner Side Glow', 'Balanced Shimmer'],
      'On Level Complete': ['Celebrate Rock', 'Golden Shimmer']
    },
    button: {
      'On Idle': ['Invite Breathe', 'Soft Idle Float', 'Attention Heartbeat'],
      'On Hover': ['Scale Up Shine', 'Warm Glow'],
      'On Tap': ['Press Squish', 'Confirm Pop', 'Bouncy Confirm'],
      'On Level Complete': ['Slide Rise In', 'Pop In Bounce', 'Ring Expand Invite']
    },
    hand: {
      'On Idle': ['Tap Tap Hint', 'Point And Float', 'Guide Wave'],
      'On Tap': ['Tap Squish', 'Quick Pop'],
      'On Drag Start': ['Follow Sway', 'Carry Drift']
    },
    label: {
      'On Level Complete': ['Pop In Bounce', 'Scale Up Reveal', 'Sparkle Pop'],
      'On Correct Answer': ['Happy Pop', 'Ring Expand'],
      'On Idle': ['Soft Float', 'Gentle Breathe']
    },
    promptText: {
      'On Level Start': ['Slide Rise In', 'Soft Fade Pulse', 'Type In Pop'],
      'On Idle': ['Read Me Breathe'],
      'On Correct Answer': ['Cheer Pop'],
      'On Wrong Answer': ['Try Again Shake']
    },
    messageBar: {
      'On Level Start': ['Slide Rise In', 'Drop In Bounce', 'Unroll Shimmer'],
      'On Idle': ['Subtle Shimmer'],
      'On Wrong Answer': ['Attention Shake']
    },
    character: {
      'On Idle': ['Friendly Idle Float', 'Breathe And Blink', 'Happy Sway'],
      'On Correct Answer': ['Cheer Jump', 'Proud Pop', 'Wave Hello'],
      'On Wrong Answer': ['Encourage Head Shake', 'Soft Wobble'],
      'On Level Complete': ['Big Cheer Jump', 'Celebrate Spin Pop']
    },
    panel: {
      'On Level Complete': ['Drop In Bounce', 'Scale Up Reveal', 'Slide Rise In'],
      'On Game Over': ['Golden Scale Up', 'Confetti Pop In', 'Shimmer Reveal'],
      'On Idle': ['Soft Glow Pulse']
    },
    background: {
      'On Idle': ['Slow Drift', 'Ambient Shimmer', 'Gentle Breathe']
    },
    'default': {
      'On Idle': ['Soft Float', 'Gentle Breathe', 'Ambient Shimmer'],
      'On Tap': ['Quick Pop', 'Press Squish'],
      'On Correct Answer': ['Happy Pop Burst'],
      'On Wrong Answer': ['Soft Shake']
    }
  };

  var DEFAULT_CONDITION = {
    item: 'On Tap', basket: 'On Drop', balance: 'On Drop', button: 'On Tap',
    hand: 'On Idle', label: 'On Level Complete', promptText: 'On Level Start',
    messageBar: 'On Level Start', character: 'On Idle', panel: 'On Level Complete',
    background: 'On Idle', 'default': 'On Idle'
  };

  var panel = null, els = {}, cur = null, curType = 'default', condition = 'On Idle';
  var previewClass = null, applied = [], lastIdea = null;

  // ------------------------------------------------------- classification --
  function classify(n) {
    if (!n) return 'default';
    var name = n.name || '';
    if (window.Controllers) {
      if (Controllers.get('DraggableItem', n.id)) return 'item';
      if (Controllers.get('BasketDropZone', n.id)) return 'basket';
    }
    if (U.isFullBleed(n)) return 'background';
    if (/hand/i.test(name)) return 'hand';
    if (/label|heavy|light/i.test(name)) return 'label';
    if (/message\s*bar/i.test(name)) return 'messageBar';
    if (/balance|scale|pan|plate|beem|beam|needle/i.test(name)) return 'balance';
    if (/basket/i.test(name)) return 'basket';
    if (n.button || /btn|button/i.test(name)) return 'button';
    if (/panel|card|game\s*over|intro/i.test(name)) return 'panel';
    if (n.tmp) return 'promptText';
    if (/aru|pari|granny|char|monkey|bird|elephant/i.test(name)) return 'character';
    return 'default';
  }

  function ideasFor(type, cond) {
    var bank = IDEAS[type] || {};
    var list = (bank[cond] || []).slice();
    if (type !== 'default') {
      // fall back to the generic bank so every condition offers something
      (IDEAS['default'][cond] || []).forEach(function (i) {
        if (list.indexOf(i) < 0) list.push(i);
      });
    }
    if (!list.length) list = ['Soft Float', 'Quick Pop', 'Gentle Breathe'];
    return list;
  }

  function resolve(label) {
    for (var i = 0; i < RESOLVER.length; i++) if (RESOLVER[i][0].test(label)) return RESOLVER[i][1];
    return 'softBounce';
  }

  // ---------------------------------------------------------------- panel --
  function buildPanel() {
    panel = document.createElement('div');
    panel.className = 'godPanel';
    panel.id = 'godAnimPanel';
    panel.style.cssText = 'left:12px;bottom:12px;top:auto;width:360px;max-height:52vh';
    panel.innerHTML =
      '<div class="godHead"><b>Animation Ideas</b><span class="godSpacer"></span>' +
      '<button data-god-min title="Minimise">&minus;</button></div>' +
      '<div class="godBody">' +
      '<p class="godNote" id="gmaSel">Select an element to see ideas.</p>' +
      '<div class="godSection"><h4>Condition</h4>' +
      '<div class="godRow"><select id="gmaCond">' +
      CONDITIONS.map(function (c) { return '<option>' + c + '</option>'; }).join('') +
      '</select></div></div>' +
      '<div class="godSection"><h4>Ideas</h4><div class="godChips" id="gmaChips"></div>' +
      '<div class="godRow" style="margin-top:6px">' +
      '<button id="gmaPreview">Preview</button><button id="gmaApply">Apply</button>' +
      '<button id="gmaReset" class="godDanger">Reset</button></div></div>' +
      '<div class="godSection"><h4>Export</h4>' +
      '<div class="godRow"><button id="gmaToggleCode" class="godWide">&#9656; Copy Animation Code</button></div>' +
      '<div id="gmaCodeWrap" style="display:none">' +
      '<div class="godGrid3"><button id="gmaCopyCss">CSS</button><button id="gmaCopyJs">JS</button>' +
      '<button id="gmaCopyAll">Full Code</button><button id="gmaCopySel">Selector</button>' +
      '<button id="gmaCopySnip">Apply Snippet</button></div>' +
      '<pre class="godOut" id="gmaCode">Pick an idea first.</pre></div></div>' +
      '</div>';
    document.getElementById('godModeRoot').appendChild(panel);
    ['Sel', 'Cond', 'Chips', 'Preview', 'Apply', 'Reset', 'ToggleCode', 'CodeWrap',
     'CopyCss', 'CopyJs', 'CopyAll', 'CopySel', 'CopySnip', 'Code'
    ].forEach(function (k) { els[k] = panel.querySelector('#gma' + k); });
  }

  function refresh() {
    if (!cur) {
      els.Sel.textContent = 'Select an element to see ideas.';
      els.Chips.innerHTML = '';
      return;
    }
    els.Sel.innerHTML = 'Selected: <b>' + U.esc(cur.name) + '</b> · ' + curType;
    var list = ideasFor(curType, condition);
    els.Chips.innerHTML = list.map(function (label) {
      var isApplied = applied.some(function (a) {
        return a.id === cur.id && a.condition === condition && a.label === label;
      });
      return '<button data-label="' + U.esc(label) + '"' + (isApplied ? ' class="godCur"' : '') + '>' +
             U.esc(label) + (isApplied ? ' ✓' : '') + '</button>';
    }).join('');
    U.qsa('button', els.Chips).forEach(function (b) {
      b.addEventListener('click', function () { preview(b.dataset.label); });
    });
  }

  function onSelection(ev) {
    cur = ev.detail.node;
    curType = classify(cur);
    condition = DEFAULT_CONDITION[curType] || 'On Idle';
    els.Cond.value = condition;
    refresh();
  }

  // ------------------------------------------------------------- previews --
  function stripPreview(n) {
    if (!n || !previewClass) return;
    n.el.classList.remove('gmAnim-' + previewClass);
  }

  function preview(label) {
    if (!cur) return;
    var cls = resolve(label);
    stripPreview(cur);
    previewClass = cls;
    lastIdea = { label: label, cls: cls };
    cur.el.classList.remove('gmAnim-' + cls);
    void cur.el.offsetWidth;                     // force a reflow so it replays
    cur.el.classList.add('gmAnim-' + cls);
    buildCode();
    U.toast(label + ' → .gmAnim-' + cls);
  }

  function applyIdea() {
    if (!cur || !lastIdea) { U.toast('Preview an idea first'); return; }
    cur.el.dataset.gmAnim = condition + ':' + lastIdea.label;
    applied = applied.filter(function (a) { return !(a.id === cur.id && a.condition === condition); });
    applied.push({ id: cur.id, condition: condition, label: lastIdea.label, cls: lastIdea.cls, el: cur.el });
    refresh();
    U.toast('Applied: ' + lastIdea.label);
  }

  function resetSelected() {
    if (!cur) return;
    Object.keys(BANK).forEach(function (c) { cur.el.classList.remove('gmAnim-' + c); });
    delete cur.el.dataset.gmAnim;
    applied = applied.filter(function (a) { return a.id !== cur.id; });
    refresh();
  }

  function clearAll() {
    var all = U.nodes();
    Object.keys(all).forEach(function (k) {
      var el = all[k].el;
      if (!el) return;
      Object.keys(BANK).forEach(function (c) { el.classList.remove('gmAnim-' + c); });
      if (el.dataset) delete el.dataset.gmAnim;
    });
    applied = []; previewClass = null; lastIdea = null;
    if (els.Code) els.Code.textContent = 'Pick an idea first.';
    refresh();
  }

  // ---------------------------------------------------------- code export --
  function kebab(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function camel(s) {
    return kebab(s).replace(/-([a-z0-9])/g, function (m, c) { return c.toUpperCase(); });
  }
  function pascal(s) { var c = camel(s); return c.charAt(0).toUpperCase() + c.slice(1); }

  function code() {
    if (!lastIdea) return null;
    var a = BANK[lastIdea.cls];
    var cls = 'anim-' + kebab(lastIdea.label);
    var kf = camel(lastIdea.label);
    var css = '/* ' + lastIdea.label + ' — ' + condition + ' */\n' +
      '.' + cls + ' {\n  animation: ' + kf + ' ' + a.dur + ' ' + a.ease +
      (a.loop ? ' infinite' : ' 1') + ';\n}\n' +
      '@keyframes ' + kf + ' {\n  ' +
      a.frames.replace(/\}(?=\d|$)/g, '}\n  ').replace(/\{/g, ' { ').replace(/\}/g, ' }') +
      '\n}';
    var fn = 'play' + pascal(lastIdea.label);
    var js = '/* replay helper — the reflow makes it retriggerable */\n' +
      'function ' + fn + '(el) {\n' +
      '  if (!el) return;\n' +
      '  el.classList.remove("' + cls + '");\n' +
      '  void el.offsetWidth;\n' +
      '  el.classList.add("' + cls + '");\n' +
      '}';
    return { cls: cls, css: css, js: js, fn: fn, selector: U.selectorFor(cur) };
  }

  function buildCode() {
    var c = code();
    if (!c) return;
    els.Code.textContent = c.css + '\n\n' + c.js;
  }

  function wire() {
    els.Cond.addEventListener('change', function () { condition = this.value; refresh(); });
    els.Preview.addEventListener('click', function () {
      if (lastIdea) preview(lastIdea.label);
      else if (cur) preview(ideasFor(curType, condition)[0]);
    });
    els.Apply.addEventListener('click', applyIdea);
    els.Reset.addEventListener('click', resetSelected);
    els.ToggleCode.addEventListener('click', function () {
      var open = els.CodeWrap.style.display === 'none';
      els.CodeWrap.style.display = open ? 'block' : 'none';
      this.innerHTML = (open ? '&#9662;' : '&#9656;') + ' Copy Animation Code';
    });
    els.CopyCss.addEventListener('click', function () { var c = code(); if (c) { U.copyText(c.css); U.toast('CSS copied'); } });
    els.CopyJs.addEventListener('click', function () { var c = code(); if (c) { U.copyText(c.js); U.toast('JS copied'); } });
    els.CopyAll.addEventListener('click', function () { var c = code(); if (c) { U.copyText(c.css + '\n\n' + c.js); U.toast('Full code copied'); } });
    els.CopySel.addEventListener('click', function () { var c = code(); if (c) { U.copyText(c.selector); U.toast('Selector copied'); } });
    els.CopySnip.addEventListener('click', function () {
      var c = code();
      if (c) { U.copyText(c.fn + '(document.querySelector(\'' + c.selector + '\'));'); U.toast('Snippet copied'); }
    });
    document.addEventListener('godEditorSelectionChanged', onSelection);
  }

  function init() { buildPanel(); wire(); }

  return {
    init: init,
    panel: function () { return panel; },
    clearAll: clearAll,
    classify: classify
  };
};
