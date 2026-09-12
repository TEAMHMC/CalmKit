/**
 * Native bridge for the Capacitor build.
 *
 * Two things the browser cannot do, and that CalmKit needs for a real outdoor run:
 *
 * 1. Play coaching over the user's own music instead of stopping it. There is no
 *    web API for this. On iOS the silent-WAV keepalive the web build uses to hold
 *    the audio session is exactly what kills Apple Music, so on native that
 *    keepalive is skipped and a real AVAudioSession is used instead.
 *
 * 2. Keep GPS delivering with the screen locked. navigator.geolocation inside the
 *    WKWebView is suspended on screen lock, which is what left locked-phone runs
 *    with holes in the route.
 *
 * Every export here is a safe no-op on the web build, so GuidedWalk can call them
 * unconditionally and the PWA behaves exactly as it does today.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativePosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
  timestamp: number;
}

interface CalmKitAudioPlugin {
  configure(): Promise<{ ok: boolean }>;
  duck(): Promise<{ ok: boolean }>;
  unduck(): Promise<{ ok: boolean }>;
}

interface CalmKitLocationPlugin {
  start(): Promise<{ ok: boolean }>;
  stop(): Promise<{ ok: boolean }>;
  isRunning(): Promise<{ running: boolean }>;
  addListener(
    event: 'position',
    cb: (position: NativePosition) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'locationError',
    cb: (error: { message: string }) => void
  ): Promise<PluginListenerHandle>;
}

const CalmKitAudio = registerPlugin<CalmKitAudioPlugin>('CalmKitAudio');
const CalmKitLocation = registerPlugin<CalmKitLocationPlugin>('CalmKitLocation');

export const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/** iOS only. Android has no background location plugin yet, so it keeps using the browser watch. */
export const hasNativeLocation = (): boolean => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
};

// ── Audio ────────────────────────────────────────────────────────────────────

export const configureAudioSession = async (): Promise<void> => {
  if (!isNative()) return;
  try {
    await CalmKitAudio.configure();
  } catch {
    // Falling back to default session behaviour is survivable: coaching still
    // plays, it just interrupts other audio the way the web build does.
  }
};

let duckDepth = 0;

/** Call immediately before a coaching cue plays. Other audio dips. */
export const duckOtherAudio = async (): Promise<void> => {
  if (!isNative()) return;
  duckDepth++;
  if (duckDepth > 1) return; // already ducked, cues overlapped
  try {
    await CalmKitAudio.duck();
  } catch {
    /* non-fatal */
  }
};

/** Call when the cue finishes. Other audio returns to full volume. */
export const unduckOtherAudio = async (): Promise<void> => {
  if (!isNative()) return;
  duckDepth = Math.max(0, duckDepth - 1);
  if (duckDepth > 0) return; // another cue is still playing
  try {
    await CalmKitAudio.unduck();
  } catch {
    /* non-fatal */
  }
};

/** Force the duck state back to idle, for session teardown. */
export const resetDucking = async (): Promise<void> => {
  if (!isNative()) return;
  duckDepth = 0;
  try {
    await CalmKitAudio.unduck();
  } catch {
    /* non-fatal */
  }
};

// ── Location ─────────────────────────────────────────────────────────────────

let positionHandle: PluginListenerHandle | null = null;
let errorHandle: PluginListenerHandle | null = null;

/**
 * Start background-capable GPS. Returns false if unavailable, in which case the
 * caller must fall back to navigator.geolocation.
 */
export const startNativeLocation = async (
  onPosition: (position: NativePosition) => void,
  onError?: (message: string) => void
): Promise<boolean> => {
  if (!hasNativeLocation()) return false;
  try {
    await stopNativeLocation();
    positionHandle = await CalmKitLocation.addListener('position', onPosition);
    if (onError) {
      errorHandle = await CalmKitLocation.addListener('locationError', e => onError(e.message));
    }
    await CalmKitLocation.start();
    return true;
  } catch {
    await stopNativeLocation();
    return false;
  }
};

export const stopNativeLocation = async (): Promise<void> => {
  try {
    await positionHandle?.remove();
  } catch {
    /* ignore */
  }
  try {
    await errorHandle?.remove();
  } catch {
    /* ignore */
  }
  positionHandle = null;
  errorHandle = null;
  if (!hasNativeLocation()) return;
  try {
    await CalmKitLocation.stop();
  } catch {
    /* ignore */
  }
};
