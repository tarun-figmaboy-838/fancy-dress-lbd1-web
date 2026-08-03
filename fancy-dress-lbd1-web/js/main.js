/* ============================================================================
 *  main.js — scene bootstrap and Unity SceneManager equivalent
 * ========================================================================== */
var Game = (function () {
  'use strict';

  var SCENE_ORDER = ['Tutorial', 'Lbd1'];   // Assets/Scenes build order
  var current = null;
  var rootNodeId = null;
  var pendingAwakeAudio = [];

  function collectAudio(obj, out) {
    if (typeof obj === 'string') {
      if (obj.indexOf('assets/audio/') === 0 && out.indexOf(obj) < 0) out.push(obj);
      return out;
    }
    if (Array.isArray(obj)) { obj.forEach(function (o) { collectAudio(o, out); }); return out; }
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(function (k) { collectAudio(obj[k], out); });
    }
    return out;
  }

  /* Instantiation order sets Start() order. Dependencies are resolved by node
     id at call time, so only Start ordering matters here. */
  var ORDER = ['DraggableItem', 'BasketDropZone', 'WeightMeasuringGame',
               'UltraSimpleWeightGame', 'ButtonAnimator', 'TutorialManager',
               'WeightGameTutorialController'];

  function loadScene(indexOrName) {
    var name = typeof indexOrName === 'number' ? SCENE_ORDER[indexOrName] : indexOrName;
    var data = window.SCENES[name];
    if (!data) { console.error('unknown scene', indexOrName); return; }

    Controllers.reset();
    Engine.Audio.reset();
    var mount = document.getElementById('game');
    var root = Engine.boot(data, mount);
    rootNodeId = root.id;
    current = name;
    document.body.dataset.scene = name;

    ORDER.forEach(function (sname) {
      (data.scripts[sname] || []).forEach(function (sc) {
        try { Controllers[sname](sc.fields, sc.node); }
        catch (e) { console.error('instantiate ' + sname + ' failed', e); }
      });
    });

    // AudioSources with PlayOnAwake (browsers may defer until a gesture)
    pendingAwakeAudio = [];
    var all = Engine.nodes();
    Object.keys(all).forEach(function (k) {
      var n = all[k];
      if (n.audioCfg && n.audioCfg.playOnAwake && n.audioCfg.clip) pendingAwakeAudio.push(k);
    });

    var clips = collectAudio(data.scripts, []);
    Object.keys(all).forEach(function (k) {
      if (all[k].audioCfg && all[k].audioCfg.clip) clips.push(all[k].audioCfg.clip);
    });

    var go = function () {
      Controllers.tickControllers();
      Engine.onActivated(function () { Controllers.tickControllers(); });
      flushAwakeAudio();
    };
    /* The ported coroutines need every clip length before the first line types.
       Those lengths ship in audio-lengths.js, so the fetch is only a warm-up and
       the scene can start at once; if a clip is ever missing from that table we
       still wait for its metadata, as the original port did. */
    var haveAll = clips.every(function (cl) {
      return !!(window.AUDIO_LENGTHS && window.AUDIO_LENGTHS[cl] > 0);
    });
    if (haveAll) { Engine.Audio.preload(clips); go(); }
    else Engine.Audio.preload(clips).then(go, go);
  }

  function flushAwakeAudio() {
    pendingAwakeAudio.forEach(function (id) {
      var s = Engine.Audio.source(id);
      if (!s.isPlaying()) s.play();
    });
  }

  /* The one gesture the whole page's audio hangs off: the awake clips that
     could not autoplay, and the WebAudio context the sound effects are
     synthesised on, which is created suspended until a user has tapped. */
  window.addEventListener('pointerdown', function once() {
    window.removeEventListener('pointerdown', once);
    flushAwakeAudio();
    Engine.Sfx.unlock();
  });

  return {
    loadScene: loadScene,
    rootId: function () { return rootNodeId; },
    currentScene: function () { return current; },
    scenes: SCENE_ORDER
  };
})();

if (typeof document !== 'undefined' && document.getElementById('game')) {
  Game.loadScene(0);
}
