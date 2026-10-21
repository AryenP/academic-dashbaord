import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { player, playlistId } from '../lib/spotify';
import { useSpotify } from '../lib/useSpotify';
import { Icon } from './Icon';

const artistOf = (s: NonNullable<ReturnType<typeof useSpotify>['state']>) =>
  s.item?.artists?.map((a) => a.name).join(', ') ?? s.item?.show?.name ?? '';
const coverOf = (s: NonNullable<ReturnType<typeof useSpotify>['state']>) => {
  const imgs = s.item?.album?.images ?? s.item?.images ?? [];
  return [...imgs].sort((a, b) => a.width - b.width).find((i) => i.width >= 64)?.url ?? imgs[0]?.url;
};

/** Plain-language Spotify error with a retry button. */
export function SpotifyError() {
  const sp = useSpotify();
  if (!sp.error) return null;
  return (
    <div className="np-error" role="alert">
      <span>{sp.error.message}</span>
      {sp.error.kind !== 'premium' && sp.error.kind !== 'auth' && (
        <button className="btn btn-small" onClick={sp.retry}>
          <Icon name="refresh" size={16} /> Retry
        </button>
      )}
      {sp.error.kind === 'auth' && (
        <button className="btn btn-small" onClick={sp.connect}>
          Connect
        </button>
      )}
      <button className="icon-btn icon-btn-sm" onClick={sp.clearError} aria-label="Dismiss">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

/** The full card for the focus screen: cover, track, controls, volume and device picker. */
export function NowPlaying() {
  const sp = useSpotify();
  const { settings } = useAuth();
  const [devicesOpen, setDevicesOpen] = useState(false);

  if (!sp.connected) {
    const embed = settings.embed_playlist ? playlistId(settings.embed_playlist) : null;
    if (embed)
      return (
        <iframe
          className="np-embed"
          title="Spotify playlist"
          src={`https://open.spotify.com/embed/playlist/${embed}?theme=0`}
          height="152"
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        />
      );
    return null;
  }

  const s = sp.state;
  return (
    <div className="np" aria-label="Spotify">
      {s?.item ? (
        <div className="np-track">
          {coverOf(s) ? (
            <img src={coverOf(s)} alt="" width={56} height={56} />
          ) : (
            <span className="np-cover" />
          )}
          <div className="np-text">
            <b>{s.item.name}</b>
            <span>{artistOf(s)}</span>
          </div>
        </div>
      ) : (
        <p className="np-idle">
          <Icon name="music" size={18} /> Nothing playing. Open Spotify on a device, or press play.
        </p>
      )}
      <div className="np-controls">
        <button
          className="icon-btn"
          onClick={() => sp.run('Previous', player.previous)}
          aria-label="Previous track"
        >
          <Icon name="prev" />
        </button>
        <button
          className="icon-btn np-play"
          onClick={() =>
            sp.run(s?.is_playing ? 'Pause' : 'Play', s?.is_playing ? player.pause : () => player.play())
          }
          aria-label={s?.is_playing ? 'Pause music' : 'Play music'}
        >
          <Icon name={s?.is_playing ? 'pause' : 'play'} />
        </button>
        <button className="icon-btn" onClick={() => sp.run('Next', player.next)} aria-label="Next track">
          <Icon name="next" />
        </button>
        {s?.device && (
          <label className="np-volume">
            <Icon name="volume" size={18} />
            <span className="sr-only">Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              defaultValue={s.device.volume_percent ?? 50}
              key={s.device.id}
              onChange={(e) => {
                const v = Number(e.target.value);
                void sp.run('Volume', () => player.volume(v));
              }}
            />
          </label>
        )}
        <button
          className="btn btn-small np-device"
          onClick={() => {
            setDevicesOpen((v) => !v);
            void sp.loadDevices();
          }}
          aria-expanded={devicesOpen}
        >
          <Icon name="device" size={16} /> {s?.device?.name ?? 'Choose a device'}
        </button>
      </div>
      {devicesOpen && (
        <ul className="np-devices" aria-label="Play on">
          {sp.devices.length === 0 && (
            <li className="muted small">No devices. Open Spotify on your phone or laptop.</li>
          )}
          {sp.devices.map((d) => (
            <li key={d.id}>
              <button
                className={`np-dev${d.is_active ? ' is-active' : ''}`}
                aria-pressed={d.is_active}
                onClick={async () => {
                  if (await sp.run('Switch device', () => player.transfer(d.id))) setDevicesOpen(false);
                }}
              >
                {d.name} <span className="muted">· {d.type.toLowerCase()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <SpotifyError />
    </div>
  );
}

/** Header control: play/pause and the track title, linking to the focus screen. */
export function NowPlayingCompact() {
  const sp = useSpotify();
  const s = sp.state;
  if (!sp.connected || !s?.item) return null;
  return (
    <div className="np-mini">
      <button
        className="icon-btn icon-btn-sm"
        onClick={() =>
          sp.run(s.is_playing ? 'Pause' : 'Play', s.is_playing ? player.pause : () => player.play())
        }
        aria-label={s.is_playing ? 'Pause music' : 'Play music'}
      >
        <Icon name={s.is_playing ? 'pause' : 'play'} size={16} />
      </button>
      <Link to="/focus" className="np-mini-t" title={`${s.item.name} · ${artistOf(s)}`}>
        {s.item.name}
      </Link>
    </div>
  );
}
