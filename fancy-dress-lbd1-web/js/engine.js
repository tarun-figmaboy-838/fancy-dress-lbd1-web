/* ============================================================================
 *  engine.js — minimal uGUI-compatible runtime
 *  Reproduces the subset of Unity behaviour this game uses:
 *  RectTransform layout, CanvasScaler, Image, TextMeshPro, Button, CanvasGroup,
 *  Animator (curve playback), AudioSource, coroutines and DOTween-style tweens.
 * ========================================================================== */
var Engine = (function () {
  'use strict';

  var stage = null;
  var scalerCfg = { mode: 1, ref: [1920, 1080], matchMode: 0, match: 0.5 };
  var scaleFactor = 1;
  var canvasSize = [1920, 1080];   // Unity: screenSize / scaleFactor
  var nodes = {};          // id -> Node
  var tickers = [];        // per-frame callbacks
  var lastTime = 0;

  // ---------------------------------------------------------------- easing --
  var Ease = {
    Linear:    function (t) { return t; },
    InQuad:    function (t) { return t * t; },
    OutQuad:   function (t) { return t * (2 - t); },
    InOutQuad: function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
    InSine:    function (t) { return 1 - Math.cos(t * Math.PI / 2); },
    OutSine:   function (t) { return Math.sin(t * Math.PI / 2); },
    InOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    InCubic:   function (t) { return t * t * t; },
    OutCubic:  function (t) { return 1 - Math.pow(1 - t, 3); },
    OutBack:   function (t) {
      var c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    OutElastic: function (t) {
      var c4 = (2 * Math.PI) / 3;
      return t === 0 ? 0 : t === 1 ? 1
        : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    // Unity AnimationCurve with zero tangents at both ends
    Smooth:    function (t) { return t * t * (3 - 2 * t); }
  };

  /* A relative url() inside a CSS custom property is resolved against the
     stylesheet that reads it, not the document — so sprite paths are made
     absolute before they are handed to --gfx. Memoised: 165 sprites, one URL
     each, re-applied on every sprite swap. */
  var urlCache = {};
  function spriteUrl(path) {
    if (!urlCache[path]) {
      try { urlCache[path] = new URL(path, document.baseURI).href; }
      catch (e) { urlCache[path] = path; }
    }
    return urlCache[path];
  }

  // ------------------------------------------------------- colour helpers --
  function rgba(c) {
    return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' +
      Math.round(c[2] * 255) + ',' + c[3] + ')';
  }

  // ============================================================== Node ====
  function Node(data, parent) {
    this.id = data.id;
    this.name = data.name;
    this.data = data;
    this.parent = parent || null;
    this.children = [];

    // live RectTransform state (mutable, like Unity)
    this.anchoredPos = (data.anchoredPos || data.localPos || [0, 0]).slice();
    this.sizeDelta = (data.sizeDelta || [0, 0]).slice();
    this.anchorMin = (data.anchorMin || [0.5, 0.5]).slice();
    this.anchorMax = (data.anchorMax || [0.5, 0.5]).slice();
    this.pivot = (data.pivot || [0.5, 0.5]).slice();
    this.scale = (data.scale || [1, 1]).slice();
    this.rotZ = data.rotZ || 0;
    this.active = !!data.active;
    this.isRect = data.rect !== false;

    var el = document.createElement('div');
    el.className = 'un';
    el.dataset.id = this.id;
    el.dataset.name = this.name;
    this.el = el;

    var c = data.components || {};

    // ---- Image -------------------------------------------------------
    if (c.image) {
      this.image = {
        sprite: c.image.sprite,
        color: c.image.color.slice(),
        raycast: !!c.image.raycast,
        preserveAspect: !!c.image.preserveAspect,
        enabled: !!c.image.enabled,
        pad: (c.image.raycastPadding || [0, 0, 0, 0]).slice()
      };
      el.classList.add('img');
      // Unity Image.raycastPadding shrinks the hit rect (left, bottom, right, top).
      // Reproduced with an inset child that is the real pointer target; events
      // still bubble to this element, so listeners stay where they are.
      var p = this.image.pad;
      if (p[0] || p[1] || p[2] || p[3]) {
        var hit = document.createElement('div');
        hit.className = 'hit';
        hit.style.left = p[0] + 'px';
        hit.style.top = p[3] + 'px';
        hit.style.right = p[2] + 'px';
        hit.style.bottom = p[1] + 'px';
        el.appendChild(hit);
        this.hitEl = hit;
      }
    }

    // ---- TextMeshPro -------------------------------------------------
    if (c.tmp) {
      var t = c.tmp;
      this.tmp = {
        text: t.text, fontSize: t.fontSize, color: t.color.slice(),
        alignH: t.alignH, alignV: t.alignV, wrap: !!t.wrap,
        charSpacing: t.charSpacing, lineSpacing: t.lineSpacing,
        margin: t.margin.slice(), enabled: !!t.enabled, raycast: !!t.raycast,
        autoSize: !!t.autoSize, sizeMin: t.fontSizeMin, sizeMax: t.fontSizeMax
      };
      var span = document.createElement('div');
      span.className = 'tmp-inner';
      el.appendChild(span);
      this.textEl = span;
      el.classList.add('tmp');
    }

    // ---- Button ------------------------------------------------------
    if (c.button) {
      this.button = {
        interactable: !!c.button.interactable,
        target: c.button.target,
        onClick: c.button.onClick || [],
        listeners: []
      };
    }

    // ---- CanvasGroup -------------------------------------------------
    if (c.canvasGroup) {
      this.canvasGroup = {
        alpha: c.canvasGroup.alpha,
        interactable: !!c.canvasGroup.interactable,
        blocksRaycasts: !!c.canvasGroup.blocksRaycasts
      };
    }

    // ---- Animator ----------------------------------------------------
    if (c.animator) this.animatorCfg = c.animator;

    // ---- AudioSource -------------------------------------------------
    if (c.audioSource) this.audioCfg = c.audioSource;

    // ---- ParticleSystem ----------------------------------------------
    if (c.particle) this.particle = true;

    nodes[this.id] = this;
  }

  Node.prototype.parentSize = function () {
    if (!this.parent) return canvasSize.slice();
    return this.parent.size();
  };

  // Unity: size = (anchorMax - anchorMin) * parentSize + sizeDelta
  Node.prototype.size = function () {
    var P = this.parentSize();
    return [
      Math.max(0, (this.anchorMax[0] - this.anchorMin[0]) * P[0] + this.sizeDelta[0]),
      Math.max(0, (this.anchorMax[1] - this.anchorMin[1]) * P[1] + this.sizeDelta[1])
    ];
  };

  // bottom-left of the rect, in parent space (Unity y-up)
  Node.prototype.rectMin = function () {
    var P = this.parentSize(), s = this.size(), out = [0, 0];
    for (var a = 0; a < 2; a++) {
      var ar = this.anchorMin[a] * P[a] +
               this.pivot[a] * (this.anchorMax[a] - this.anchorMin[a]) * P[a];
      out[a] = ar + this.anchoredPos[a] - this.pivot[a] * s[a];
    }
    return out;
  };

  Node.prototype.applyLayout = function () {
    // The Canvas node is the #stage element itself: its box and the
    // fit-to-viewport transform are owned by computeScale(). Writing a rect
    // here would wipe that transform and render the game unscaled.
    if (this.isStage) return;
    if (!this.isRect) {
      // plain Transform (ParticleSystem roots): localPosition is measured from
      // the parent's pivot. No rect, and the transform scale is a world-space
      // particle scale we deliberately do not apply to the DOM box.
      var PP = this.parentSize();
      var ppv = this.parent ? this.parent.pivot : [0.5, 0.5];
      this.el.style.left = (ppv[0] * PP[0] + this.anchoredPos[0]) + 'px';
      this.el.style.top = ((1 - ppv[1]) * PP[1] - this.anchoredPos[1]) + 'px';
      this.el.style.width = '0px';
      this.el.style.height = '0px';
      this.el.style.transformOrigin = '50% 50%';
      this.el.style.transform = this.rotZ ? 'rotate(' + (-this.rotZ) + 'deg)' : '';
      return;
    }
    var P = this.parentSize(), s = this.size(), mn = this.rectMin();
    var st = this.el.style;
    st.left = mn[0] + 'px';
    st.top = (P[1] - (mn[1] + s[1])) + 'px';
    st.width = s[0] + 'px';
    st.height = s[1] + 'px';
    st.transformOrigin = (this.pivot[0] * 100) + '% ' + ((1 - this.pivot[1]) * 100) + '%';
    var tr = '';
    if (this.rotZ) tr += 'rotate(' + (-this.rotZ) + 'deg) ';
    if (this.scale[0] !== 1 || this.scale[1] !== 1)
      tr += 'scale(' + this.scale[0] + ',' + this.scale[1] + ')';
    st.transform = tr;
  };

  /* The sprite is painted by a ::before layer, not by the element's own
     background. Unity's Image.color.a tints only that one graphic — the drop
     baskets, the hint hands and the right arrows are all alpha-0 hit shapes
     with visible children — whereas CSS opacity on the element would cascade
     and hide everything parented into them. Subtree fading is CanvasGroup's
     job, and that is applied in applyPointer. */
  Node.prototype.applyImage = function () {
    if (!this.image) return;
    var st = this.el.style, im = this.image;
    if (!im.enabled || !im.sprite || !im.sprite.path) {
      st.setProperty('--gfx', 'none');
    } else {
      st.setProperty('--gfx', 'url("' + spriteUrl(im.sprite.path) + '")');
      st.setProperty('--gfxFit', im.preserveAspect ? 'contain' : '100% 100%');
    }
    st.setProperty('--gfxAlpha', String(im.color[3]));
  };

  Node.prototype.applyText = function () {
    if (!this.tmp) return;
    var t = this.tmp, st = this.el.style, is = this.textEl.style;
    st.color = rgba(t.color);
    is.fontFamily = '"' + (window.FONT.family) + '", sans-serif';
    is.fontSize = t.fontSize + 'px';
    is.lineHeight = (t.fontSize * (window.FONT.lineHeight / window.FONT.pointSize) +
                     (t.lineSpacing || 0) * t.fontSize / 100) + 'px';
    is.letterSpacing = ((t.charSpacing || 0) * t.fontSize / 100) + 'px';
    is.whiteSpace = t.wrap ? 'pre-wrap' : 'pre';
    /* TMP margin (x=left, y=top, z=right, w=bottom) insets the text area
       inside the rect, and negative values push it back outside — that is how
       the message bar gets its ~1480px wrap width out of a 200px rect. CSS
       padding cannot be negative, so the text area is an offset inner box. */
    is.left = t.margin[0] + 'px';
    is.top = t.margin[1] + 'px';
    is.right = t.margin[2] + 'px';
    is.bottom = t.margin[3] + 'px';
    // TMP horizontal: 1 Left, 2 Center, 4 Right, 8 Justified
    is.justifyContent = t.alignH === 2 ? 'center' : t.alignH === 4 ? 'flex-end' : 'flex-start';
    is.textAlign = t.alignH === 2 ? 'center' : t.alignH === 4 ? 'right' : 'left';
    // TMP vertical: 256 Top, 512 Middle, 1024 Bottom
    is.alignItems = t.alignV === 256 ? 'flex-start' : t.alignV === 1024 ? 'flex-end' : 'center';
    this.textEl.textContent = t.enabled ? t.text : '';
  };

  Node.prototype.applyActive = function () {
    this.el.style.display = this.active ? '' : 'none';
  };

  Node.prototype.applyPointer = function () {
    var pe = true;
    if (this.image && !this.image.raycast) pe = false;
    if (this.tmp && !this.tmp.raycast) pe = false;
    if (!this.image && !this.tmp && !this.button) pe = false;
    if (this.button) pe = true;
    if (this.canvasGroup && !this.canvasGroup.blocksRaycasts) pe = false;
    if (this.hitEl) {
      this.el.style.pointerEvents = 'none';
      this.hitEl.style.pointerEvents = pe ? 'auto' : 'none';
    } else {
      this.el.style.pointerEvents = pe ? 'auto' : 'none';
    }
    if (this.canvasGroup) {
      this.el.style.opacity = String(this.canvasGroup.alpha);
      if (!this.canvasGroup.interactable) {
        this.el.style.pointerEvents = 'none';
        if (this.hitEl) this.hitEl.style.pointerEvents = 'none';
      }
    }
  };

  Node.prototype.refresh = function () {
    this.applyLayout(); this.applyImage(); this.applyText();
    this.applyActive(); this.applyPointer();
  };

  // relayout this node and everything under it (sizes cascade)
  Node.prototype.refreshTree = function () {
    this.applyLayout();
    for (var i = 0; i < this.children.length; i++) this.children[i].refreshTree();
  };

  // screen-space rect of this node's pivot point (like Transform.position)
  Node.prototype.screenRect = function () {
    return this.el.getBoundingClientRect();
  };

  /* Offset of this node's pivot from its parent's pivot, in the parent's
     local frame (Unity y-up). */
  Node.prototype.localOffset = function () {
    var s = this.size(), mn = this.rectMin();
    var P = this.parentSize();
    var ppv = this.parent ? this.parent.pivot : [0.5, 0.5];
    if (!this.isRect) return [this.anchoredPos[0], this.anchoredPos[1]];
    return [mn[0] + this.pivot[0] * s[0] - ppv[0] * P[0],
            mn[1] + this.pivot[1] * s[1] - ppv[1] * P[1]];
  };

  /* Pivot position in stage coordinates: origin top-left of the 1920x1080
     reference stage, x right, y DOWN. Equivalent to Unity's Transform.position
     for a ScreenSpaceOverlay canvas (up to the uniform canvas scale). */
  Node.prototype.stagePos = function () {
    var off = this.localOffset();
    var x = off[0], y = off[1];
    var p = this.parent;
    while (p) {
      // apply the parent's local rotation + scale to the accumulated offset
      var sx = p.scale[0], sy = p.scale[1];
      x *= sx; y *= sy;
      if (p.rotZ) {
        var r = p.rotZ * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
        var nx = x * cs - y * sn, ny = x * sn + y * cs;
        x = nx; y = ny;
      }
      if (!p.parent) break;               // p is the stage root
      var po = p.localOffset();
      x += po[0]; y += po[1];
      p = p.parent;
    }
    return [canvasSize[0] / 2 + x, canvasSize[1] / 2 - y];
  };

  /* Move this node so its pivot lands on the given stage point.
     Mirrors `transform.position = ...` for our canvas. */
  Node.prototype.setStagePos = function (sx, sy) {
    var cur = this.stagePos();
    var dx = sx - cur[0], dy = sy - cur[1];
    // convert the stage-space delta into this node's parent local frame
    var k = 1, r = 0, p = this.parent;
    while (p) { k *= p.scale[0]; r += p.rotZ; if (!p.parent) break; p = p.parent; }
    if (!k) k = 1;
    var lx = dx / k, ly = -dy / k;
    if (r) {
      var a = -r * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
      var nx = lx * cs - ly * sn, ny = lx * sn + ly * cs;
      lx = nx; ly = ny;
    }
    this.anchoredPos[0] += lx;
    this.anchoredPos[1] += ly;
    this.refreshTree();
  };

  // ======================================================= build / boot ====
  function build(data, parentNode, container) {
    var n = new Node(data, parentNode);
    container.appendChild(n.el);
    if (parentNode) parentNode.children.push(n);
    var kids = data.children || [];
    for (var i = 0; i < kids.length; i++) build(kids[i], n, n.el);
    return n;
  }

  function computeScale() {
    var sw = window.innerWidth / scalerCfg.ref[0];
    var sh = window.innerHeight / scalerCfg.ref[1];
    var s;
    if (scalerCfg.mode !== 1) {           // ConstantPixelSize / Physical
      s = 1;
    } else if (scalerCfg.matchMode === 0) { // MatchWidthOrHeight (log-space lerp)
      var m = scalerCfg.match;
      s = Math.exp(Math.log(sw) * (1 - m) + Math.log(sh) * m);
    } else if (scalerCfg.matchMode === 1) { // Expand
      s = Math.min(sw, sh);
    } else {                                // Shrink
      s = Math.max(sw, sh);
    }
    scaleFactor = s;
    canvasSize = [window.innerWidth / s, window.innerHeight / s];
    if (stage) {
      stage.style.width = canvasSize[0] + 'px';
      stage.style.height = canvasSize[1] + 'px';
      stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
      var r = nodes[stage.dataset.id];
      if (r) r.refreshTree();
    }
  }

  function boot(sceneData, mount) {
    nodes = {};
    scalerCfg = sceneData.scaler || scalerCfg;
    mount.innerHTML = '';
    stage = document.createElement('div');
    stage.id = 'stage';
    mount.appendChild(stage);

    // the Canvas node itself becomes the stage: render its children directly
    var root = sceneData.tree;
    var rootNode = new Node({
      id: root.id, name: root.name, active: 1, rect: true,
      anchoredPos: [0, 0], sizeDelta: [0, 0],
      anchorMin: [0, 0], anchorMax: [1, 1], pivot: [0.5, 0.5],
      scale: [1, 1], rotZ: 0, components: {}, children: []
    }, null);
    rootNode.el = stage;
    rootNode.isStage = true;
    nodes[root.id] = rootNode;
    stage.dataset.id = root.id;

    var kids = root.children || [];
    for (var i = 0; i < kids.length; i++) build(kids[i], rootNode, stage);

    // extra (non-canvas) roots — audio holders etc, no visual
    (sceneData.extra || []).forEach(function (e) {
      var holder = new Node(e, null);
      holder.el.style.display = 'none';
      stage.appendChild(holder.el);
    });

    Object.keys(nodes).forEach(function (k) { if (nodes[k] !== rootNode) nodes[k].refresh(); });
    computeScale();
    wireButtons();
    preloadClipFrames();
    return rootNode;
  }

  /* Sprite-swap clips are one file per frame — tap_anim alone is 69 — and the
     browser would only fetch each one the first time it is displayed, so the
     first loop of the hint hand stutters through half-loaded frames. */
  function preloadClipFrames() {
    var seen = {};
    Object.keys(window.ANIMS || {}).forEach(function (name) {
      (window.ANIMS[name].pptr || []).forEach(function (pc) {
        (pc.frames || []).forEach(function (fr) {
          var p = fr.sprite && fr.sprite.path;
          if (!p || seen[p]) return;
          seen[p] = 1;
          var img = new Image();
          img.src = spriteUrl(p);
          // decode up front: a preloaded-but-undecoded frame still hitches on
          // its first paint, which is exactly when the hint appears
          if (img.decode) img.decode().catch(function () {});
        });
      });
    });
  }

  // ================================================================ API ====
  function node(id) { return nodes[String(id)] || null; }

  function setActive(id, on) {
    var n = node(id); if (!n) return;
    n.active = !!on;
    n.applyActive();
    if (on) {
      n.refreshTree();
      fireActivated(n);
    }
  }
  function activeSelf(id) { var n = node(id); return n ? n.active : false; }

  function activeInHierarchy(id) {
    var n = node(id);
    while (n) { if (!n.active) return false; n = n.parent; }
    return true;
  }

  var activatedHandlers = [];
  function onActivated(fn) { activatedHandlers.push(fn); }
  function fireActivated(n) {
    activatedHandlers.forEach(function (f) { try { f(n); } catch (e) { console.error(e); } });
  }

  function setSprite(id, sprite) {
    var n = node(id); if (!n || !n.image) return;
    n.image.sprite = sprite;
    n.image.enabled = true;
    n.applyImage();
  }
  function setNativeSize(id) {
    var n = node(id);
    if (!n || !n.image || !n.image.sprite || !n.image.sprite.w) return;
    n.sizeDelta = [n.image.sprite.w, n.image.sprite.h];
    n.refreshTree();
  }
  function setImageAlpha(id, a) {
    var n = node(id); if (!n || !n.image) return;
    n.image.color[3] = a; n.applyImage();
  }
  function setImageColor(id, c) {
    var n = node(id); if (!n || !n.image) return;
    n.image.color = c.slice(); n.applyImage();
  }

  function setText(id, str) {
    var n = node(id); if (!n || !n.tmp) return;
    n.tmp.text = str;
    n.textEl.textContent = str;
  }
  function getText(id) { var n = node(id); return n && n.tmp ? n.tmp.text : ''; }

  function setAnchoredPos(id, x, y) {
    var n = node(id); if (!n) return;
    if (x !== null && x !== undefined) n.anchoredPos[0] = x;
    if (y !== null && y !== undefined) n.anchoredPos[1] = y;
    n.refreshTree();
  }
  function getAnchoredPos(id) { var n = node(id); return n ? n.anchoredPos.slice() : [0, 0]; }

  function setSizeDelta(id, x, y) {
    var n = node(id); if (!n) return;
    if (x !== null && x !== undefined) n.sizeDelta[0] = x;
    if (y !== null && y !== undefined) n.sizeDelta[1] = y;
    n.refreshTree();
  }

  function setScale(id, sx, sy) {
    var n = node(id); if (!n) return;
    n.scale[0] = sx; n.scale[1] = (sy === undefined ? sx : sy);
    n.applyLayout();
  }
  function getScale(id) { var n = node(id); return n ? n.scale.slice() : [1, 1]; }

  function setRotZ(id, deg) {
    var n = node(id); if (!n) return;
    n.rotZ = deg; n.applyLayout();
  }

  function setInteractable(id, on) {
    var n = node(id); if (!n || !n.button) return;
    n.button.interactable = !!on;
    n.el.classList.toggle('nointeract', !on);
  }
  function isInteractable(id) { var n = node(id); return !!(n && n.button && n.button.interactable); }

  function setCanvasGroupAlpha(id, a) {
    var n = node(id); if (!n || !n.canvasGroup) return;
    n.canvasGroup.alpha = a; n.el.style.opacity = String(a);
  }
  function setBlocksRaycasts(id, on) {
    var n = node(id); if (!n || !n.canvasGroup) return;
    n.canvasGroup.blocksRaycasts = !!on;
    n.applyPointer();
  }

  // ---- reparent / sibling order (Unity SetParent / SetAsLastSibling) ----
  function setParent(id, parentId, worldStays) {
    var n = node(id), p = node(parentId);
    if (!n || !p) return;
    var keep = (worldStays === undefined) ? true : !!worldStays;
    var before = keep ? n.stagePos() : null;
    if (n.parent) {
      var i = n.parent.children.indexOf(n);
      if (i >= 0) n.parent.children.splice(i, 1);
    }
    n.parent = p;
    p.children.push(n);
    p.el.appendChild(n.el);
    n.refreshTree();
    if (before) n.setStagePos(before[0], before[1]);
  }
  function setAsLastSibling(id) {
    var n = node(id); if (!n || !n.parent) return;
    n.parent.el.appendChild(n.el);
    var i = n.parent.children.indexOf(n);
    if (i >= 0) { n.parent.children.splice(i, 1); n.parent.children.push(n); }
  }
  function setAsFirstSibling(id) {
    var n = node(id); if (!n || !n.parent) return;
    n.parent.el.insertBefore(n.el, n.parent.el.firstChild);
    var i = n.parent.children.indexOf(n);
    if (i >= 0) { n.parent.children.splice(i, 1); n.parent.children.unshift(n); }
  }

  // ------------------------------------------------------------ clicking --
  function addClickListener(id, fn) {
    var n = node(id); if (!n || !n.button) return;
    n.button.listeners.push(fn);
  }
  function removeAllClickListeners(id) {
    var n = node(id); if (!n || !n.button) return;
    n.button.listeners.length = 0;
  }

  function wireButtons() {
    Object.keys(nodes).forEach(function (k) {
      var n = nodes[k];
      if (!n.button) return;
      n.el.classList.add('btn');
      if (!n.button.interactable) n.el.classList.add('nointeract');
      n.el.addEventListener('pointerdown', function (e) {
        if (!n.button.interactable) return;
        n.el.classList.add('pressed');
      });
      n.el.addEventListener('pointerup', function () { n.el.classList.remove('pressed'); });
      n.el.addEventListener('pointerleave', function () { n.el.classList.remove('pressed'); });
      n.el.addEventListener('click', function (e) {
        if (!n.button.interactable || !activeInHierarchy(n.id)) return;
        e.stopPropagation();
        // Unity persistent (inspector-wired) calls run first
        n.button.onClick.forEach(function (c) {
          if (c.state === 0) return;              // Off
          runPersistentCall(c);
        });
        n.button.listeners.slice().forEach(function (f) {
          try { f(); } catch (err) { console.error(err); }
        });
      });
    });
  }

  function runPersistentCall(c) {
    if (c.method === 'SetActive' && c.type === 'UnityEngine.GameObject') {
      setActive(c.target, !!c.bool);
    } else if (c.method === 'Play' && c.type === 'UnityEngine.AudioSource') {
      Audio2.sourcePlay(c.target);
    } else if (c.method === 'Stop' && c.type === 'UnityEngine.AudioSource') {
      Audio2.sourceStop(c.target);
    }
  }

  // ============================================== coroutines and tweens ====
  function TaskGroup() { this.dead = false; this.tweens = []; }
  TaskGroup.prototype.kill = function () {
    this.dead = true;
    this.tweens.forEach(function (t) { t.dead = true; });
    this.tweens.length = 0;
  };
  TaskGroup.prototype.check = function () { if (this.dead) throw CANCEL; };

  var CANCEL = { cancelled: true };

  function isCancel(e) { return e === CANCEL; }

  function wait(sec, tok) {
    return new Promise(function (res, rej) {
      var t = 0;
      var f = function (dt) {
        if (tok && tok.dead) { remove(f); rej(CANCEL); return; }
        t += dt;
        if (t >= sec) { remove(f); res(); }
      };
      add(f);
    });
  }

  function waitUntil(pred, tok) {
    return new Promise(function (res, rej) {
      var f = function () {
        if (tok && tok.dead) { remove(f); rej(CANCEL); return; }
        if (pred()) { remove(f); res(); }
      };
      add(f);
    });
  }

  function tween(dur, easeFn, apply, tok) {
    if (typeof easeFn === 'string') easeFn = Ease[easeFn] || Ease.Linear;
    return new Promise(function (res, rej) {
      if (dur <= 0) { apply(1); res(); return; }
      var t = 0;
      var f = function (dt) {
        if (tok && tok.dead) { remove(f); rej(CANCEL); return; }
        t += dt;
        var u = Math.min(1, t / dur);
        apply(easeFn(u));
        if (u >= 1) { remove(f); res(); }
      };
      add(f);
    });
  }

  /* DOScale(...).SetLoops(-1, Yoyo).SetEase(...) */
  function loopScale(id, from, to, dur, easeFn) {
    if (typeof easeFn === 'string') easeFn = Ease[easeFn] || Ease.InOutSine;
    var handle = { dead: false };
    var t = 0, dir = 1;
    var f = function (dt) {
      if (handle.dead) { remove(f); return; }
      t += dt * dir;
      if (t >= dur) { t = dur; dir = -1; }
      else if (t <= 0) { t = 0; dir = 1; }
      var u = easeFn(t / dur);
      var s = from + (to - from) * u;
      setScale(id, s);
    };
    add(f);
    handle.kill = function () { handle.dead = true; remove(f); };
    return handle;
  }

  function add(f) { tickers.push(f); }
  function remove(f) { var i = tickers.indexOf(f); if (i >= 0) tickers.splice(i, 1); }

  function frame(now) {
    if (!lastTime) lastTime = now;
    var dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    var list = tickers.slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i](dt); } catch (e) { if (!isCancel(e)) console.error(e); }
    }
    requestAnimationFrame(frame);
  }

  // ============================================================== audio ====
  var Audio2 = (function () {
    var cache = {};
    var durations = {};
    var sources = {};   // nodeId -> {clip, el}

    function get(src) {
      if (!cache[src]) {
        var a = new Audio(src);
        a.preload = 'auto';
        cache[src] = a;
      }
      return cache[src];
    }

    function duration(src) {
      return new Promise(function (res) {
        if (!src) { res(0); return; }
        if (durations[src] !== undefined) { res(durations[src]); return; }
        var a = get(src);
        if (a.readyState >= 1 && isFinite(a.duration)) {
          durations[src] = a.duration; res(a.duration); return;
        }
        var done = false;
        var ok = function () {
          if (done) return; done = true;
          durations[src] = isFinite(a.duration) ? a.duration : 2;
          res(durations[src]);
        };
        a.addEventListener('loadedmetadata', ok, { once: true });
        a.addEventListener('error', ok, { once: true });
        setTimeout(ok, 4000);
        try { a.load(); } catch (e) { ok(); }
      });
    }

    /* an AudioSource component: one clip at a time, .Stop()/.Play()/.isPlaying */
    function Source(id) {
      this.id = id; this.clip = null; this.el = null; this.playing = false;
    }
    Source.prototype.setClip = function (src) { this.clip = src; };
    Source.prototype.play = function () {
      var self = this;
      this.stop();
      if (!this.clip) return;
      var a = get(this.clip);
      this.el = a;
      try { a.currentTime = 0; } catch (e) {}
      this.playing = true;
      a.onended = function () { self.playing = false; };
      var p = a.play();
      if (p && p.catch) p.catch(function () { self.playing = false; });
    };
    Source.prototype.playOneShot = function (src) {
      if (!src) return;
      var a = get(src).cloneNode();
      var p = a.play(); if (p && p.catch) p.catch(function () {});
    };
    Source.prototype.stop = function () {
      if (this.el) { try { this.el.pause(); this.el.currentTime = 0; } catch (e) {} }
      this.playing = false;
    };
    Source.prototype.isPlaying = function () {
      return this.playing && this.el && !this.el.paused && !this.el.ended;
    };

    function source(id) {
      id = String(id);
      if (!sources[id]) {
        sources[id] = new Source(id);
        var n = node(id);
        if (n && n.audioCfg && n.audioCfg.clip) sources[id].setClip(n.audioCfg.clip);
      }
      return sources[id];
    }

    /* Unity knows AudioClip.length instantly; we preload metadata at boot so
       the ported coroutines can read it synchronously and keep their timing. */
    function preload(list) {
      return Promise.all(list.filter(Boolean).map(duration));
    }
    /* Instruction typing speed is clipLength / characters, so a wrong length
       desyncs the text from the voice and lets the next line cut this one off.
       preload() gives up after 4s on a cold load and caches a 2s guess, so
       adopt the element's real duration as soon as it knows it. */
    function len(src) {
      if (!src) return 0;
      var a = cache[src];
      if (a && isFinite(a.duration) && a.duration > 0) durations[src] = a.duration;
      return durations[src] !== undefined ? durations[src] : 2;
    }

    return {
      get: get, duration: duration, source: source,
      preload: preload, len: len,
      sourcePlay: function (id) { source(id).play(); },
      sourceStop: function (id) { source(id).stop(); },
      /* A scene change drops every Source object, but the <audio> elements are
         cached per file and keep playing — the old scene's line would then run
         over the new one. Silence them all before letting go. */
      reset: function () {
        Object.keys(sources).forEach(function (k) { sources[k].stop(); });
        Object.keys(cache).forEach(function (k) {
          try { cache[k].pause(); cache[k].currentTime = 0; } catch (e) {}
        });
        sources = {};
      }
    };
  })();

  // =========================================================== animator ====
  function evalCurve(keys, time) {
    if (!keys.length) return 0;
    if (time <= keys[0].t) return keys[0].v;
    var last = keys[keys.length - 1];
    if (time >= last.t) return last.v;
    for (var i = 0; i < keys.length - 1; i++) {
      var k1 = keys[i], k2 = keys[i + 1];
      if (time >= k1.t && time <= k2.t) {
        if (k1.step || k2.step) return k1.v;            // discrete (bool/int)
        var dt = k2.t - k1.t;
        if (dt <= 0) return k2.v;
        var u = (time - k1.t) / dt;
        var m1 = (typeof k1.o === 'number' ? k1.o : 0) * dt;
        var m2 = (typeof k2.i === 'number' ? k2.i : 0) * dt;
        var u2 = u * u, u3 = u2 * u;
        return (2 * u3 - 3 * u2 + 1) * k1.v + (u3 - 2 * u2 + u) * m1 +
               (-2 * u3 + 3 * u2) * k2.v + (u3 - u2) * m2;
      }
    }
    return last.v;
  }

  function findByPath(hostId, path) {
    var n = node(hostId);
    if (!n) return null;
    if (!path) return n;
    var parts = path.split('/');
    for (var i = 0; i < parts.length; i++) {
      var want = parts[i], found = null;
      for (var j = 0; j < n.children.length; j++) {
        if (n.children[j].name === want) { found = n.children[j]; break; }
      }
      if (!found) {  // tolerate trailing-space mismatches in Unity names
        for (var j2 = 0; j2 < n.children.length; j2++) {
          if (n.children[j2].name.trim() === want.trim()) { found = n.children[j2]; break; }
        }
      }
      if (!found) return null;
      n = found;
    }
    return n;
  }

  function readAttr(target, attr) {
    if (!target) return 0;
    switch (attr) {
      case 'm_AnchoredPosition.x': return target.anchoredPos[0];
      case 'm_AnchoredPosition.y': return target.anchoredPos[1];
      case 'm_SizeDelta.x': return target.sizeDelta[0];
      case 'm_SizeDelta.y': return target.sizeDelta[1];
      case 'localEulerAnglesRaw.z': return target.rotZ;
      case 'm_IsActive': return target.active ? 1 : 0;
      default: return 0;
    }
  }

  function applyAttr(target, attr, val) {
    if (!target) return;
    switch (attr) {
      case 'm_AnchoredPosition.x': target.anchoredPos[0] = val; target.refreshTree(); break;
      case 'm_AnchoredPosition.y': target.anchoredPos[1] = val; target.refreshTree(); break;
      case 'm_SizeDelta.x': target.sizeDelta[0] = val; target.refreshTree(); break;
      case 'm_SizeDelta.y': target.sizeDelta[1] = val; target.refreshTree(); break;
      case 'localEulerAnglesRaw.z': target.rotZ = val; target.applyLayout(); break;
      case 'localEulerAnglesRaw.x': case 'localEulerAnglesRaw.y': break;
      case 'm_IsActive': setActive(target.id, val >= 0.5); break;
      default: break;
    }
  }

  function Animator(hostId) {
    this.hostId = hostId;
    this.enabled = true;
    this.params = {};
    this.current = null;
    this._ticker = null;
    this.time = 0;
  }

  Animator.prototype.sample = function (clip, time, blend) {
    var i;
    for (i = 0; i < clip.curves.length; i++) {
      var c = clip.curves[i];
      var target = findByPath(this.hostId, c.path);
      if (!target) continue;
      var v = evalCurve(c.keys, time);
      // Animator.CrossFade blends the previous pose into the new clip.
      // Discrete (bool/int) curves are not blended, matching Unity.
      if (blend !== undefined && blend < 1 && c.attr !== 'm_IsActive') {
        var from = this._snap ? this._snap[i] : v;
        v = from + (v - from) * blend;
      }
      applyAttr(target, c.attr, v);
    }
    for (i = 0; i < (clip.pptr || []).length; i++) {
      var pc = clip.pptr[i];
      var t2 = findByPath(this.hostId, pc.path);
      if (!t2) continue;
      var fr = pc.frames[0];
      for (var k = 0; k < pc.frames.length; k++) {
        if (pc.frames[k].t <= time) fr = pc.frames[k]; else break;
      }
      if (fr && fr.sprite) setSprite(t2.id, fr.sprite);
    }
  };

  Animator.prototype.stop = function () {
    if (this._ticker) { remove(this._ticker); this._ticker = null; }
  };

  Animator.prototype.play = function (clipName, onDone, fade) {
    var clip = window.ANIMS[clipName];
    if (!clip) { if (onDone) onDone(); return; }
    var self = this;
    this.stop();
    this.current = clipName;
    this.time = 0;
    fade = fade || 0;

    // snapshot the outgoing pose so CrossFade can blend out of it
    this._snap = null;
    if (fade > 0) {
      this._snap = clip.curves.map(function (c) {
        return readAttr(findByPath(self.hostId, c.path), c.attr);
      });
    }

    if (clip.stop <= 0) {
      if (fade > 0) {                       // blend into a single-key pose
        var g = function (dt) {
          if (!self.enabled) return;
          self.time += dt;
          var b = Math.min(1, self.time / fade);
          self.sample(clip, 0, b);
          if (b >= 1) { remove(g); self._ticker = null; self._snap = null; if (onDone) onDone(); }
        };
        this._ticker = g; add(g); return;
      }
      this.sample(clip, 0);
      if (onDone) onDone();
      return;
    }

    var f = function (dt) {
      if (!self.enabled) return;
      self.time += dt;
      var t = self.time;
      if (clip.loop) t = t % clip.stop;
      else if (t > clip.stop) t = clip.stop;
      var b = fade > 0 ? Math.min(1, self.time / fade) : undefined;
      self.sample(clip, t, b);
      if (!clip.loop && self.time >= clip.stop) {
        remove(f); self._ticker = null; self._snap = null;
        if (onDone) onDone();
      }
    };
    this._ticker = f;
    add(f);
  };

  /* Animator.CrossFade(state, dur) — blend the live pose into the new clip
     over `dur` seconds while the clip advances, as Unity does. Without this
     the balance pans snap back to their neutral y before re-tilting. */
  Animator.prototype.crossFade = function (clipName, dur, onDone) {
    this.play(clipName, onDone, dur || 0);
  };

  Animator.prototype.setInteger = function (name, v) {
    this.params[name] = v;
    if (this.onParam) this.onParam(name, v);
  };

  var animators = {};
  function animator(hostId) {
    hostId = String(hostId);
    if (!animators[hostId]) animators[hostId] = new Animator(hostId);
    return animators[hostId];
  }

  // ==================================================== confetti burst =====
  /* ---------------------------------------------------------- confetti --
     A short celebration shower. Particles are created once per call, fall
     from just above the stage, and remove themselves when their animation
     ends — nothing is ever left parked at the top edge, and nothing exists
     before a celebration starts. */
  /* Every confetti knob in one place — tune here, nothing else needs editing.
     sizePx/fallSec are the two that most change how it reads: bigger and
     slower = more celebratory, smaller and faster = more subtle. */
  var CONFETTI = {
    countDesktop: [55, 70],    // pieces on a wide screen
    countMobile:  [28, 38],    // pieces under 768px
    emitSec:      [0, 1.4],    // when each piece enters — the spread is what
                               // makes it a shower rather than one wave
    fallSec:      [1.8, 3.0],  // how long a piece takes to cross the screen
    sizePx:       [16, 28],    // paper size
    driftPx:      70,          // sideways travel, plus or minus
    rotationDeg:  240,         // spin, plus or minus
    windowMs:     4500         // total life of the shower
  };

  var confettiLayer = null, confettiTimer = 0;
  var CONFETTI_COLORS = ['#ffd23f', '#ff7a5c', '#3fc7c0', '#ff77b0', '#a06cd5', '#7fe0a8'];
  var CONFETTI_SHAPES = ['rect', 'rect', 'ribbon', 'star', 'dot'];

  function rand(a, b) { return a + Math.random() * (b - a); }

  function clearConfetti() {
    if (confettiTimer) { clearTimeout(confettiTimer); confettiTimer = 0; }
    if (confettiLayer && confettiLayer.parentNode) confettiLayer.parentNode.removeChild(confettiLayer);
    confettiLayer = null;
  }

  /* playConfettiShower({ count, duration }) — one clean shower; calling it
     again cancels whatever is still running rather than stacking. */
  function playConfettiShower(opts) {
    if (!stage) return;
    opts = opts || {};
    clearConfetti();

    var reduced = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var mobile = window.innerWidth < 768;
    var span = mobile ? CONFETTI.countMobile : CONFETTI.countDesktop;
    var count = opts.count || (reduced ? 10 : Math.round(rand(span[0], span[1])));
    var total = opts.duration || (reduced ? 800 : CONFETTI.windowMs);

    confettiLayer = document.createElement('div');
    confettiLayer.id = 'confetti-layer';
    confettiLayer.setAttribute('aria-hidden', 'true');
    stage.appendChild(confettiLayer);

    var fall = canvasSize[1] + 120;

    /* Pure shower: no burst, no flash. Every piece falls from above the stage,
       staggered across a wide emission window so confetti is arriving at the top
       while earlier pieces are still drifting past the bottom. */
    var burstCount = 0;
    for (var i = 0; i < count; i++) {
      var p = document.createElement('i');
      var shape = CONFETTI_SHAPES[i % CONFETTI_SHAPES.length];
      p.className = shape;
      p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      var isBurst = i < burstCount;
      if (isBurst) {
        // fire outward on a random heading, biased upward, then fall away
        p.classList.add('pop');
        var ang = -Math.PI / 2 + rand(-1, 1) * 1.15;
        var reach = rand(220, 620);
        p.style.left = '50%';
        p.style.top = '46%';
        p.style.setProperty('--drift-mid', (Math.cos(ang) * reach * 0.62).toFixed(0) + 'px');
        p.style.setProperty('--fall-mid', (Math.sin(ang) * reach).toFixed(0) + 'px');
        p.style.setProperty('--drift-x', (Math.cos(ang) * reach * 1.15).toFixed(0) + 'px');
        p.style.setProperty('--fall-distance', (canvasSize[1] * 0.62).toFixed(0) + 'px');
        p.style.setProperty('--duration', rand(1.2, 1.9).toFixed(2) + 's');
        p.style.setProperty('--delay', rand(0, 0.12).toFixed(2) + 's');
      } else {
      p.style.setProperty('--start-x', rand(2, 98).toFixed(2) + '%');
      p.style.setProperty('--start-y', (-rand(20, 60)).toFixed(0) + 'px');
      var drift = rand(-CONFETTI.driftPx, CONFETTI.driftPx);
      p.style.setProperty('--drift-x', drift.toFixed(0) + 'px');
      p.style.setProperty('--drift-mid', (drift * 0.55).toFixed(1) + 'px');
      p.style.setProperty('--fall-distance', (reduced ? 140 : fall) + 'px');
      p.style.setProperty('--fall-mid', ((reduced ? 140 : fall) * 0.45).toFixed(1) + 'px');
      var rot = reduced ? rand(-30, 30) : rand(-CONFETTI.rotationDeg, CONFETTI.rotationDeg);
      p.style.setProperty('--rotation', rot.toFixed(0) + 'deg');
      p.style.setProperty('--rotation-mid', (rot * 0.45).toFixed(0) + 'deg');
      p.style.setProperty('--duration', (reduced ? 0.7 : rand(CONFETTI.fallSec[0], CONFETTI.fallSec[1])).toFixed(2) + 's');
      p.style.setProperty('--delay', (reduced ? 0 : rand(CONFETTI.emitSec[0], CONFETTI.emitSec[1])).toFixed(2) + 's');
      }
      p.style.setProperty('--scale', rand(0.75, 1.25).toFixed(2));
      var w = rand(CONFETTI.sizePx[0], CONFETTI.sizePx[1]);
      p.style.width = w.toFixed(1) + 'px';
      p.style.height = (shape === 'ribbon' ? w * 2.2 : shape === 'dot' ? w : w * 1.5).toFixed(1) + 'px';
      // each piece cleans itself up the moment it is done
      p.addEventListener('animationend', function () {
        if (this.parentNode) this.parentNode.removeChild(this);
      });
      confettiLayer.appendChild(p);
    }
    confettiTimer = setTimeout(clearConfetti, total + 1200);
  }

  /* A piñata for the win moment: it drops on its string, swings a few times,
     then takes a whack and blows apart — and the shower starts on that burst so
     the confetti reads as coming out of it. Drawn in CSS (see .pinata), so no
     new asset is needed. Skipped entirely under reduced motion. */
  var PINATA_BURST_MS = 2150;      // must match the .pinata pop keyframe timing

  function playPinataCelebration(opts) {
    if (!stage) return;
    var reduced = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (reduced) { playConfettiShower(opts); return; }

    clearConfetti();
    confettiLayer = document.createElement('div');
    confettiLayer.id = 'confetti-layer';
    confettiLayer.setAttribute('aria-hidden', 'true');
    stage.appendChild(confettiLayer);

    var string = document.createElement('u');
    string.className = 'pinata-string';
    confettiLayer.appendChild(string);

    var pinata = document.createElement('div');
    pinata.className = 'pinata';
    pinata.appendChild(document.createElement('i'));   // striped star body
    pinata.appendChild(document.createElement('b'));   // paper fringe
    confettiLayer.appendChild(pinata);

    /* The shower builds its own layer, so let the piñata finish first and hand
       over on the burst. Tracked on confettiTimer so a second win cancels it. */
    confettiTimer = setTimeout(function () {
      confettiTimer = 0;
      playConfettiShower(opts);
    }, PINATA_BURST_MS);
  }

  /* The scene's ConfettiBlast objects call through here; the burst position is
     no longer used, the celebration covers the stage. */
  function confetti(nodeId, opts) { playPinataCelebration(opts); }

  /* pointer client coords -> stage coords (top-left origin, y DOWN) */
  function pointerToStage(ev) {
    var r = stage.getBoundingClientRect();
    return [(ev.clientX - r.left) / scaleFactor, (ev.clientY - r.top) / scaleFactor];
  }

  /* a node's rect in stage coords, Unity-style y-UP from the stage bottom */
  function stageRectYUp(id) {
    var n = node(id); if (!n) return null;
    var sp = n.stagePos();                 // pivot, y-down
    var sz = n.size();
    var w = sz[0] * n.scale[0], h = sz[1] * n.scale[1];
    var cx = sp[0], cyUp = canvasSize[1] - sp[1];
    return {
      xMin: cx - n.pivot[0] * w, xMax: cx + (1 - n.pivot[0]) * w,
      yMin: cyUp - n.pivot[1] * h, yMax: cyUp + (1 - n.pivot[1]) * h,
      w: w, h: h, pivotX: cx, pivotY: cyUp
    };
  }

  /* Unity RectTransformUtility.ScreenPointToLocalPointInRectangle:
     pointer position relative to the node's pivot, y-UP */
  function localPointInRect(id, stageXY) {
    var n = node(id); if (!n) return null;
    var sp = n.stagePos();
    return [stageXY[0] - sp[0], -(stageXY[1] - sp[1])];
  }

  // ------------------------------------------------------------- exports --
  window.addEventListener('resize', computeScale);
  requestAnimationFrame(frame);

  return {
    boot: boot, node: node, nodes: function () { return nodes; },
    setActive: setActive, activeSelf: activeSelf, activeInHierarchy: activeInHierarchy,
    onActivated: onActivated,
    setSprite: setSprite, setNativeSize: setNativeSize,
    setImageAlpha: setImageAlpha, setImageColor: setImageColor,
    setText: setText, getText: getText,
    setAnchoredPos: setAnchoredPos, getAnchoredPos: getAnchoredPos,
    setSizeDelta: setSizeDelta,
    setScale: setScale, getScale: getScale, setRotZ: setRotZ,
    setInteractable: setInteractable, isInteractable: isInteractable,
    setCanvasGroupAlpha: setCanvasGroupAlpha, setBlocksRaycasts: setBlocksRaycasts,
    setParent: setParent, setAsLastSibling: setAsLastSibling, setAsFirstSibling: setAsFirstSibling,
    addClickListener: addClickListener, removeAllClickListeners: removeAllClickListeners,
    TaskGroup: TaskGroup, CANCEL: CANCEL, isCancel: isCancel,
    wait: wait, waitUntil: waitUntil, tween: tween, loopScale: loopScale,
    Ease: Ease, add: add, remove: remove,
    Audio: Audio2, animator: animator, findByPath: findByPath,
    confetti: confetti, playConfettiShower: playConfettiShower,
    playPinataCelebration: playPinataCelebration, CONFETTI: CONFETTI,
    pointerToStage: pointerToStage, stageRectYUp: stageRectYUp,
    localPointInRect: localPointInRect,
    stagePos: function (id) { var n = node(id); return n ? n.stagePos() : [0, 0]; },
    setStagePos: function (id, x, y) { var n = node(id); if (n) n.setStagePos(x, y); },
    scaleFactor: function () { return scaleFactor; },
    stage: function () { return stage; },
    ref: function () { return scalerCfg.ref.slice(); },
    canvas: function () { return canvasSize.slice(); }
  };
})();
