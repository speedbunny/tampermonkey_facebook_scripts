# tampermonkey_facebook_scripts
Tampermonkey scripts I use for Facebook: Background Audio Keepalive for Reels and Autoduck +  zbluebugz Clean My Feed (https://github.com/zbluebugz/)

# Facebook Reels – Background Audio Keepalive

Keeps Facebook Reels audio playing when the tab is unfocused.

## Why this exists

Facebook pauses Reels audio when the tab loses focus by:
- Using the Page Visibility API
- Monitoring window focus / blur
- Explicitly calling `HTMLMediaElement.pause()`

This userscript lies convincingly enough to bypass that behaviour.

## Requirements

- Firefox or Chromium browser
- Tampermonkey (recommended)

## Install

1. Install Tampermonkey
2. Create a new userscript
3. Paste the script from `fb-reels-audio-keepalive.user.js`
4. Reload Facebook

## Notes

- Works by spoofing visibility + focus
- Prevents background-triggered pauses
- Allows clean transition between Reels (no audio looping)

## Disclaimer

For personal use.  
No affiliation with Meta.

----

# Facebook Reels Anti-Hover Ducking
**Prototype Patch (v1.4)**

Hard-blocks Facebook’s “hover / next-reel” volume ducking by patching the
HTMLMediaElement.volume setter at runtime. Your chosen volume persists
across Reels, hovers, and autoplay transitions.

Designed for Tampermonkey. Runs at document-start.

---

## What this fixes

Facebook frequently reduces (or nearly mutes) audio when:

- Hovering over Reels
- Auto-advancing to the next Reel
- Losing focus or changing playback state
- Reusing <video> elements in the carousel

These changes are app-driven, not user intent.

This userscript:

- Blocks non-user-initiated volume drops
- Preserves your last intentional volume level
- Restores volume instantly when ducking is detected
- Survives SPA navigation, element reuse, and source swaps

---

## How it works (high level)

- Prototype patching: overrides the HTMLMediaElement.volume setter so all
  volume changes pass through a single gate.
- Gesture detection: tracks real user input (mouse, touch, keyboard) to
  distinguish intentional volume changes from Facebook automation.
- Ducking heuristics: suspiciously low values are treated as ducking and
  replaced with the last known user volume.
- Persistence: stores the user’s volume in localStorage and reapplies it
  across Reels and sessions.
- Resilience: handles reused media elements, src swaps, autoplay quirks,
  and muted-on-play edge cases.

No DOM polling. No timers. No React internals.

---

## Features

- Blocks hover-based and next-reel volume ducking
- Persists user-selected volume across Reels
- Handles reused <video> elements
- Survives SPA navigation and autoplay
- Optional auto-unmute on play
- Lightweight toast feedback
- Keyboard toggle

---

## Controls

Toggle protection on/off:

- Shift + V

A toast and console message confirm the current state.

---

## Configuration

Editable constants near the top of the script:

```js
const MIN_DUCK = 0.15;
const DEFAULT_VOLUME = 1.0;
const GESTURE_WINDOW_MS = 1200;
const AUTOUNMUTE_ON_PLAY = true;


