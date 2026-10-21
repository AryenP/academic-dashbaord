import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CLIENT_ID,
  SpotifyError,
  connect as startConnect,
  disconnect as clearTokens,
  finishConnect,
  isConnected,
  player,
  type Device,
  type PlayerState,
  type Playlist,
} from './spotify';

// Spotify state for the whole app: the now-playing card, the header control and session cues all
// read from here. Polls the player every 5 s while the tab is visible and Spotify is connected.

interface SpotifyValue {
  /** A Spotify app is configured for this build. */
  available: boolean;
  connected: boolean;
  state: PlayerState | null;
  devices: Device[];
  playlists: Playlist[] | null;
  error: SpotifyError | null;
  connect(): void;
  disconnect(): void;
  /** Runs a player command, shows its error in plain words, and remembers it for "retry". */
  run(label: string, fn: () => Promise<unknown>): Promise<boolean>;
  retry(): Promise<void>;
  refresh(): Promise<void>;
  loadDevices(): Promise<void>;
  loadPlaylists(): Promise<void>;
  clearError(): void;
}

const SpotifyContext = createContext<SpotifyValue | null>(null);
const POLL_MS = 5000;

export function SpotifyProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(isConnected);
  const [state, setState] = useState<PlayerState | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [error, setError] = useState<SpotifyError | null>(null);
  const last = useRef<{ label: string; fn: () => Promise<unknown> } | null>(null);

  const fail = useCallback((e: unknown) => {
    const err = e instanceof SpotifyError ? e : new SpotifyError('other', 'Could not reach Spotify.');
    if (err.kind === 'auth') setConnected(isConnected());
    setError(err);
  }, []);

  const refresh = useCallback(async () => {
    if (!isConnected()) return;
    try {
      setState(await player.state());
    } catch (e) {
      // A failing poll only matters if you've lost the connection; command errors are shown instead.
      if (e instanceof SpotifyError && e.kind === 'auth') fail(e);
    }
  }, [fail]);

  // Finish a sign-in that public/spotify.html handed back.
  useEffect(() => {
    finishConnect()
      .then((ok) => {
        if (ok) {
          setConnected(true);
          setError(null);
        }
      })
      .catch(fail);
  }, [fail]);

  // Poll while visible.
  useEffect(() => {
    if (!connected) return;
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      void refresh();
      id = setInterval(refresh, POLL_MS);
    };
    const stop = () => clearInterval(id);
    const onVis = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [connected, refresh]);

  const run = useCallback<SpotifyValue['run']>(
    async (label, fn) => {
      last.current = { label, fn };
      try {
        await fn();
        setError(null);
        // Spotify takes a moment to reflect commands.
        setTimeout(refresh, 400);
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    [fail, refresh],
  );

  const value: SpotifyValue = {
    available: !!CLIENT_ID,
    connected,
    state: connected ? state : null,
    devices,
    playlists,
    error,
    connect: () => void startConnect(),
    disconnect: () => {
      clearTokens();
      setConnected(false);
      setState(null);
      setPlaylists(null);
      setError(null);
    },
    run,
    retry: async () => {
      if (last.current) await run(last.current.label, last.current.fn);
    },
    refresh,
    loadDevices: async () => {
      try {
        setDevices(await player.devices());
      } catch (e) {
        fail(e);
      }
    },
    loadPlaylists: async () => {
      try {
        setPlaylists(await player.playlists());
      } catch (e) {
        fail(e);
      }
    },
    clearError: () => setError(null),
  };

  return <SpotifyContext.Provider value={value}>{children}</SpotifyContext.Provider>;
}

export function useSpotify(): SpotifyValue {
  const v = useContext(SpotifyContext);
  if (!v) throw new Error('useSpotify needs <SpotifyProvider>');
  return v;
}
