/* ============================================================================
 *  controllers.js — one function per MonoBehaviour, ported line-by-line.
 *  State machines, delays, easings and edge cases follow the original C#.
 * ========================================================================== */
var Controllers = (function () {
  'use strict';

  var E = Engine;
  var COMP = {};        // scriptName -> { nodeId: instance }
  var pending = [];     // { hostId, name, startFn, started }

  function put(name, nodeId, inst) {
    (COMP[name] = COMP[name] || {})[String(nodeId)] = inst;
  }
  function get(name, nodeId) {
    return (COMP[name] || {})[String(nodeId)] || null;
  }

  /* Unity only runs Start() once the GameObject is actually active, so
     controllers on hidden levels must stay dormant until they are shown. */
  function register(hostId, name, startFn) {
    pending.push({ hostId: String(hostId), name: name, startFn: startFn, started: false });
  }
  function tickControllers() {
    for (var i = 0; i < pending.length; i++) {
      var p = pending[i];
      if (p.started) continue;
      if (!E.activeInHierarchy(p.hostId)) continue;
      p.started = true;
      try { p.startFn(); } catch (e) { console.error('[' + p.name + '] Start failed', e); }
    }
  }
  function isStarted(hostId, name) {
    for (var i = 0; i < pending.length; i++)
      if (pending[i].hostId === String(hostId) && pending[i].name === name) return pending[i].started;
    return false;
  }

  // ------------------------------------------------------ coroutine runner --
  function Runner() { this.main = new E.TaskGroup(); this.named = {}; }
  Runner.prototype.fresh = function (name) {
    if (this.named[name]) this.named[name].kill();
    return (this.named[name] = new E.TaskGroup());
  };
  Runner.prototype.stop = function (name) {
    if (this.named[name]) { this.named[name].kill(); delete this.named[name]; }
  };
  Runner.prototype.stopAll = function () {
    this.main.kill();
    var self = this;
    Object.keys(this.named).forEach(function (k) { self.named[k].kill(); });
    this.named = {};
    this.main = new E.TaskGroup();
  };
  Runner.prototype.run = function (fn, tok) {
    var t = tok || this.main;
    Promise.resolve()
      .then(function () { return fn(t); })
      .catch(function (e) { if (!E.isCancel(e)) console.error(e); });
    return t;
  };

  // ------------------------------------------------------- tween utilities --
  /* DOTween .DOScale(to, dur).SetEase(ease) — from the current scale */
  function doScale(id, to, dur, ease, tok) {
    var from = E.getScale(id)[0];
    return E.tween(dur, ease, function (u) { E.setScale(id, from + (to - from) * u); }, tok);
  }

  /* Catmull-Rom spline through waypoints, endpoints duplicated (DOTween's
     PathType.CatmullRom behaviour). pts are stage coords. */
  function catmull(pts, u) {
    var n = pts.length - 1;
    var seg = Math.min(n - 1, Math.floor(u * n));
    var lt = u * n - seg;
    var p0 = pts[Math.max(0, seg - 1)], p1 = pts[seg],
        p2 = pts[Math.min(n, seg + 1)], p3 = pts[Math.min(n, seg + 2)];
    var t2 = lt * lt, t3 = t2 * lt, out = [0, 0];
    for (var a = 0; a < 2; a++) {
      out[a] = 0.5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * lt +
        (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 +
        (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3);
    }
    return out;
  }
  function doPath(ids, pts, dur, ease, tok) {
    return E.tween(dur, ease, function (u) {
      var p = catmull(pts, u);
      ids.forEach(function (id) { E.setStagePos(id, p[0], p[1]); });
    }, tok);
  }

  /* The tap-hand frames are 1200x1200 with the hand drawn around x 0.40-0.63,
     y 0.43-0.80 (it travels up and down as it taps), so its visible centre sits
     well below the middle of the node. Centring the node on a target therefore
     parks the hand below whatever it is pointing at. */
  var HAND_ART = { cx: 0.512, cy: 0.60 };

  /* On a button the hand reads better sitting low, over the button's lower
     edge, rather than centred on it — 0.15 of the hand's own height, so it
     holds at either scale the two scenes use. */
  var BUTTON_HINT_DROP = 0.15;

  /* Put the hand's visible centre — not its node centre — on a stage point.
     dropFrac nudges it down by a fraction of its own height. */
  function placeHand(id, stageX, stageY, dropFrac) {
    var n = E.node(id);
    if (!n) return;
    var sz = n.size(), h = sz[1] * n.scale[1];
    E.setStagePos(id, stageX - (HAND_ART.cx - 0.5) * sz[0] * n.scale[0],
                      stageY - (HAND_ART.cy - 0.5) * h + (dropFrac || 0) * h);
  }

  /* Light the Heavier / Lighter label up in its own colour when it appears. */
  function glowLabel(id, isHeavy) {
    var node = E.node(id);
    if (!node) return;
    node.el.classList.remove('labelGlow', 'heavy', 'light');
    void node.el.offsetWidth;
    node.el.classList.add('labelGlow', isHeavy ? 'heavy' : 'light');
  }

  /* A short pop on the item that was just chosen. The class drives the ::before
     sprite layer, so it composes with whatever rotate/scale the element itself
     carries; the reflow makes it replay on every tap. */
  function tapPop(id) {
    var n = E.node(id);
    if (!n) return;
    n.el.classList.remove('tapPop');
    void n.el.offsetWidth;
    n.el.classList.add('tapPop');
  }

  /* Copy one hint's image, box and scale onto another so the "tap this item"
     hand renders exactly like the "tap this button" hand instead of using the
     static pointing-hand sprite. */
  function copyHandArt(fromId, toId) {
    var src = E.node(fromId), dst = E.node(toId);
    if (!src || !dst || !src.image || !src.image.sprite) return false;
    E.setSprite(toId, src.image.sprite);
    E.setSizeDelta(toId, src.sizeDelta[0], src.sizeDelta[1]);
    E.setScale(toId, src.scale[0], src.scale[1]);
    return true;
  }

  // =========================================================================
  //  ButtonAnimator  (Tutorial: the "Let's Go" splash button)
  // =========================================================================
  function ButtonAnimator(f, hostId) {
    var self = { runner: new Runner(), loop: null };
    var go = f.goButton, panel = f.gameplayPanel;

    register(hostId, 'ButtonAnimator', function start() {
      // DOTween.defaultEaseType = InOutSine (global tuning in the original)
      E.setScale(go, 1);
      // .DOScale(1, 1).From(0.8).SetEase(InOutSine).SetLoops(-1, Yoyo)
      self.loop = E.loopScale(go, 0.8, 1, 1, 'InOutSine');

      E.setActive(panel, false);

      E.addClickListener(go, function onGoClicked() {
        var src = E.Audio.source(f.audioSource);
        src.playOneShot(f.buttonClickAudio);
        if (self.loop) self.loop.kill();
        E.setInteractable(go, false);
        self.runner.run(function (tok) {
          return E.wait(f.audioDelayBeforeDisable, tok).then(function () {
            E.setActive(go, false);
            E.setActive(panel, true);
            tickControllers();
          });
        });
      });
    });
    put('ButtonAnimator', hostId, self);
    return self;
  }

  // =========================================================================
  //  TutorialManager  (Tutorial scene: guided demo + tap the heavier item)
  // =========================================================================
  function TutorialManager(f, hostId) {
    var self = {
      runner: new Runner(),
      hasStartedSequence: false,
      isInteractionLocked: false,
      hasUserClicked: false,
      hintTween: null,
      newHintDefaultScale: 1,
      animState: 'New State'
    };
    var anim = E.animator(f.bookAnimator);   // book & ball share one Animator

    /* Both demo clips switch their hint container ON with a single keyframe and
       never switch it back off, while switching its Hand/Image children off
       partway through. The container is a 1702x423 Image with no sprite, alpha 0
       and raycastTarget on, so once the demo has played it parks an invisible
       hit shape across BOTH items and swallows every tap — the tutorial can
       never be answered. Retire the container with the clip that raised it. */
    /* Both hint hands share one dashed-arrow sprite, which curves up-and-RIGHT.
       That is correct for the left tray (its basket is up-right) but backwards
       for the right tray, whose basket is up-LEFT. Mirror the right one. */
    function mirrorRightHintArrow() {
      var arrow = E.findByPath(f.bookAnimator, 'items /Item 1/Hint hand (1)/Image');
      if (arrow) E.setScale(arrow.id, -1, 1);
      // both dashed paths draw themselves in and glow (see .dashPath)
      ['items /Item 2/Hint hand/Image', 'items /Item 1/Hint hand (1)/Image'].forEach(function (p) {
        var n = E.findByPath(f.bookAnimator, p);
        if (n) n.el.classList.add('dashPath');
      });
    }

    function hideDemoHints() {
      ['items /Item 2/Hint hand', 'items /Item 1/Hint hand (1)'].forEach(function (path) {
        var n = E.findByPath(f.bookAnimator, path);
        if (n) E.setActive(n.id, false);
      });
    }

    function setStep(step) {
      // ScaleAnimator graph: New State --Step==1--> Book animation
      //                      Book animation --Step==2--> Ball Animation
      anim.setInteger('Step', step);
      if (self.animState === 'New State' && step === 1) {
        self.animState = 'Book animation';
        anim.play('BookAnimation', hideDemoHints);
      } else if (self.animState === 'Book animation' && step === 2) {
        self.animState = 'Ball Animation';
        anim.play('BallAnimation', hideDemoHints);
      }
    }

    function src() { return E.Audio.source(f.audioSource); }

    /* IEnumerator TypeInstructionWithAudio */
    function typeWithAudio(msg, clip, tok) {
      src().stop();
      E.setText(f.instructionText, '');
      if (!clip) {
        var i = 0, cur = '';
        var step = function () {
          if (i >= msg.length) return Promise.resolve();
          cur += msg[i++];
          E.setText(f.instructionText, cur);
          return E.wait(f.minTypingSpeed, tok).then(step);
        };
        return step();
      }
      var s = src();
      s.setClip(clip); s.play();
      var typingSpeed = E.Audio.len(clip) / Math.max(msg.length, 1);
      var k = 0, txt = '';
      var loop = function () {
        if (k >= msg.length) return E.waitUntil(function () { return !s.isPlaying(); }, tok);
        txt += msg[k++];
        E.setText(f.instructionText, txt);
        return E.wait(typingSpeed, tok).then(loop);
      };
      return loop();
    }

    /* IEnumerator HighlightSprite(img, normal, highlight) */
    function highlightSprite(imgId, normal, highlight, tok) {
      // the glow sprite lands and the item pops with it
      E.setSprite(imgId, highlight); E.setNativeSize(imgId); tapPop(imgId);
      return E.wait(1, tok).then(function () {
        E.setSprite(imgId, normal); E.setNativeSize(imgId);
        return E.wait(0.5, tok);
      });
    }

    /* IEnumerator PlayHighlightSequence(totalDuration) */
    function playHighlightSequence(total, tok) {
      var firstDelay = total * 0.25, gap = total * 0.25;
      return E.wait(firstDelay, tok)
        .then(function () { return highlightSprite(f.bookImage, f.bookNormalSprite, f.bookHighlightSprite, tok); })
        .then(function () { return E.wait(gap, tok); })
        .then(function () { return highlightSprite(f.ballImage, f.ballNormalSprite, f.ballHighlightSprite, tok); });
    }

    /* IEnumerator TypeInstructionWithHighlight */
    function typeWithHighlight(msg, clip, tok) {
      E.setText(f.instructionText, '');
      var s = src();
      if (clip) { s.stop(); s.setClip(clip); s.play(); }
      var clipLength = clip ? E.Audio.len(clip) : 2;
      var typingDelay = clipLength / Math.max(1, msg.length);
      self.runner.run(function (t2) { return playHighlightSequence(clipLength, t2); }, tok);
      var i = 0, cur = '';
      var loop = function () {
        if (i >= msg.length) {
          var rem = clip ? clipLength - typingDelay * msg.length : 0;
          return (rem > 0 ? E.wait(rem, tok) : Promise.resolve())
            .then(function () { return E.wait(0.5, tok); });
        }
        cur += msg[i++];
        E.setText(f.instructionText, cur);
        return E.wait(typingDelay, tok).then(loop);
      };
      return loop();
    }

    function popupArrow(id, delay, tok) {
      E.setActive(id, true);
      glowLabel(id, String(id) === String(f.arrowDown));
      E.setScale(id, 0);
      self.runner.run(function (t2) {
        return (delay > 0 ? E.wait(delay, t2) : Promise.resolve())
          .then(function () { return doScale(id, 1, 0.4, 'OutBack', t2); });
      }, tok);
    }

    /* Same rule as the levels: each label centred on its pan and the same
       distance outward, so the tutorial matches every level. The tutorial's
       ball (right pan) is always the heavy side. */
    function placeTutorialLabels() {
      [[f.arrowDown, 'Right/Basket/Image (1)', 1],
       [f.arrowUp,   'left /Basket/Image',    -1]].forEach(function (e) {
        var pan = E.findByPath(f.bookAnimator, e[1]);
        if (!pan || !e[0]) return;
        var sp = E.stagePos(pan.id);
        E.setStagePos(e[0], sp[0] + e[2] * 300, sp[1]);
      });
    }

    /* IEnumerator PlayInstruction7WithArrows */
    function playInstruction7(tok) {
      E.setActive(f.arrowDown, false);
      E.setActive(f.arrowUp, false);
      placeTutorialLabels();
      E.setInteractable(f.bookButton, false);
      E.setInteractable(f.ballButton, false);
      E.setText(f.instructionText, '');
      var s = src();
      if (f.instruction7Audio) { s.stop(); s.setClip(f.instruction7Audio); s.play(); }
      var msg = f.instruction7;
      var clipLength = f.instruction7Audio ? E.Audio.len(f.instruction7Audio) : 2;
      var typingDelay = clipLength / Math.max(1, msg.length);
      var i = 0, cur = '';
      var loop = function () {
        if (i >= msg.length) return E.wait(0.5, tok);
        cur += msg[i++];
        E.setText(f.instructionText, cur);
        if (cur.indexOf('down') >= 0 && !E.activeSelf(f.arrowDown)) popupArrow(f.arrowDown, 0, tok);
        if (cur.indexOf('up') >= 0 && !E.activeSelf(f.arrowUp)) popupArrow(f.arrowUp, 0, tok);
        return E.wait(typingDelay, tok).then(loop);
      };
      return loop();
    }

    function showCorrectHint() {
      E.setActive(f.hintHand, true);
      copyHandArt(f.newHintHand, f.hintHand);      // the animated button hand
      /* buttonCanvasLocal returns a canvas-centre offset, but this hand hangs
         off 'controller', so writing it as anchoredPos displaced it by that
         parent's own offset. Place it in stage space instead. */
      var sp = E.stagePos(f.ballButton);
      placeHand(f.hintHand, sp[0], sp[1]);
      E.animator(f.hintHand).play('tap_anim');
    }
    function stopBookHint() {
      if (self.hintTween) { self.hintTween.kill(); self.hintTween = null; }
      E.animator(f.hintHand).stop();
      E.setActive(f.hintHand, false);
    }
    function showNewHint(btnId) {
      E.setActive(f.newHintHand, true);
      E.setScale(f.newHintHand, self.newHintDefaultScale);
      var bp = E.stagePos(btnId);
      placeHand(f.newHintHand, bp[0], bp[1], BUTTON_HINT_DROP);
      var a = E.animator(f.newHintHand);
      a.play('tap_anim');
    }
    function startNewHintWithDelay(btnId) {
      var tok = self.runner.fresh('newHint');
      self.runner.run(function (t) {
        return E.wait(f.hintDelay, t).then(function () {
          if (btnId && E.isInteractable(btnId) && E.activeInHierarchy(btnId)) showNewHint(btnId);
        });
      }, tok);
    }
    function stopNewHint() {
      self.runner.stop('newHint');
      E.setActive(f.newHintHand, false);
    }
    function startBallHintWithDelay() {
      self.hasUserClicked = false;
      var tok = self.runner.fresh('ballHint');
      self.runner.run(function (t) {
        return E.wait(f.hintDelay, t).then(function () {
          if (!self.hasUserClicked) showCorrectHint();
        });
      }, tok);
    }

    // ---------------------------------------------------------- game flow --
    function gameSequence(tok) {
      return typeWithAudio(f.instruction1, f.instruction1Audio, tok)
        .then(function () { return E.wait(1, tok); })
        .then(function () { return typeWithHighlight(f.instruction2, f.instruction2Audio, tok); })
        .then(function () { return typeWithAudio(f.instruction3, f.instruction3Audio, tok); })
        .then(function () { setStep(1); return E.wait(3, tok); })
        .then(function () { return typeWithAudio(f.instruction4, f.instruction4Audio, tok); })
        .then(function () { setStep(2); return E.wait(3, tok); })
        .then(function () { return typeWithAudio(f.instruction5, f.instruction5Audio, tok); })
        .then(function () { return E.wait(1, tok); })
        .then(function () {
          startBallHintWithDelay();
          E.setInteractable(f.bookButton, true);
          E.setInteractable(f.ballButton, true);
        });
    }

    function wrongFlowBook(tok) {
      E.setActive(f.Messagebar, false);
      anim.enabled = false;
      E.setSprite(f.bookButton, f.bookWrongSprite);
      E.setNativeSize(f.bookButton);
      return E.wait(1, tok).then(function () {
        E.setActive(f.Messagebar, true);
        return playInstruction7(tok);
      }).then(function () {
        E.setActive(f.tryAgainButton, true);
        E.setInteractable(f.tryAgainButton, true);
        startNewHintWithDelay(f.tryAgainButton);
        self.isInteractionLocked = false;
      });
    }

    function afterBallCorrectFlow(tok) {
      return typeWithAudio(f.instruction6, f.instruction6Audio, tok)
        .then(function () { return E.wait(1, tok); })
        .then(function () { return playInstruction7(tok); })
        .then(function () {
          E.setActive(f.nextButton, true);
          E.setInteractable(f.nextButton, true);
          startNewHintWithDelay(f.nextButton);
        });
    }

    function onBookClicked() {
      self.hasUserClicked = true;
      self.runner.stop('ballHint');
      if (self.isInteractionLocked) return;
      tapPop(f.bookButton);
      self.isInteractionLocked = true;
      self.runner.stopAll();               // StopAllCoroutines()
      src().stop();
      E.setText(f.instructionText, '');
      E.setInteractable(f.bookButton, false);
      E.setInteractable(f.ballButton, false);
      stopBookHint(); stopNewHint();
      self.runner.run(wrongFlowBook);
    }

    function onBallClicked() {
      self.hasUserClicked = true;
      self.runner.stop('ballHint');
      if (self.isInteractionLocked) return;
      tapPop(f.ballButton);
      self.isInteractionLocked = true;
      self.runner.stopAll();
      src().stop();
      E.setText(f.instructionText, '');
      E.setInteractable(f.bookButton, false);
      E.setInteractable(f.ballButton, false);
      stopBookHint(); stopNewHint();
      anim.enabled = false;
      E.setSprite(f.ballButton, f.ballCorrectSprite);
      E.setNativeSize(f.ballButton);
      tapPop(f.ballButton);
      if (f.ballCorrectParticle) E.confetti(f.ballCorrectParticle);
      self.runner.run(afterBallCorrectFlow);
    }

    function onTryAgainClicked() {
      stopNewHint();
      E.setActive(f.tryAgainButton, false);
      E.setActive(f.arrowUp, false);
      E.setActive(f.arrowDown, false);
      anim.enabled = true;
      E.setSprite(f.bookButton, f.bookNormalSprite);
      E.setNativeSize(f.bookButton);
      E.setInteractable(f.bookButton, false);
      E.setInteractable(f.ballButton, false);
      self.runner.run(function (tok) {
        return typeWithAudio(f.instruction5, f.instruction5Audio, tok).then(function () {
          E.setInteractable(f.bookButton, true);
          E.setInteractable(f.ballButton, true);
          startBallHintWithDelay();
          self.isInteractionLocked = false;
        });
      });
    }

    function onNextButtonClicked() {
      stopNewHint(); stopBookHint();
      E.setInteractable(f.nextButton, false);
      src().stop();
      self.runner.stopAll();
      Game.loadScene(f.nextSceneIndex);
    }

    register(hostId, 'TutorialManager', function start() {
      self.newHintDefaultScale = E.getScale(f.newHintHand)[0];
      if (self.hasStartedSequence) return;
      self.hasStartedSequence = true;
      mirrorRightHintArrow();

      E.setActive(f.arrowUp, false);
      E.setActive(f.arrowDown, false);
      E.setActive(f.nextButton, false);
      E.setActive(f.hintHand, false);
      E.setActive(f.newHintHand, false);
      E.setScale(f.arrowUp, 0);
      E.setScale(f.arrowDown, 0);

      E.setInteractable(f.bookButton, false);
      E.removeAllClickListeners(f.bookButton);
      E.addClickListener(f.bookButton, onBookClicked);

      E.removeAllClickListeners(f.nextButton);
      E.addClickListener(f.nextButton, onNextButtonClicked);

      E.removeAllClickListeners(f.ballButton);
      E.addClickListener(f.ballButton, onBallClicked);

      if (f.tryAgainButton) {
        E.removeAllClickListeners(f.tryAgainButton);
        E.addClickListener(f.tryAgainButton, onTryAgainClicked);
        E.setActive(f.tryAgainButton, false);
      }
      self.runner.run(gameSequence, self.runner.fresh('gameSequence'));
    });

    put('TutorialManager', hostId, self);
    return self;
  }

  // =========================================================================
  //  DraggableItem  (14 instances)
  // =========================================================================
  function DraggableItem(f, hostId) {
    var self = {
      itemData: f.itemData,
      isLeftItem: !!f.isLeftItem,
      isLockedAfterDrop: false,
      dragEnabled: true,
      wasDroppedOnBasket: false,
      originalAnchoredPos: [0, 0],
      originalParent: null,
      node: String(hostId)
    };

    var n = E.node(hostId);
    var dragging = false, activePointer = null;

    function tutorial() { return get('WeightGameTutorialController', f.tutorialController); }

    /* Mirror the drag state onto the element so CSS can show a grab cursor.
       The controller writes these flags directly, so wrap them in accessors
       rather than hoping every call site remembers to refresh the class. */
    function syncCursor() {
      n.el.classList.toggle('draggable', !!(self.dragEnabled && !self.isLockedAfterDrop &&
        isStarted(f.tutorialController, 'WeightGameTutorialController')));
    }
    ['dragEnabled', 'isLockedAfterDrop'].forEach(function (key) {
      var val = self[key];
      Object.defineProperty(self, key, {
        get: function () { return val; },
        set: function (v) { val = v; syncCursor(); },
        enumerable: true, configurable: true
      });
    });

    function clampToCanvas() {
      var pad = (E.node(self.node).image || {}).pad || [0, 0, 0, 0];
      var r = E.stageRectYUp(self.node);
      var c = E.canvas();
      var offLeft = (r.xMin + pad[0]) - 0;
      var offRight = (r.xMax - pad[2]) - c[0];
      var offBottom = (r.yMin + pad[1]) - 0;
      var offTop = (r.yMax - pad[3]) - c[1];
      var p = E.getAnchoredPos(self.node);
      if (offLeft < 0) p[0] -= offLeft;
      if (offRight > 0) p[0] -= offRight;
      if (offBottom < 0) p[1] -= offBottom;
      if (offTop > 0) p[1] -= offTop;
      E.setAnchoredPos(self.node, p[0], p[1]);
    }

    /* How the item sits once it is in the pan. The defaults are the original's
       (centred on the drop marker at 0.9), but an item whose artwork needs a
       nudge or a tilt to look like it is resting in the bowl can override them
       per instance with dropRestPos / dropRestScale / dropRestRot. */
    self.onDropSuccess = function (basketId) {
      self.isLockedAfterDrop = true;
      self.dragEnabled = false;
      E.setParent(self.node, basketId, false);
      E.setAsFirstSibling(self.node);
      var pos = f.dropRestPos || [0, 0];
      var scale = (f.dropRestScale === undefined || f.dropRestScale === null) ? 0.9 : f.dropRestScale;
      E.setAnchoredPos(self.node, pos[0], pos[1]);
      E.setScale(self.node, scale, scale);
      E.setRotZ(self.node, f.dropRestRot || 0);
    };

    self.returnToOriginalPosition = function () {
      if (self.isLockedAfterDrop) return;
      E.setParent(self.node, self.originalParent, false);
      E.setAnchoredPos(self.node, self.originalAnchoredPos[0], self.originalAnchoredPos[1]);
      E.setAsLastSibling(self.node);
      E.setScale(self.node, 1, 1);
      var t = tutorial();
      if (t && self.itemData) t.onItemReturned(self.itemData);
    };

    function onBeginDrag(ev) {
      if (!self.dragEnabled || self.isLockedAfterDrop) return false;
      self.wasDroppedOnBasket = false;
      var t = tutorial();
      if (t && self.itemData) t.onItemDragStarted(self.itemData);
      E.setBlocksRaycasts(self.node, false);
      // move to the root canvas so the dragged item draws above everything
      E.setParent(self.node, Game.rootId(), true);
      E.setAsLastSibling(self.node);
      return true;
    }

    function onDrag(ev, dx, dy) {
      if (!self.dragEnabled) return;
      var p = E.getAnchoredPos(self.node);
      E.setAnchoredPos(self.node, p[0] + dx, p[1] + dy);
      clampToCanvas();
    }

    function onEndDrag(ev) {
      E.setBlocksRaycasts(self.node, true);
      if (!self.dragEnabled || self.isLockedAfterDrop) return;
      if (self.wasDroppedOnBasket) return;

      var pointer = E.pointerToStage(ev);
      var closest = null, closestDist = Infinity;
      var zones = COMP['BasketDropZone'] || {};
      Object.keys(zones).forEach(function (k) {
        var b = zones[k];
        /* FindObjectsOfType<BasketDropZone>() skips inactive objects. All 14
           zones are registered here, so without this an item can be dropped
           into a basket belonging to one of the six hidden levels: it gets
           parented into a hidden subtree and simply disappears. */
        if (!E.activeInHierarchy(b.node)) return;
        if (!b.isNearDropZone(pointer)) return;
        var bp = E.stagePos(b.node);
        var d = Math.hypot(pointer[0] - bp[0], pointer[1] - bp[1]);
        if (d < closestDist) { closestDist = d; closest = b; }
      });
      if (closest) { closest.forceDrop(self); return; }
      self.returnToOriginalPosition();
    }

    /* Pointer plumbing for IBeginDragHandler / IDragHandler / IEndDragHandler.
       Move/up are bound to the window: OnBeginDrag reparents the item to the
       root canvas, which drops any pointer capture held by the element, and
       Unity's drag also continues regardless of what is under the cursor. */
    var last = null;
    var DRAG_THRESHOLD = 10;        // EventSystem.pixelDragThreshold default

    function winMove(ev) {
      if (activePointer !== ev.pointerId || !last) return;
      var mdx = ev.clientX - last[0], mdy = ev.clientY - last[1];
      if (!dragging) {
        if (Math.hypot(mdx, mdy) < DRAG_THRESHOLD) return;
        if (!onBeginDrag(ev)) { detach(); return; }
        dragging = true;
        document.body.classList.add('dragging');
        last = [ev.clientX, ev.clientY];     // no jump on the first frame
        return;
      }
      last = [ev.clientX, ev.clientY];
      var k = E.scaleFactor();
      onDrag(ev, mdx / k, -mdy / k);        // eventData.delta / canvas.scaleFactor
    }

    function winUp(ev) {
      if (activePointer !== ev.pointerId) return;
      var wasDragging = dragging;
      detach();
      if (wasDragging) onEndDrag(ev);
    }

    function detach() {
      activePointer = null; last = null; dragging = false;
      document.body.classList.remove('dragging');
      window.removeEventListener('pointermove', winMove, true);
      window.removeEventListener('pointerup', winUp, true);
      window.removeEventListener('pointercancel', winUp, true);
    }

    n.el.addEventListener('pointerdown', function (ev) {
      if (!E.activeInHierarchy(self.node)) return;
      /* The level brain only calls disableAllDragging() once its Start runs,
         which waits on the audio preload — until then the authored
         dragEnabled:1 would let a child drop items before the first
         instruction and desync the whole sequence. */
      if (!isStarted(f.tutorialController, 'WeightGameTutorialController')) return;
      if (!self.dragEnabled || self.isLockedAfterDrop) return;
      activePointer = ev.pointerId;
      last = [ev.clientX, ev.clientY];
      dragging = false;
      window.addEventListener('pointermove', winMove, true);
      window.addEventListener('pointerup', winUp, true);
      window.addEventListener('pointercancel', winUp, true);
    });

    register(hostId, 'DraggableItem', function start() {
      self.originalAnchoredPos = E.getAnchoredPos(self.node);
      self.originalParent = E.node(self.node).parent ? E.node(self.node).parent.id : Game.rootId();
      if (self.itemData && self.itemData.itemSprite) {
        E.setSprite(f.itemImage || self.node, self.itemData.itemSprite);
      }
    });

    put('DraggableItem', hostId, self);
    return self;
  }

  // =========================================================================
  //  BasketDropZone  (14 instances)
  // =========================================================================
  function BasketDropZone(f, hostId) {
    var self = {
      node: String(hostId),
      isLeftBasket: !!f.isLeftBasket,
      gameManager: String(f.gameManager),
      currentItemInBasket: null
    };
    var n = E.node(hostId);

    self.isNearDropZone = function (stageXY) {
      var areaId = f.dropArea || self.node;
      var an = E.node(areaId);
      if (!an) return false;
      var lp = E.localPointInRect(areaId, stageXY);
      var sz = an.size(), pv = an.pivot;
      var xMin = -pv[0] * sz[0] - f.horizontalPadding;
      var xMax = (1 - pv[0]) * sz[0] + f.horizontalPadding;
      var yMin = -pv[1] * sz[1] - f.verticalPadding;
      var yMax = (1 - pv[1]) * sz[1] + f.verticalPadding;
      return lp[0] >= xMin && lp[0] <= xMax && lp[1] >= yMin && lp[1] <= yMax;
    };

    self.forceDrop = function (item) {
      var gm = get('WeightMeasuringGame', f.gameManager);
      if (!item || !gm) return;
      if (item.isLockedAfterDrop || !item.dragEnabled) { item.returnToOriginalPosition(); return; }
      if (self.currentItemInBasket !== null) { item.returnToOriginalPosition(); return; }
      self.currentItemInBasket = item;
      gm.onItemDroppedInBasket(item.itemData, self.isLeftBasket, self.node, item);
      item.onDropSuccess(self.node);
      item.wasDroppedOnBasket = true;
    };

    self.clearBasket = function () { self.currentItemInBasket = null; };

    register(hostId, 'BasketDropZone', function start() {
      if (f.basketImage) E.setImageColor(f.basketImage, f.normalColor);
    });

    // OnPointerEnter / OnPointerExit tint (both colours have alpha 0 here)
    n.el.addEventListener('pointerenter', function () {
      if (f.basketImage) E.setImageColor(f.basketImage, f.highlightColor);
    });
    n.el.addEventListener('pointerleave', function () {
      if (f.basketImage) E.setImageColor(f.basketImage, f.normalColor);
    });

    put('BasketDropZone', hostId, self);
    return self;
  }

  // =========================================================================
  //  WeightMeasuringGame  (7 instances — drives the balance animation)
  // =========================================================================
  function WeightMeasuringGame(f, hostId) {
    var self = {
      node: String(hostId),
      leftWeight: 0, rightWeight: 0,
      leftItem: null, rightItem: null,
      leftItems: [], rightItems: [],
      currentHeavierSide: 'none'
    };
    var animRunner = new Runner();

    /* ---- procedural balance movement -------------------------------------
       The three extracted clips only cross-fade between fixed poses, which
       reads as a robotic snap and leaves the needle barely legible. The same
       four transforms are driven directly instead: the needle leads, the beam
       follows a beat later, the pans are derived from the beam's own animated
       value so they can never drift out of sync, and the whole thing settles
       exactly once. The poses below ARE the clips' end values, so the geometry
       is unchanged — only the motion is. */
    var BEAM_MAX = 8, NEEDLE_MAX = 24;
    var POSE = {
      none:  { beam: 0,          needle: 0,           left: 18,  right: 18 },
      left:  { beam: BEAM_MAX,   needle: NEEDLE_MAX,  left: -34, right: 79 },
      right: { beam: -BEAM_MAX,  needle: -NEEDLE_MAX, left: 82,  right: -28 }
    };
    var parts = null;
    function scaleParts() {
      if (!parts) parts = {
        beam:   E.findByPath(f.scaleAnimator, 'plate'),
        needle: E.findByPath(f.scaleAnimator, 'needle'),
        left:   E.findByPath(f.scaleAnimator, 'left '),
        right:  E.findByPath(f.scaleAnimator, 'Right')
      };
      return parts;
    }
    var shown = { beam: 0, needle: 0, left: 18, right: 18 };

    function applyBeam(beam, left, right) {
      var p = scaleParts();
      shown.beam = beam; shown.left = left; shown.right = right;
      if (p.beam) E.setRotZ(p.beam.id, beam);
      if (p.left) E.setAnchoredPos(p.left.id, null, left);
      if (p.right) E.setAnchoredPos(p.right.id, null, right);
    }
    /* The authored Unity clip moves the needle as well as turning it, and the
       two sides are deliberately asymmetric. These are the three keyframes
       (anchoredPosition, rotation) straight from the scene. */
    var NEEDLE_POSE = Object.freeze({
      left:    { angle: -20, unityX: -11, unityY: -12.8 },
      neutral: { angle: 0,   unityX: 0,   unityY: -16.8 },
      right:   { angle: 20,  unityX: 8,   unityY: -22.8 }
    });
    var needleBase = null;

    /* Piecewise because the poses are not symmetrical: a single formula would
       reproduce neither side. Returns the offset from the neutral keyframe. */
    function needlePose(angle) {
      var a = Math.max(-20, Math.min(20, angle));
      var x, y;
      if (a < 0) {
        var t = (a + 20) / 20;
        x = lerp(NEEDLE_POSE.left.unityX, NEEDLE_POSE.neutral.unityX, t);
        y = lerp(NEEDLE_POSE.left.unityY, NEEDLE_POSE.neutral.unityY, t);
      } else {
        var u = a / 20;
        x = lerp(NEEDLE_POSE.neutral.unityX, NEEDLE_POSE.right.unityX, u);
        y = lerp(NEEDLE_POSE.neutral.unityY, NEEDLE_POSE.right.unityY, u);
      }
      return { x: x, y: y - NEEDLE_POSE.neutral.unityY };   // Unity y-up offset
    }

    function applyNeedle(angle) {
      var p = scaleParts();
      shown.needle = angle;
      if (!p.needle) return;
      if (!needleBase) needleBase = p.needle.anchoredPos.slice();
      var pose = needlePose(angle);
      E.setAnchoredPos(p.needle.id, needleBase[0] + pose.x, needleBase[1] + pose.y);
      E.setRotZ(p.needle.id, angle);
    }
    function lerp(a, b, u) { return a + (b - a) * u; }
    function reducedMotion() {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    /* One overshoot and an exact return, expressed as a fraction of the trip so
       the pans stay locked to the beam through the settle too. */
    function settle(tok, from, to, degrees, outDur, backDur, apply) {
      var span = Math.abs(to - from);
      if (span < 0.001) return Promise.resolve();
      var over = 1 + degrees / span;
      return E.tween(outDur, 'OutSine', function (u) { apply(lerp(1, over, u)); }, tok)
        .then(function () {
          return E.tween(backDur, 'OutSine', function (u) { apply(lerp(over, 1, u)); }, tok);
        });
    }

    function playAnimationForSide(side) {
      animRunner.stop('anim');
      var tok = animRunner.fresh('anim');
      var end = POSE[side] || POSE.none;
      var from = { beam: shown.beam, needle: shown.needle, left: shown.left, right: shown.right };
      var target = { beam: end.beam, needle: end.needle, left: end.left, right: end.right };

      // a small difference must still swing the needle far enough to read;
      // an exact balance still uses zero
      if (side !== 'none' && Math.abs(target.needle) < 5) {
        target.needle = (target.needle < 0 ? -1 : 1) * 5;
      }

      var dist = Math.abs(from.beam - target.beam);
      var main = Math.max(0.28, Math.min(0.55, lerp(0.28, 0.55, dist / (BEAM_MAX * 2))));
      var reduced = reducedMotion();

      function beamAt(u) {
        applyBeam(lerp(from.beam, target.beam, u),
                  lerp(from.left, target.left, u),
                  lerp(from.right, target.right, u));
      }
      function needleAt(u) { applyNeedle(lerp(from.needle, target.needle, u)); }

      animRunner.run(function (t) {
        return E.wait(reduced ? 0 : 0.08, t)         // let the item reach its slot first
          .then(function () {
            // the needle reacts immediately, on its own track
            animRunner.run(function (t2) {
              return E.tween(reduced ? 0.25 : main * 0.82, 'OutCubic', needleAt, t2)
                .then(function () {
                  if (reduced) return null;
                  if (side === 'none') {
                    // cross the centre slightly so a balanced result reads
                    var cross = from.needle >= 0 ? -1.5 : 1.5;
                    var a = shown.needle;
                    return E.tween(0.09, 'OutSine', function (u) { applyNeedle(lerp(a, cross, u)); }, t2)
                      .then(function () {
                        var b = shown.needle;
                        return E.tween(0.13, 'OutSine', function (u) { applyNeedle(lerp(b, 0, u)); }, t2);
                      });
                  }
                  return settle(t2, from.needle, target.needle, 1.8, 0.09, 0.13, needleAt);
                })
                .then(function () { applyNeedle(target.needle); });
            }, tok);
            return E.wait(reduced ? 0 : 0.04, t);    // the beam follows a beat later
          })
          .then(function () { return E.tween(reduced ? 0.25 : main, 'InOutSine', beamAt, t); })
          .then(function () {
            if (reduced) return null;
            return settle(t, from.beam, target.beam, 0.6, 0.10, 0.12, beamAt);
          })
          .then(function () {
            beamAt(1);                                // exact target, no drift
            applyNeedle(target.needle);
            self.isMoving = false;
          });
      }, tok);
      self.isMoving = true;
    }

    function getHeavierSide() {
      var d = self.leftWeight - self.rightWeight;
      if (Math.abs(d) < 0.1) return 'none';
      return d > 0 ? 'left' : 'right';
    }

    /* True while the scale is still moving, so callers can hold feedback back
       until it has settled. */
    self.isMoving = false;

    self.onItemDroppedInBasket = function (itemData, isLeft, basketId, item) {
      if (isLeft && self.leftItem !== null) return;
      if (!isLeft && self.rightItem !== null) return;
      if (isLeft) {
        self.leftWeight += itemData.weight;
        self.leftItems.push(item);
        self.leftItem = item;
      } else {
        self.rightWeight += itemData.weight;
        self.rightItems.push(item);
        self.rightItem = item;
      }
      var t = get('WeightGameTutorialController', f.tutorialController);
      if (t) t.onItemDropped(itemData);
      var side = getHeavierSide();
      if (side !== self.currentHeavierSide) {
        playAnimationForSide(side);
        self.currentHeavierSide = side;
      }
    };

    self.leftWeightOf = function () { return self.leftWeight; };
    self.rightWeightOf = function () { return self.rightWeight; };

    self.resetGame = function () {
      self.leftItem = null; self.rightItem = null;
      animRunner.stop('anim');
      self.leftItems.forEach(function (i) { if (i) i.returnToOriginalPosition(); });
      self.rightItems.forEach(function (i) { if (i) i.returnToOriginalPosition(); });
      self.leftItems.length = 0; self.rightItems.length = 0;
      self.leftWeight = 0; self.rightWeight = 0;
      self.currentHeavierSide = 'none';
      playAnimationForSide('none');
      // FindObjectsOfType<BasketDropZone>() is scene-wide in the original
      var zones = COMP['BasketDropZone'] || {};
      Object.keys(zones).forEach(function (k) { zones[k].clearBasket(); });
    };

    register(hostId, 'WeightMeasuringGame', function start() { self.resetGame(); });
    put('WeightMeasuringGame', hostId, self);
    return self;
  }

  // =========================================================================
  //  UltraSimpleWeightGame  (7 instances — public methods, no callers in the
  //  original scene; kept so the component surface matches)
  // =========================================================================
  function UltraSimpleWeightGame(f, hostId) {
    var anim = E.animator(f.scaleAnimator);
    var self = {
      leftWeight: 0, rightWeight: 0,
      itemDroppedOnLeft: function (w) { self.leftWeight += w; anim.play(f.leftDownAnimation); check(); },
      itemDroppedOnRight: function (w) { self.rightWeight += w; anim.play(f.rightDownAnimation); check(); },
      resetScale: function () { self.leftWeight = 0; self.rightWeight = 0; anim.play(f.balancedAnimation); }
    };
    var r = new Runner();
    function check() {
      r.run(function (t) {
        return E.wait(0.3, t).then(function () {
          if (self.leftWeight > self.rightWeight) anim.play(f.leftDownAnimation);
          else if (self.rightWeight > self.leftWeight) anim.play(f.rightDownAnimation);
          else anim.play(f.balancedAnimation);
        });
      }, r.fresh('check'));
    }
    put('UltraSimpleWeightGame', hostId, self);
    return self;
  }

  // =========================================================================
  //  WeightGameTutorialController  (7 instances — the level brain)
  // =========================================================================
  function WeightGameTutorialController(f, hostId) {
    var self = {
      node: String(hostId),
      runner: new Runner(),
      isInstructionPlaying: false,
      bookDropped: false, ballDropped: false,
      bookDragStarted: false, ballDragStarted: false,
      selectionLocked: false,
      originalScales: {},
      itemHintTween: null,
      ghostTween: null
    };

    function mg() { return get('WeightMeasuringGame', f.measuringGame); }
    function bookDrag() { return get('DraggableItem', f.bookDraggable); }
    function ballDrag() { return get('DraggableItem', f.ballDraggable); }
    function src() { return E.Audio.source(f.instructionAudioSource); }

    // ------------------------------------------------- instruction typing --
    function typeInstruction(msg, clip, tok) {
      self.isInstructionPlaying = true;
      E.setInteractable(f.bookButton, false);
      E.setInteractable(f.ballButton, false);
      E.setText(f.instructionText, '');
      var s = src();
      if (clip) { s.stop(); s.setClip(clip); s.play(); }
      var clipLength = clip ? E.Audio.len(clip) : 1;
      var typingDelay = clipLength / Math.max(1, msg.length);
      var i = 0, cur = '';
      var loop = function () {
        if (i >= msg.length) {
          var rem = clip ? clipLength - typingDelay * msg.length : 0;
          return (rem > 0 ? E.wait(rem, tok) : Promise.resolve())
            .then(function () { return E.wait(f.instructionEndDelay, tok); })
            .then(function () { self.isInstructionPlaying = false; });
        }
        cur += msg[i++];
        E.setText(f.instructionText, cur);
        return E.wait(typingDelay, tok).then(loop);
      };
      return loop();
    }

    function highlightItem(imgId, highlight, normal, tok) {
      // the glow sprite lands and the item pops with it
      E.setSprite(imgId, highlight); E.setNativeSize(imgId); tapPop(imgId);
      return E.wait(1, tok).then(function () {
        E.setSprite(imgId, normal); E.setNativeSize(imgId);
        return E.wait(0.5, tok);
      });
    }

    function playHighlightSequence(total, tok) {
      var firstDelay = total * 0.25, gap = total * 0.25;
      return E.wait(firstDelay, tok).then(function () {
        if (f.highlightOrder === 0) {   // BookFirst
          return highlightItem(f.bookImage, f.bookHighlightSprite, f.bookNormalSprite, tok)
            .then(function () { return E.wait(gap, tok); })
            .then(function () { return highlightItem(f.ballImage, f.ballHighlightSprite, f.ballNormalSprite, tok); });
        }
        return highlightItem(f.ballImage, f.ballHighlightSprite, f.ballNormalSprite, tok)
          .then(function () { return E.wait(gap, tok); })
          .then(function () { return highlightItem(f.bookImage, f.bookHighlightSprite, f.bookNormalSprite, tok); });
      });
    }

    function typeInstructionWithHighlightOrder(msg, clip, tok) {
      self.isInstructionPlaying = true;
      E.setInteractable(f.bookButton, false);
      E.setInteractable(f.ballButton, false);
      E.setText(f.instructionText, '');
      var s = src();
      if (clip) { s.stop(); s.setClip(clip); s.play(); }
      var clipLength = clip ? E.Audio.len(clip) : 2;
      var typingDelay = clipLength / Math.max(1, msg.length);
      self.runner.run(function (t2) { return playHighlightSequence(clipLength, t2); }, tok);
      var i = 0, cur = '';
      var loop = function () {
        if (i >= msg.length) {
          var rem = clip ? clipLength - typingDelay * msg.length : 0;
          return (rem > 0 ? E.wait(rem, tok) : Promise.resolve())
            .then(function () { return E.wait(f.instructionEndDelay, tok); })
            .then(function () { self.isInstructionPlaying = false; });
        }
        cur += msg[i++];
        E.setText(f.instructionText, cur);
        return E.wait(typingDelay, tok).then(loop);
      };
      return loop();
    }

    // --------------------------------------------------------- drag gating --
    function disableAllDragging() {
      var b = bookDrag(), l = ballDrag();
      if (b) b.dragEnabled = false;
      if (l) l.dragEnabled = false;
    }
    function enableBookDragOnly() {
      var b = bookDrag(), l = ballDrag();
      if (b) { b.dragEnabled = true; b.isLockedAfterDrop = false; }
      if (l) l.dragEnabled = false;
      startGhostRoutine();
    }
    function enableBallDragOnly() {
      var b = bookDrag(), l = ballDrag();
      if (l) { l.dragEnabled = true; l.isLockedAfterDrop = false; }
      if (b) b.dragEnabled = false;
      startGhostRoutine();
    }

    // ------------------------------------------------------- ghost drag hint --
    function stopGhost() {
      self.runner.stop('ghostPath');
      if (self.ghostTween) { self.ghostTween.kill(); self.ghostTween = null; }
      if (f.ghostHand) E.setActive(f.ghostHand, false);
      if (f.ghostItem) E.setActive(f.ghostItem, false);
    }

    function startGhostDrag(startId, endId, isBook) {
      if (!f.ghostHand || !f.ghostItem || !f.ghostItemImage) return;
      stopGhost();
      E.setActive(f.ghostHand, true);
      E.setActive(f.ghostItem, true);
      var layer = f.hintLayer || Game.rootId();
      E.setParent(f.ghostHand, layer, false);
      E.setParent(f.ghostItem, layer, false);

      var sp = E.stagePos(startId);
      E.setStagePos(f.ghostHand, sp[0], sp[1]);
      E.setStagePos(f.ghostItem, sp[0], sp[1]);
      E.setScale(f.ghostHand, 1); E.setScale(f.ghostItem, 1);

      E.setSprite(f.ghostItemImage, isBook ? f.bookNormalSprite : f.ballNormalSprite);
      E.setNativeSize(f.ghostItemImage);
      E.setImageAlpha(f.ghostItemImage, f.ghostAlpha);

      var a = E.stagePos(startId), b = E.stagePos(endId);
      var arcH = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.25;
      var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - arcH];   // Vector3.up
      var fwd = [a, mid, b], back = [b, mid, a];
      var ids = [f.ghostHand, f.ghostItem];
      var tok = self.runner.fresh('ghostPath');
      var loop = function () {
        return doPath(ids, fwd, f.ghostMoveDuration, 'InOutSine', tok)
          .then(function () { return E.wait(0.2, tok); })
          .then(function () { return doPath(ids, back, f.ghostMoveDuration, 'InOutSine', tok); })
          .then(loop);
      };
      self.runner.run(function () { return loop(); }, tok);
    }

    function decideAndShowGhost() {
      var g = mg();
      if (!g) return;
      var left = g.leftItem, right = g.rightItem;
      if (left === null && right === null) { startGhostDrag(f.bookStartPoint, f.leftDropPoint, true); return; }
      if (right !== null && right.itemData && right.itemData.itemName.toLowerCase().indexOf('book') >= 0) {
        startGhostDrag(f.ballStartPoint, f.leftDropPoint, false); return;
      }
      if (left !== null && left.itemData && left.itemData.itemName.toLowerCase().indexOf('ball') >= 0) {
        startGhostDrag(f.bookStartPoint, f.rightDropPoint, true); return;
      }
      if (left === null) { startGhostDrag(f.bookStartPoint, f.leftDropPoint, true); return; }
      if (right === null) { startGhostDrag(f.ballStartPoint, f.rightDropPoint, false); return; }
      stopGhost();
    }

    function startGhostRoutine() {
      if (self.bookDropped && self.ballDropped) return;
      var tok = self.runner.fresh('ghost');
      self.runner.run(function (t) {
        return E.wait(f.arrowDelaySeconds, t).then(function () {
          if (self.selectionLocked) return;
          if (self.bookDropped && self.ballDropped) return;
          decideAndShowGhost();
        });
      }, tok);
    }

    // ------------------------------------------------------------- arrows ---
    function showArrow(id) {
      E.setActive(id, true);
      E.setCanvasGroupAlpha(id, 1);
      if (self.originalScales[id] === undefined) self.originalScales[id] = E.getScale(id)[0];
      E.setScale(id, self.originalScales[id]);
    }
    function hideArrow(id) { if (id) E.setActive(id, false); }

    function startHintForButton(btnId) {
      var tok = self.runner.fresh('hint');
      self.runner.run(function (t) {
        return E.wait(f.arrowDelaySeconds, t).then(function () {
          if (btnId && E.activeInHierarchy(btnId)) {
            var p = E.stagePos(btnId);
            placeHand(f.hintHand, p[0], p[1], BUTTON_HINT_DROP);
            showArrow(f.hintHand);
            E.animator(f.hintHand).play('tap_anim');
          }
        });
      }, tok);
    }

    function startItemHint() {
      var tok = self.runner.fresh('itemHint');
      self.runner.run(function (t) {
        return E.wait(f.arrowDelaySeconds, t).then(function () {
          if (self.selectionLocked || self.isInstructionPlaying) return;
          var bookIsCorrect = (f.correctAnswerMode === 0)
            ? f.bookWeight < f.ballWeight
            : f.bookWeight > f.ballWeight;
          var target = bookIsCorrect ? f.bookButton : f.ballButton;
          E.setActive(f.itemHintHand, true);
          copyHandArt(f.hintHand, f.itemHintHand);        // the animated button hand
          var p = E.stagePos(target);
          placeHand(f.itemHintHand, p[0], p[1] + 5);        // +(0,-5,0) in Unity y-up
          if (self.itemHintTween) { self.itemHintTween.kill(); self.itemHintTween = null; }
          E.animator(f.itemHintHand).play('tap_anim');
        });
      }, tok);
    }
    function hideItemHint() {
      self.runner.stop('itemHint');
      if (self.itemHintTween) { self.itemHintTween.kill(); self.itemHintTween = null; }
      if (f.itemHintHand) {
        E.animator(f.itemHintHand).stop();
        E.setActive(f.itemHintHand, false);
      }
    }

    // ------------------------------------------------------------- labels ---
    /* The four authored marker points sit at fixed heights out near the frame
       edges, so each label ended up a different distance from the pan it
       describes and the two sides never matched. Derive both from the live
       pans: centred on their pan, the same distance out, on every level. */
    var LABEL_OUT = 300;              // reference px, pan centre -> label centre

    function panMarker(isLeft) {
      var zones = COMP['BasketDropZone'] || {}, hit = null;
      Object.keys(zones).forEach(function (k) {
        var z = zones[k];
        if (hit || String(z.gameManager) !== String(f.measuringGame)) return;
        if (!!z.isLeftBasket === !!isLeft) hit = z;
      });
      return hit ? E.node(hit.node) : null;
    }

    function placeLabelBySide(labelId, isLeft) {
      var pan = panMarker(isLeft);
      if (!pan || !labelId) return;
      var sp = E.stagePos(pan.id);
      E.setStagePos(labelId, sp[0] + (isLeft ? -LABEL_OUT : LABEL_OUT), sp[1]);
    }

    function updateLabelPositions() {
      var g = mg();
      if (!g) return;
      var heavyIsLeft = g.leftWeight > g.rightWeight;
      placeLabelBySide(f.label1, heavyIsLeft);    // label1 is the "down" side
      placeLabelBySide(f.label2, !heavyIsLeft);   // label2 is the "up" side
    }
    function popupLabel(id, delay, tok) {
      if (!id) return;
      E.setActive(id, true);
      glowLabel(id, String(id) === String(f.label1));
      E.setScale(id, 0);
      self.runner.run(function (t2) {
        return (delay > 0 ? E.wait(delay, t2) : Promise.resolve())
          .then(function () { return doScale(id, 1, 0.4, 'OutBack', t2); });
      }, tok);
    }

    function playInstruction7WithLabels(tok) {
      self.isInstructionPlaying = true;
      E.setInteractable(f.bookButton, false);
      E.setInteractable(f.ballButton, false);
      E.setText(f.instructionText, '');
      var s = src();
      if (f.instruction7Audio) { s.stop(); s.setClip(f.instruction7Audio); s.play(); }
      var msg = f.instruction7;
      var clipLength = f.instruction7Audio ? E.Audio.len(f.instruction7Audio) : 2;
      var typingDelay = clipLength / Math.max(1, msg.length);
      var i = 0, cur = '';
      updateLabelPositions();
      var loop = function () {
        if (i >= msg.length) {
          return E.wait(f.instructionEndDelay, tok)
            .then(function () { self.isInstructionPlaying = false; });
        }
        cur += msg[i++];
        E.setText(f.instructionText, cur);
        if (cur.indexOf('down') >= 0 && !E.activeSelf(f.label1)) {
          updateLabelPositions(); popupLabel(f.label1, 0, tok);
        }
        if (cur.indexOf('up') >= 0 && !E.activeSelf(f.label2)) {
          updateLabelPositions(); popupLabel(f.label2, 0, tok);
        }
        return E.wait(typingDelay, tok).then(loop);
      };
      return loop();
    }

    // --------------------------------------------------------- selection ----
    function correctSelectionFlow(isBook, tok) {
      if (isBook) {
        E.setSprite(f.bookImage, f.bookCorrectSprite); E.setNativeSize(f.bookImage); tapPop(f.bookImage);
        if (f.bookCorrectParticle) E.confetti(f.bookCorrectParticle);
      } else {
        E.setSprite(f.ballImage, f.ballCorrectSprite); E.setNativeSize(f.ballImage); tapPop(f.ballImage);
        if (f.ballCorrectParticle) E.confetti(f.ballCorrectParticle);
      }
      return typeInstruction(f.instruction6, f.instruction6Audio, tok)
        .then(function () { return E.wait(1, tok); })
        .then(function () { return playInstruction7WithLabels(tok); })
        .then(function () {
          if (f.isLastLevel) {
            return E.wait(1.5, tok).then(function () {
              if (f.gameOverPanel) E.setActive(f.gameOverPanel, true);
              if (f.finalVO) { var s = src(); s.stop(); s.setClip(f.finalVO); s.play(); }
            });
          }
          E.setActive(f.nextButton, true);
          startHintForButton(f.nextButton);
        });
    }

    function wrongSelectionFlow(isBook, tok) {
      if (isBook) { E.setSprite(f.bookImage, f.bookWrongSprite); E.setNativeSize(f.bookImage); }
      else { E.setSprite(f.ballImage, f.ballWrongSprite); E.setNativeSize(f.ballImage); }
      return playInstruction7WithLabels(tok).then(function () {
        E.setActive(f.tryAgainButton, true);
        startHintForButton(f.tryAgainButton);
      });
    }

    function onItemSelected(isBook) {
      if (self.selectionLocked || self.isInstructionPlaying) return;
      hideItemHint();
      tapPop(isBook ? f.bookButton : f.ballButton);
      self.selectionLocked = true;
      var bookIsLighter = f.bookWeight < f.ballWeight;
      var bookIsHeavier = f.bookWeight > f.ballWeight;
      var isCorrect;
      if (f.correctAnswerMode === 0) {           // LightWeight
        isCorrect = (isBook && bookIsLighter) || (!isBook && !bookIsLighter);
      } else {                                    // HeavyWeight
        isCorrect = (isBook && bookIsHeavier) || (!isBook && !bookIsHeavier);
      }
      if (isCorrect) self.runner.run(function (t) { return correctSelectionFlow(isBook, t); });
      else self.runner.run(function (t) { return wrongSelectionFlow(isBook, t); });
    }

    function enableItemSelection() {
      self.selectionLocked = false;
      E.setInteractable(f.bookButton, true);
      E.setInteractable(f.ballButton, true);
      startItemHint();
    }

    function onTryAgain() {
      hideArrow(f.hintHand);
      hideItemHint();
      E.setActive(f.tryAgainButton, false);
      E.setActive(f.label1, false);
      E.setActive(f.label2, false);
      E.setSprite(f.bookImage, f.bookNormalSprite); E.setNativeSize(f.bookImage);
      E.setSprite(f.ballImage, f.ballNormalSprite); E.setNativeSize(f.ballImage);
      /* typeInstruction() disables both item buttons on entry and never
         re-enables them, so opening the selection first (as the original does)
         left the child unable to answer at all after Try Again. Reopen it when
         the prompt finishes, exactly as tutorialSequence does. */
      self.runner.run(function (t) {
        return typeInstruction(f.instruction5, f.instruction5Audio, t)
          .then(function () { enableItemSelection(); });
      });
    }

    // ----------------------------------------------- draggable callbacks ----
    self.onItemDragStarted = function (item) {
      stopGhost();
      if (item.itemName.toLowerCase().indexOf('book') >= 0) {
        self.bookDragStarted = true; hideArrow(f.leftArrow);
      } else {
        self.ballDragStarted = true; hideArrow(f.rightArrow);
      }
    };

    self.onItemDropped = function (item) {
      stopGhost();
      if (item.itemName.toLowerCase().indexOf('book') >= 0) {
        self.bookDropped = true;
        hideArrow(f.leftArrow);
        var b = bookDrag();
        if (b) { b.isLockedAfterDrop = true; b.dragEnabled = false; }
      } else {
        self.ballDropped = true;
        hideArrow(f.rightArrow);
        var l = ballDrag();
        if (l) { l.isLockedAfterDrop = true; l.dragEnabled = false; }
      }
      startGhostRoutine();
    };

    self.onItemReturned = function (item) {
      if (item.itemName.toLowerCase().indexOf('book') >= 0) {
        self.bookDragStarted = false;
        var t1 = self.runner.fresh('leftArrow');
        self.runner.run(function (t) {
          return E.wait(f.arrowDelaySeconds, t).then(function () {
            if (!self.bookDragStarted && !self.bookDropped) showArrow(f.leftArrow);
          });
        }, t1);
      } else {
        self.ballDragStarted = false;
        var t2 = self.runner.fresh('rightArrow');
        self.runner.run(function (t) {
          return E.wait(f.arrowDelaySeconds, t).then(function () {
            if (!self.ballDragStarted && !self.ballDropped) showArrow(f.rightArrow);
          });
        }, t2);
      }
    };

    // ------------------------------------------------------ tutorial flow ---
    function tutorialSequence(tok) {
      disableAllDragging();
      return typeInstruction(f.instruction1, f.instruction1Audio, tok)
        .then(function () { return typeInstructionWithHighlightOrder(f.instruction2, f.instruction2Audio, tok); })
        .then(function () { return typeInstruction(f.instruction3, f.instruction3Audio, tok); })
        .then(function () {
          enableBookDragOnly();
          self.bookDropped = false; self.bookDragStarted = false;
          return E.waitUntil(function () { return self.bookDropped; }, tok);
        })
        .then(function () {
          E.setActive(f.Base1, false);
          return typeInstruction(f.instruction4, f.instruction4Audio, tok);
        })
        .then(function () {
          enableBallDragOnly();
          self.ballDropped = false; self.ballDragStarted = false;
          return E.waitUntil(function () { return self.ballDropped; }, tok);
        })
        .then(function () {
          E.setActive(f.Base2, false);
          disableAllDragging();
          return typeInstruction(f.instruction5, f.instruction5Audio, tok);
        })
        .then(function () {
          var b = bookDrag(), l = ballDrag();
          if (b) b.isLockedAfterDrop = true;
          if (l) l.isLockedAfterDrop = true;
          enableItemSelection();
        });
    }

    register(hostId, 'WeightGameTutorialController', function start() {
      disableAllDragging();
      E.setActive(f.leftArrow, false);
      E.setActive(f.rightArrow, false);
      E.setActive(f.label1, false);
      E.setActive(f.label2, false);
      E.setActive(f.nextButton, false);
      E.setActive(f.tryAgainButton, false);
      E.setInteractable(f.bookButton, false);
      E.setInteractable(f.ballButton, false);

      E.addClickListener(f.bookButton, function () { onItemSelected(true); });
      E.addClickListener(f.ballButton, function () { onItemSelected(false); });
      E.addClickListener(f.tryAgainButton, onTryAgain);

      /* hintHand and itemHintHand live on the Canvas and are shared by all
         seven levels, and the Next button only swaps level containers — this
         controller keeps running. Retire its timers on the way out, or a
         pending hint fires on the next level and drives the shared hands from
         this level's stale positions. */
      E.addClickListener(f.nextButton, function () {
        hideArrow(f.hintHand);
        hideItemHint();
        stopGhost();
        /* Each level owns its own AudioSource, so a clip still playing here keeps
           sounding while the next level starts instruction 1 on a different
           element — two voices at once, which reads as an echo. */
        src().stop();
        self.runner.stopAll();
      });
      E.addClickListener(f.tryAgainButton, function () { hideArrow(f.hintHand); });

      self.runner.run(tutorialSequence, self.runner.fresh('tutorial'));
    });

    put('WeightGameTutorialController', hostId, self);
    return self;
  }

  // =========================================================================
  return {
    reset: function () { COMP = {}; pending = []; },
    tickControllers: tickControllers,
    isStarted: isStarted,
    get: get,
    ButtonAnimator: ButtonAnimator,
    TutorialManager: TutorialManager,
    DraggableItem: DraggableItem,
    BasketDropZone: BasketDropZone,
    WeightMeasuringGame: WeightMeasuringGame,
    UltraSimpleWeightGame: UltraSimpleWeightGame,
    WeightGameTutorialController: WeightGameTutorialController
  };
})();
