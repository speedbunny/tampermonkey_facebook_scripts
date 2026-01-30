// ==UserScript==
// @name         Facebook Reels Anti-Hover Ducking — Prototype Patch (v1.4)
// @namespace    https://eaglesfield.ai/
// @version      1.4
// @description  Hard-block FB’s hover/next-reel volume ducking by patching the HTMLMediaElement volume setter. Persists your chosen volume. Toggle with Shift+V.
// @author       Echo-4o
// @match        https://www.facebook.com/*
// @match        https://web.facebook.com/*
// @match        https://m.facebook.com/*
// @all-frames   true
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // --- Tweakables -----------------------------------------------------------
  const MIN_DUCK = 0.15;            // Treat anything below this as FB ducking
  const DEFAULT_VOLUME = 1.0;       // Fallback if nothing stored yet
  const GESTURE_WINDOW_MS = 1200;   // Changes within this window are considered user-intent
  const STORAGE_KEY = "fb_anti_duck_userVolume_v3";
  const AUTOUNMUTE_ON_PLAY = true;  // If true, unmute on play when you had a >0 stored volume
  // -------------------------------------------------------------------------

  let globalEnabled = true;
  let lastGestureTs = 0;
  let storedVolume = loadStoredVolume();

  // Track user gestures so we can accept nearby volume changes
  const markGesture = () => { lastGestureTs = Date.now(); };
  ['pointerdown','mousedown','keydown','wheel','touchstart'].forEach(ev =>
    window.addEventListener(ev, markGesture, { capture: true, passive: true })
  );

  // Hotkey: Shift+V toggles protection
  window.addEventListener('keydown', (e) => {
    if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'v') {
      globalEnabled = !globalEnabled;
      console.log(`[Anti-Ducking] ${globalEnabled ? 'Enabled' : 'Disabled'}`);
      toast(globalEnabled ? 'Anti-ducking: ON' : 'Anti-ducking: OFF');
    }
  }, true);

  // Lightweight toast
  function toast(msg) {
    try {
      const el = document.createElement('div');
      el.textContent = msg;
      Object.assign(el.style, {
        position: 'fixed', zIndex: 2147483647, left: '50%', top: '12px',
        transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.82)',
        color: '#fff', padding: '6px 10px', borderRadius: '8px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        fontSize: '12px', pointerEvents: 'none'
      });
      document.documentElement.appendChild(el);
      setTimeout(() => el.remove(), 1200);
    } catch (_) {}
  }

  // Persist/restore
  function loadStoredVolume() {
    const v = parseFloat(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(v) ? clamp(v, 0, 1) : DEFAULT_VOLUME;
  }
  function saveStoredVolume(v) {
    const vol = clamp(v, 0, 1);
    try { localStorage.setItem(STORAGE_KEY, String(vol)); } catch (_) {}
    return vol;
  }

  // Re-entrancy guard per element
  const SETTING_FLAG = Symbol('antiDuckSetting');

  // Core: patch the prototype setter so *any* volume set flows through us
  patchVolumeSetter();

  // Also wire newly found <video>/<audio> to sane defaults & unmute-on-play if desired
  bootstrapExisting();
  observeNewMedia();

  // ---- Impl ---------------------------------------------------------------

  function patchVolumeSetter() {
    const proto = window.HTMLMediaElement && HTMLMediaElement.prototype;
    if (!proto) return;

    const desc = Object.getOwnPropertyDescriptor(proto, 'volume');
    if (!desc || !desc.configurable || typeof desc.set !== 'function' || typeof desc.get !== 'function') {
      // Fallback: we’ll still use event listeners below
      return;
    }

    const originalSet = desc.set;
    const originalGet = desc.get;

    Object.defineProperty(proto, 'volume', {
      configurable: true,
      enumerable: desc.enumerable,
      get: function () {
        return originalGet.call(this);
      },
      set: function (v) {
        // Prevent infinite loops if we set inside our own setter
        if (this[SETTING_FLAG]) return originalSet.call(this, v);

        if (!globalEnabled) {
          // Pass through untouched
          return originalSet.call(this, v);
        }

        const now = Date.now();
        const userIntent = (now - lastGestureTs) <= GESTURE_WINDOW_MS;

        // Ensure we keep a per-element userVolume cache
        if (typeof this.__userVolume !== 'number') {
          const current = safeVolumeRead(this, originalGet);
          this.__userVolume = Number.isFinite(current) ? current : storedVolume;
        }

        let target = v;

        if (userIntent) {
          // User moved the slider / pressed a key — honour it and save
          this.__userVolume = clamp(v, 0, 1);
          storedVolume = saveStoredVolume(this.__userVolume);
        } else {
          // App-driven change; treat suspiciously low values as ducking
          if (v < MIN_DUCK && !this.muted) {
            // Restore to last known user choice (or stored)
            target = clamp(
              (typeof this.__userVolume === 'number' ? this.__userVolume : storedVolume),
              MIN_DUCK, 1
            );
          } else {
            // Sane app change (e.g., switching source), adopt as baseline
            this.__userVolume = clamp(v, 0, 1);
            storedVolume = saveStoredVolume(this.__userVolume);
          }
        }

        this[SETTING_FLAG] = true;
        try {
          return originalSet.call(this, target);
        } finally {
          this[SETTING_FLAG] = false;
        }
      }
    });

    // Nice-to-have: enforce once on play (helps when FB sets muted+low before events)
    proto.addEventListener && proto.addEventListener.call
      ? null // We'll do per-element listeners below.
      : null;
  }

  function safeVolumeRead(el, getter) {
    try { return getter.call(el); } catch (_) { return NaN; }
  }

  function bootstrapExisting() {
    document.querySelectorAll('video, audio').forEach(wireMedia);
  }

  function observeNewMedia() {
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of (m.addedNodes || [])) {
          if (n instanceof HTMLMediaElement) wireMedia(n);
          else if (n && n.querySelectorAll) {
            n.querySelectorAll('video, audio').forEach(wireMedia);
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // SPA route changes may not mutate media immediately
    window.addEventListener('pageshow', () => {
      storedVolume = loadStoredVolume();
      bootstrapExisting();
    });
  }

  function wireMedia(m) {
    if (!m || m.__antiDuckWired) return;
    m.__antiDuckWired = true;

    // Initialise per-element cache from stored/global
    if (typeof m.__userVolume !== 'number') {
      const current = Number.isFinite(m.volume) ? m.volume : storedVolume;
      m.__userVolume = clamp(current, 0, 1);
    }

    // Enforce once on discovery (helps with next-reel swaps)
    enforceVolumeOnce(m, "wire");

    // Keep volume sane on metadata/attr swaps
    m.addEventListener('loadedmetadata', () => {
      if (!globalEnabled) return;
      if (AUTOUNMUTE_ON_PLAY && m.muted && (m.__userVolume || storedVolume) > 0.01) {
        m.muted = false;
      }
      enforceVolumeOnce(m, "loadedmetadata");
    }, true);

    // First play per source
    let firstPlayDone = false;
    m.addEventListener('play', () => {
      if (!globalEnabled) return;
      if (!firstPlayDone) {
        firstPlayDone = true;
        if (AUTOUNMUTE_ON_PLAY && m.muted && (m.__userVolume || storedVolume) > 0.01) {
          m.muted = false;
        }
        enforceVolumeOnce(m, "first-play");
      }
      if (m.volume < MIN_DUCK && !m.muted) {
        enforceVolumeOnce(m, "play-restore");
      }
    }, true);

    // If FB swaps src on the same element
    const mo = new MutationObserver((mm) => {
      for (const x of mm) {
        if (x.type === 'attributes' && (x.attributeName === 'src' || x.attributeName === 'crossorigin')) {
          firstPlayDone = false;
          enforceVolumeOnce(m, "attr-change");
        }
      }
    });
    mo.observe(m, { attributes: true, attributeFilter: ['src', 'crossorigin'] });

    // Accept genuine user changes via volumechange when near a gesture
    m.addEventListener('volumechange', () => {
      if (!globalEnabled) return;
      const now = Date.now();
      const userIntent = (now - lastGestureTs) <= GESTURE_WINDOW_MS;

      if (userIntent) {
        m.__userVolume = clamp(m.volume, 0, 1);
        storedVolume = saveStoredVolume(m.__userVolume);
      } else if (m.volume < MIN_DUCK && !m.muted) {
        // In case the prototype patch was blocked in a subrealm (rare)
        enforceVolumeOnce(m, "volchange-restore");
      } else {
        // Adopt as baseline for sane app-side raises
        m.__userVolume = clamp(m.volume, 0, 1);
        storedVolume = saveStoredVolume(m.__userVolume);
      }
    }, true);

    // Reset play flag if media is emptied (FB carousel quirks)
    m.addEventListener('emptied', () => {
      firstPlayDone = false;
      enforceVolumeOnce(m, "emptied");
    }, true);
  }

  function enforceVolumeOnce(m, reason) {
    if (!m) return;
    const target = clamp(
      (typeof m.__userVolume === 'number' ? m.__userVolume : storedVolume),
      MIN_DUCK, 1
    );

    // Use the prototype setter (already patched), guard re-entry
    m[SETTING_FLAG] = true;
    try {
      if (!Number.isFinite(m.volume) || Math.abs(m.volume - target) > 1e-3) {
        m.volume = target;
      }
      // console.debug(`[Anti-Ducking] enforce ${target.toFixed(2)} (${reason})`);
    } finally {
      m[SETTING_FLAG] = false;
    }
  }

  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
})();
