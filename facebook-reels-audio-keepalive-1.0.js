// ==UserScript==
// @name         Facebook Reels – Background Audio Keepalive
// @namespace    fb-audio-keepalive
// @version      1.0
// @description  Keep Facebook Reels audio playing when tab is unfocused
// @match        https://www.facebook.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  /*********************************************************
   * Visibility + focus spoofing
   *********************************************************/
  Object.defineProperty(document, 'hidden', {
    get: () => false,
    configurable: true
  });

  Object.defineProperty(document, 'visibilityState', {
    get: () => 'visible',
    configurable: true
  });

  document.addEventListener(
    'visibilitychange',
    e => e.stopImmediatePropagation(),
    true
  );

  Object.defineProperty(document, 'hasFocus', {
    value: () => true
  });

  window.addEventListener(
    'blur',
    e => {
      e.stopImmediatePropagation();
      window.dispatchEvent(new Event('focus'));
    },
    true
  );

  /*********************************************************
   * Media control (no zombie looping)
   *********************************************************/
  let currentVideo = null;
  const originalPause = HTMLMediaElement.prototype.pause;

  HTMLMediaElement.prototype.pause = function () {
    if (this !== currentVideo || this.dataset.allowPause === '1') {
      return originalPause.apply(this, arguments);
    }
  };

  document.addEventListener(
    'play',
    e => {
      if (e.target instanceof HTMLVideoElement) {
        if (currentVideo && currentVideo !== e.target) {
          currentVideo.dataset.allowPause = '1';
          originalPause.call(currentVideo);
          delete currentVideo.dataset.allowPause;
        }
        currentVideo = e.target;
      }
    },
    true
  );

  console.log('[FB Audio Keepalive] Tampermonkey active');
})();
