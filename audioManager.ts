/**
 * Singleton Audio Manager for CalmKit
 *
 * Solves mobile background-audio issues with multiple layered strategies:
 * 1. Guarantees only ONE AudioContext exists at a time (prevents double audio)
 * 2. Uses a generated 10-second silent WAV blob on an <audio> element to keep
 *    the browser process alive when the screen locks (iOS/Android)
 * 3. Media Session API marks this as active media so the OS won't suspend it
 * 4. Aggressive wake-lock re-acquisition (visibilitychange + 30s interval)
 * 5. Periodic AudioContext health check (every 5s) to catch OS suspension
 */

let _ctx: AudioContext | null = null;
let _keepAliveEl: HTMLAudioElement | null = null;
let _keepAliveBlobUrl: string | null = null;
let _wakeLock: any = null;
let _wakeLockInterval: ReturnType<typeof setInterval> | null = null;
let _healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let _wantWakeLock = false;
// Callback invoked when AudioContext is resumed from screen-lock/suspension.
// GuidedWalk registers this to restart the narration loop after interruption.
let _onSessionResume: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Silent WAV generator — produces a proper 10-second silent WAV as a Blob URL.
// A longer buffer is much harder for iOS/Android to optimise away.
// ---------------------------------------------------------------------------
function generateSilentWavBlob(durationSec = 10, sampleRate = 44100): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);                          // sub-chunk size
  view.setUint16(20, 1, true);                            // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk (all zeros = silence)
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  // samples are already 0 (ArrayBuffer is zero-initialised)

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ---------------------------------------------------------------------------
// Media Session — tells the OS "this is active media, do not suspend"
// ---------------------------------------------------------------------------
function setupMediaSession(): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: 'CalmKit Meditation',
    artist: 'CalmKit',
    album: 'Guided Session',
  });

  const noop = () => {};
  navigator.mediaSession.setActionHandler('play', () => {
    if (_keepAliveEl && _keepAliveEl.paused) _keepAliveEl.play().catch(noop);
    if (_ctx && _ctx.state === 'suspended') {
      _ctx.resume().then(() => _onSessionResume?.()).catch(noop);
    } else {
      _onSessionResume?.();
    }
  });
  navigator.mediaSession.setActionHandler('pause', noop);
  navigator.mediaSession.setActionHandler('seekbackward', noop);
  navigator.mediaSession.setActionHandler('seekforward', noop);
  navigator.mediaSession.setActionHandler('previoustrack', noop);
  navigator.mediaSession.setActionHandler('nexttrack', noop);
}

function clearMediaSession(): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
  } catch (_) {}
}

export function updateMediaSessionMetadata(title: string, artist: string): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album: 'CalmKit' });
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// AudioContext health check — every 5 s, resume if suspended
// ---------------------------------------------------------------------------
function startHealthCheck(): void {
  stopHealthCheck();
  _healthCheckInterval = setInterval(async () => {
    if (_ctx && _ctx.state === 'suspended') {
      try { await _ctx.resume(); } catch (_) {}
    }
    // Also make sure keepalive is still playing
    if (_keepAliveEl && _keepAliveEl.paused) {
      _keepAliveEl.play().catch(() => {});
    }
  }, 5_000);
}

function stopHealthCheck(): void {
  if (_healthCheckInterval) {
    clearInterval(_healthCheckInterval);
    _healthCheckInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Wake Lock — aggressive re-acquisition every 30 s
// ---------------------------------------------------------------------------
async function tryAcquireWakeLock(): Promise<void> {
  if (!_wantWakeLock) return;
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      _wakeLock = await (navigator as any).wakeLock.request('screen');
      _wakeLock.addEventListener('release', () => { _wakeLock = null; });
    }
  } catch (_) {}
}

function startWakeLockInterval(): void {
  stopWakeLockInterval();
  _wakeLockInterval = setInterval(() => {
    if (_wantWakeLock && !_wakeLock) {
      tryAcquireWakeLock();
    }
  }, 30_000);
}

