/**
 * CalmKit session token.
 *
 * Your CalmKit stays account-free on purpose: someone who needs a breathing
 * exercise should not have to register first. But the portal endpoints behind it
 * call paid models, and until now they accepted requests from anywhere, so the
 * spend could not be told apart from a script and could not be attributed at all.
 *
 * The middle ground is a short-lived signed token the app fetches on load and
 * sends with every call. Nobody signs up, nothing personal is collected, and the
 * server can still tell app traffic from a scraper and bound how long any one
 * client keeps calling.
 *
 * Failure here must never block care. If a token cannot be obtained the call is
 * still attempted, the server answers 401, and the caller falls back to the local
 * coaching library, which is the same path a network failure already takes.
 */
const PROXY_URL =
  (typeof window !== 'undefined' && (window as any).CALMKIT_PROXY_URL) ||
  'https://volunteer.healthmatters.clinic/api/calmkit';

const STORAGE_KEY = 'hmc_calmkit_session';

interface StoredSession {
  token: string;
  /** Epoch ms. Refreshed before this, never after. */
  expiresAt: number;
}

let inFlight: Promise<string | null> | null = null;

const readStored = (): StoredSession | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    // Treat a token inside its last five minutes as already expired, so a long
    // guided walk cannot have its token lapse mid-session.
    if (!parsed?.token || Date.now() > parsed.expiresAt - 5 * 60 * 1000) return null;
    return parsed;
  } catch {
    // Private browsing can throw on storage access. Fall through and re-request.
    return null;
  }
};

const store = (session: StoredSession) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Non-fatal: the token still works for this page view, it just is not reused.
  }
};

/**
 * Returns a valid token, requesting one only when the stored token is missing or
 * close to expiry. Concurrent callers share a single request.
 */
export const getCalmKitSession = async (): Promise<string | null> => {
  const existing = readStored();
  if (existing) return existing.token;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(`${PROXY_URL}/session`, { method: 'POST' });
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string; expiresAt?: string };
      if (!data?.token) return null;
      const expiresAt = data.expiresAt ? Date.parse(data.expiresAt) : Date.now() + 11 * 60 * 60 * 1000;
      store({ token: data.token, expiresAt });
      return data.token;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

/** Headers for a CalmKit proxy call, including the session when one is available. */
export const calmKitHeaders = async (base: Record<string, string> = {}): Promise<Record<string, string>> => {
  const token = await getCalmKitSession();
  return token ? { ...base, 'X-CalmKit-Session': token } : base;
};
