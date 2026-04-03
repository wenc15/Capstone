const overlayTimers = new WeakMap();

export const OVERLAY_MS = 100;
export const PANEL_MS = 100;
export const CLEANUP_MS = 110;

try {
  if (typeof document !== 'undefined' && document.documentElement?.style) {
    document.documentElement.style.setProperty('--overlay-ms', `${OVERLAY_MS}ms`);
    document.documentElement.style.setProperty('--panel-ms', `${PANEL_MS}ms`);
  }
} catch {
  // ignore if document is unavailable
}

function clearOverlayTimer(overlay) {
  const timer = overlayTimers.get(overlay);
  if (timer) {
    clearTimeout(timer);
    overlayTimers.delete(overlay);
  }
}

export function openOverlayWithMotion(overlay, {
  hiddenClass = 'mg-hidden',
  openingClass = 'is-opening',
  closingClass = 'is-closing',
  openDurationMs = CLEANUP_MS,
} = {}) {
  if (!overlay) return;

  clearOverlayTimer(overlay);
  overlay.classList.remove(hiddenClass);
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.remove(closingClass);
  overlay.classList.remove(openingClass);
  void overlay.offsetWidth;
  overlay.classList.add(openingClass);

  const timer = setTimeout(() => {
    overlay.classList.remove(openingClass);
    overlayTimers.delete(overlay);
  }, Math.max(0, Number(openDurationMs) || 0));

  overlayTimers.set(overlay, timer);
}

export function closeOverlayWithMotion(overlay, {
  hiddenClass = 'mg-hidden',
  openingClass = 'is-opening',
  closingClass = 'is-closing',
  closeDurationMs = CLEANUP_MS,
} = {}) {
  if (!overlay || overlay.classList.contains(closingClass)) return;

  clearOverlayTimer(overlay);
  overlay.classList.remove(openingClass);
  overlay.classList.add(closingClass);
  overlay.setAttribute('aria-hidden', 'true');

  const timer = setTimeout(() => {
    overlay.classList.add(hiddenClass);
    overlay.classList.remove(closingClass);
    overlayTimers.delete(overlay);
  }, Math.max(0, Number(closeDurationMs) || 0));

  overlayTimers.set(overlay, timer);
}
