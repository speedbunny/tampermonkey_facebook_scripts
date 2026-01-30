// ==UserScript==
// @name         Facebook Reels – Background Audio Keepalive
// @namespace    fb-audio-keepalive
// @version      1.1
// @description  Keep Facebook Reels audio playing when tab is unfocused
// @match        https://www.facebook.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(() => {
  /*********************************************************
   * Capture REAL visibility state before spoofing
   *********************************************************/
  const getRealHidden = Object.getOwnPropertyDescriptor(
    Document.prototype,
    'hidden'
  ).get;

  let reallyHidden = getRealHidden.call(document);

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
    e => {
      reallyHidden = getRealHidden.call(document);
      e.stopImmediatePropagation();
    },
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
   * Media control – only block pause when tab is hidden
   *********************************************************/
  let currentVideo = null;
  const originalPause = HTMLMediaElement.prototype.pause;

  HTMLMediaElement.prototype.pause = function () {
    // Allow pause if: not current video, flag set, OR tab is visible
    if (this !== currentVideo || this.dataset.allowPause === '1' || !reallyHidden) {
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