function stopWakeLockInterval(): void {
  if (_wakeLockInterval) {
    clearInterval(_wakeLockInterval);
    _wakeLockInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

  // Start the health-check heartbeat whenever we have an active context
  startHealthCheck();

  return _ctx;
}

/**
 * Force-close the current AudioContext and stop all audio.
 * Call this when leaving a session or before starting a new one.
 */
export function destroyAudioContext(): void {
  stopHealthCheck();
  if (_ctx) {
    try { _ctx.close(); } catch (_) {}
    _ctx = null;
  }
}

/**
 * Start the silent audio keepalive.
 * This prevents iOS/Android from suspending the page when the screen dims/locks.
 * Must be called from a user gesture (tap/click handler).
 *
 * Strategy: a generated 10-second silent WAV played via <audio> at near-zero
 * volume keeps the browser process alive. Combined with the Media Session API
 * registration, the OS treats the tab as actively playing media.
 */
export function startKeepAlive(): void {
  if (_keepAliveEl) return; // Already running

  // Generate the silent WAV blob and create a blob URL
  const blob = generateSilentWavBlob(10, 44100);
  _keepAliveBlobUrl = URL.createObjectURL(blob);

  const el = document.createElement('audio');
  el.src = _keepAliveBlobUrl;
  el.loop = true;
  // Near-silent but nonzero — iOS skips truly silent streams and won't hold the audio session.
  // 0.01 is the minimum volume that reliably keeps AVAudioSession active on iOS 16+.
  el.volume = 0.01;
  el.setAttribute('playsinline', '');
  // x-webkit-airplay="allow" tells iOS WebKit this element participates in the audio session
  el.setAttribute('x-webkit-airplay', 'allow');
  el.play().catch(() => {});
  _keepAliveEl = el;

  // Tell the OS this is active media
  setupMediaSession();
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
  if (_keepAliveBlobUrl) {
    URL.revokeObjectURL(_keepAliveBlobUrl);
    _keepAliveBlobUrl = null;
  }
  clearMediaSession();
}

/**
 * Request Wake Lock (keep screen on).
 * Also starts a 30-second re-acquisition interval because the OS releases
 * the lock when the page goes to the background.
 */
export async function requestWakeLock(): Promise<void> {
  _wantWakeLock = true;
  await tryAcquireWakeLock();
  startWakeLockInterval();
}

/**
 * Release Wake Lock.
 */
export function releaseWakeLock(): void {
  _wantWakeLock = false;
  stopWakeLockInterval();
  if (_wakeLock) {
    try { _wakeLock.release(); } catch (_) {}
    _wakeLock = null;
  }
}

/**
 * Register a callback invoked when AudioContext resumes after screen-lock.
 * GuidedWalk uses this to restart the narration loop after interruption.
 */
export function setSessionResumeCallback(fn: () => void): void {
  _onSessionResume = fn;
}

export function clearSessionResumeCallback(): void {
  _onSessionResume = null;
}

/**
 * Temporarily pause the silent keepalive so the OS releases the audio session.
 * Call this during interval-mode gaps so Apple Music / Spotify can resume.
 * Resume the keepalive with resumeKeepAliveAudio() before the next coaching segment.
 */
export function pauseKeepAliveAudio(): void {
  if (_keepAliveEl && !_keepAliveEl.paused) _keepAliveEl.pause();
}

export function resumeKeepAliveAudio(): void {
  if (_keepAliveEl && _keepAliveEl.paused) _keepAliveEl.play().catch(() => {});
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

// ---------------------------------------------------------------------------
// Visibility-change listener — aggressive recovery when the app comes back
// ---------------------------------------------------------------------------
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      // Re-request wake lock (it gets released when page goes background)
      if (_wantWakeLock && !_wakeLock) {
        tryAcquireWakeLock();
      }
      // Restart keepalive if it was interrupted
      if (_keepAliveEl && _keepAliveEl.paused) {
        _keepAliveEl.play().catch(() => {});
      }
      // Resume AudioContext if it was suspended by the OS, then restart narration
      if (_ctx && _ctx.state === 'suspended') {
        try {
          await _ctx.resume();
          _onSessionResume?.();
        } catch (_) {}
      } else {
        // Context wasn't suspended but the source node may have died silently —
        // still notify so GuidedWalk can check and restart if needed.
        _onSessionResume?.();
      }
    }
  });
}
