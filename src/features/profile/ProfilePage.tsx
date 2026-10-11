import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { errorText, supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { notificationsSupported, setSoundEnabled, soundEnabled } from '../notify/useGameNotifications';
import { Avatar } from './Avatar';
import { toSquareWebp } from './avatarImage';

/** Name, profile picture and notification settings. */
export function ProfilePage() {
  const { session, ready, profile, refresh, signOut } = useAuth();
  const [name, setName] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(soundEnabled);
  const [permission, setPermission] = useState(() => (notificationsSupported() ? Notification.permission : 'unsupported'));
  const fileRef = useRef<HTMLInputElement>(null);

  if (!ready) return <div className="panel"><p className="muted">Wird geladen …</p></div>;
  if (!session) return <Navigate to="/anmelden" replace />;
  if (!profile || !supabase) return <div className="panel"><p className="muted">Profil wird geladen …</p></div>;
  const client = supabase;
  const currentName = name ?? profile.display_name;

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const { error } = await client.from('profiles').update({ display_name: currentName.trim() }).eq('id', profile!.id);
    if (error) setMsg({ ok: false, text: 'Der Name muss 2 bis 24 Zeichen lang sein.' });
    else { await refresh(); setName(null); setMsg({ ok: true, text: 'Name gespeichert.' }); }
  }

  async function upload(file: File) {
    setMsg(null);
    setBusy(true);
    try {
      const blob = await toSquareWebp(file);
      const path = `${profile!.id}/avatar.webp`;
      const up = await client.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/webp' });
      if (up.error) throw up.error;
      // Cache-busting query so the new picture shows right away.
      const url = `${client.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
      const { error } = await client.from('profiles').update({ avatar_url: url }).eq('id', profile!.id);
      if (error) throw error;
      await refresh();
      setMsg({ ok: true, text: 'Profilbild gespeichert.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error && e.message === 'encode_failed' ? 'Dieses Bild konnte nicht gelesen werden.' : errorText(e) });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeAvatar() {
    setMsg(null);
    await client.storage.from('avatars').remove([`${profile!.id}/avatar.webp`]);
    await client.from('profiles').update({ avatar_url: null }).eq('id', profile!.id);
    await refresh();
  }

  return (
    <div className="grid2">
      <section className="panel">
        <h1>Profil</h1>
        <div className="profilehead">
          <Avatar url={profile.avatar_url} name={profile.display_name} size={72} />
          <div className="row">
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>{profile.avatar_url ? 'Bild ändern' : 'Bild hochladen'}</button>
            {profile.avatar_url && <button type="button" disabled={busy} onClick={() => void removeAvatar()}>Entfernen</button>}
            <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Profilbild"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          </div>
        </div>
        <form className="row" onSubmit={saveName}>
          <input aria-label="Anzeigename" value={currentName} minLength={2} maxLength={24} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
          <button type="submit" disabled={currentName.trim() === profile.display_name || currentName.trim().length < 2}>Name speichern</button>
        </form>
        {msg && <p className={msg.ok ? 'success' : 'error'} role="status">{msg.text}</p>}
        <div className="row"><Link className="btn" to="/design">Brett und Figuren gestalten</Link></div>
      </section>
      <section className="panel">
        <h2>Benachrichtigungen</h2>
        <label className="check">
          <input type="checkbox" checked={sound} onChange={(e) => { setSoundEnabled(e.target.checked); setSound(e.target.checked); }} />
          Ton bei Benachrichtigungen (auf diesem Gerät)
        </label>
        {permission === 'default' && (
          <button type="button" onClick={() => void Notification.requestPermission().then(setPermission)}>Browser-Benachrichtigungen erlauben</button>
        )}
        {permission === 'granted' && <p className="note">Browser-Benachrichtigungen sind erlaubt.</p>}
        {permission === 'denied' && <p className="note">Browser-Benachrichtigungen sind in deinen Browser-Einstellungen blockiert.</p>}
        <div className="row"><button type="button" onClick={() => void signOut()}>Abmelden</button></div>
      </section>
    </div>
  );
}
