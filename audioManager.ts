/**
 * Singleton Audio Manager for CalmKit
 *
 * Solves three mobile issues:
 * 1. Guarantees only ONE AudioContext exists at a time (prevents double audio)
 * 2. Uses a silent <audio> element to keep the page alive when screen dims (iOS/Android)
 * 3. Automatically resumes AudioContext when app regains visibility
 */

let _ctx: AudioContext | null = null;
let _keepAliveEl: HTMLAudioElement | null = null;
let _wakeLock: any = null;

// Tiny silent WAV as a data URI (44 bytes of silence, looped)
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

/**
 * Get or create the shared AudioContext.
 * Closes any existing context first to prevent double audio.
 */
export async function getAudioContext(sampleRate = 24000): Promise<AudioContext> {
  // If there's an existing context, check if it's still usable
  if (_ctx && _ctx.state !== 'closed') {
    if (_ctx.state === 'suspended') {
      await _ctx.resume();
    }
    return _ctx;
  }

  // Create fresh context
  _ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
  if (_ctx.state === 'suspended') {
    await _ctx.resume();
  }
  return _ctx;
}

/**
 * Force-close the current AudioContext and stop all audio.
 * Call this when leaving a session or before starting a new one.
 */
export function destroyAudioContext(): void {
  if (_ctx) {
    try { _ctx.close(); } catch (e) {}
    _ctx = null;
  }
}

/**
 * Start the silent audio keepalive.
 * This prevents iOS/Android from suspending the page when the screen dims.
 * Must be called from a user gesture (tap/click handler).
 */
export function startKeepAlive(): void {
  if (_keepAliveEl) return; // Already running

  const el = document.createElement('audio');
  el.src = SILENT_WAV;
  el.loop = true;
  el.volume = 0.01; // Nearly silent but nonzero so iOS doesn't optimize it away
  el.setAttribute('playsinline', '');
  el.play().catch(() => {});
  _keepAliveEl = el;
}

/**
 * Stop the silent audio keepalive.
 */
export function stopKeepAlive(): void {
  if (_keepAliveEl) {
    _keepAliveEl.pause();
    _keepAliveEl.src = '';
    _keepAliveEl = null;
  }
}

/**
 * Request Wake Lock (screen stay on).
 */
export async function requestWakeLock(): Promise<void> {
  try {
    if ('wakeLock' in navigator) {
      _wakeLock = await (navigator as any).wakeLock.request('screen');
    }
  } catch (e) {}
}

/**
 * Release Wake Lock.
 */
export function releaseWakeLock(): void {
  if (_wakeLock) {
    try { _wakeLock.release(); } catch (e) {}
    _wakeLock = null;
  }
}

/**
 * Full cleanup: destroy audio context, stop keepalive, release wake lock.
 * Call this when a session ends.
 */
export function fullCleanup(): void {
  destroyAudioContext();
  stopKeepAlive();
  releaseWakeLock();
}

// Auto-resume AudioContext when page becomes visible again
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      // Re-request wake lock (it gets released when page goes background)
      if (_wakeLock) {
        try { _wakeLock = await (navigator as any).wakeLock.request('screen'); } catch (e) {}
      }
      // Resume AudioContext if it was suspended by the OS
      if (_ctx && _ctx.state === 'suspended') {
        try { await _ctx.resume(); } catch (e) {}
      }
      // Restart keepalive if it was interrupted
      if (_keepAliveEl && _keepAliveEl.paused) {
        _keepAliveEl.play().catch(() => {});
      }
    }
  });
}
