/* V115: isolated main-section visibility + Daltown alert recovery.
   This file intentionally does not alter banners, slides, businesses, recommendations, or regional data. */
(() => {
  'use strict';
  const state = { lastKey: '', timer: null };

  function settings() {
    const raw = window.__DALTOWN_MAIN_SETTINGS__;
    return raw && typeof raw === 'object' ? raw : {};
  }

  function visibility() {
    const v = settings().section_visibility;
    return v && typeof v === 'object' ? v : {};
  }

  function isVisible(name) {
    return visibility()[name] !== false;
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.hidden = !!hidden;
    if (hidden) el.setAttribute('hidden', '');
    else el.removeAttribute('hidden');
  }

  function apply() {
    const today = isVisible('today');
    const community = isVisible('community');
    const alert = isVisible('alert');

    setHidden(document.getElementById('v37BriefCard'), !today);
    setHidden(document.getElementById('v37RecommendCard'), !today);

    const communityEl = document.getElementById('v45CommunityTicker');
    if (!community) setHidden(communityEl, true);
    else if (typeof window.v45SetupCommunity === 'function') {
      try { window.v45SetupCommunity(settings()); } catch (_) {}
    }

    const alertSection = document.querySelector('.home-ticker-section');
    if (!alert) {
      setHidden(alertSection, true);
    } else if (typeof window.renderDalpicks === 'function') {
      try { window.renderDalpicks(); } catch (err) { console.warn('[V115] alert refresh failed', err); }
    }

    const key = JSON.stringify(visibility());
    if (key !== state.lastKey) {
      state.lastKey = key;
      console.info('[V115] home section visibility applied', visibility());
    }
  }

  function scheduleApply() {
    clearTimeout(state.timer);
    state.timer = setTimeout(apply, 80);
  }

  document.addEventListener('DOMContentLoaded', () => {
    apply();
    setTimeout(apply, 800);
    setTimeout(apply, 2200);
  });
  window.addEventListener('load', apply);
  window.addEventListener('focus', scheduleApply);
  window.addEventListener('pageshow', scheduleApply);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleApply();
  });
  window.addEventListener('storage', scheduleApply);
  window.addEventListener('kfocus:event-routines-updated', scheduleApply);
  window.addEventListener('kfocus:board-home-pins-updated', scheduleApply);

  // Main settings are loaded asynchronously. Poll briefly without touching any content arrays.
  let attempts = 0;
  const poll = setInterval(() => {
    apply();
    attempts += 1;
    if (attempts >= 20 || window.__DALTOWN_MAIN_SETTINGS__) clearInterval(poll);
  }, 500);
})();
