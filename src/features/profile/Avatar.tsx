import './profile.css';

/** Round profile picture; falls back to the first letter of the name. */
export function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.45 };
  if (url) return <img className="avatar" src={url} alt="" style={style} />;
  return <span className="avatar initial" style={style} aria-hidden="true">{(name.trim()[0] ?? '?').toUpperCase()}</span>;
}
