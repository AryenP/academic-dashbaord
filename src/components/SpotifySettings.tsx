import { useEffect, useId, useState } from 'react';
import { useAuth, type Settings } from '../lib/auth';
import { playlistId, type Playlist } from '../lib/spotify';
import { useSpotify } from '../lib/useSpotify';
import { Icon } from './Icon';
import { SpotifyError } from './NowPlaying';

const CUES: { key: keyof NonNullable<Settings['cues']>; label: string }[] = [
  { key: 'start', label: 'Start a session: play the focus playlist' },
  { key: 'break', label: 'Start a break: switch music' },
  { key: 'resume', label: 'Back to work: play the focus playlist again' },
  { key: 'end', label: 'End a session: pause' },
];

export function SpotifySettings() {
  const sp = useSpotify();
  const { settings, updateSettings } = useAuth();
  const cues = {
    start: true,
    break: true,
    resume: true,
    end: true,
    break_action: 'playlist' as const,
    ...settings.cues,
  };
  const { connected, playlists, loadPlaylists } = sp;

  useEffect(() => {
    if (connected && !playlists) void loadPlaylists();
  }, [connected, playlists, loadPlaylists]);

  const pick = (which: 'focus_playlist' | 'break_playlist', id: string) => {
    const p = sp.playlists?.find((x) => x.id === id);
    void updateSettings({ [which]: p ? { uri: p.uri, name: p.name } : null });
  };

  return (
    <section className="card-section" aria-labelledby="spotify-h">
      <h2 id="spotify-h" className="mc-h2">
        Music
      </h2>
      {!sp.available ? (
        <p className="mc-note">
          Spotify control isn't set up on this copy of the site. You can still add a playlist to play in the
          focus screen below.
        </p>
      ) : !sp.connected ? (
        <div className="form-row">
          <p className="grow mc-note" style={{ margin: 0 }}>
            Control the Spotify app on your phone or laptop from Runway, and let music follow your sessions.
            Needs Spotify Premium. Connects this device only.
          </p>
          <button className="btn btn-primary" onClick={sp.connect}>
            <Icon name="music" size={18} /> Connect Spotify
          </button>
        </div>
      ) : (
        <>
          <div className="form-row">
            <p className="grow" style={{ margin: 0 }}>
              <b>Spotify is connected</b> on this device.
            </p>
            <button className="btn btn-quiet" onClick={sp.disconnect}>
              Disconnect
            </button>
          </div>
          <div className="form-row">
            <PlaylistSelect
              playlists={sp.playlists}
              label="Focus playlist"
              value={settings.focus_playlist?.uri}
              onChange={(id) => pick('focus_playlist', id)}
            />
            <PlaylistSelect
              playlists={sp.playlists}
              label="Break playlist"
              value={settings.break_playlist?.uri}
              onChange={(id) => pick('break_playlist', id)}
            />
          </div>
          <fieldset className="field">
            <legend className="field-label">Music follows the session</legend>
            {CUES.map((c) => (
              <label key={c.key} className="check">
                <input
                  type="checkbox"
                  checked={cues[c.key] !== false}
                  onChange={(e) => updateSettings({ cues: { ...settings.cues, [c.key]: e.target.checked } })}
                />
                <span>{c.label}</span>
              </label>
            ))}
            <label className="field" style={{ maxWidth: '22rem' }}>
              <span className="field-label">On a break</span>
              <select
                value={cues.break_action}
                onChange={(e) =>
                  updateSettings({
                    cues: { ...settings.cues, break_action: e.target.value as 'playlist' | 'pause' },
                  })
                }
              >
                <option value="playlist">Play the break playlist</option>
                <option value="pause">Pause the music</option>
              </select>
            </label>
          </fieldset>
        </>
      )}
      <SpotifyError />
      <EmbedField />
    </section>
  );
}

function PlaylistSelect({
  playlists,
  label,
  value,
  onChange,
}: {
  playlists: Playlist[] | null;
  label: string;
  value?: string;
  onChange: (id: string) => void;
}) {
  const list = playlists ?? [];
  const id = useId();
  return (
    <div className="field grow">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={list.find((p) => p.uri === value)?.id ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{playlists ? 'None' : 'Loading your playlists…'}</option>
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** No-login fallback: a Spotify embed of any playlist link, shown on the focus screen. */
function EmbedField() {
  const { settings, updateSettings } = useAuth();
  const [value, setValue] = useState(settings.embed_playlist ?? '');
  const valid = !value.trim() || !!playlistId(value);
  return (
    <label className="field">
      <span className="field-label">Playlist to embed when Spotify isn't connected (optional)</span>
      <input
        type="text"
        value={value}
        placeholder="https://open.spotify.com/playlist/…"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => valid && updateSettings({ embed_playlist: value.trim() || null })}
        aria-invalid={!valid}
      />
      <span className="field-hint">
        {valid
          ? 'Plays a 30-second preview unless you are signed in to Spotify in this browser.'
          : "That doesn't look like a playlist link."}
      </span>
    </label>
  );
}
