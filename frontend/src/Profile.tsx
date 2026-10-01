import { FormEvent, useEffect, useState } from "react";
import { req } from "./api";

type ProfileData = { email: string; display_name: string };

export default function Profile({ onClose }: { onClose: () => void }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    req("/profile").then((data: ProfileData) => {
      setProfile(data);
      setName(data.display_name);
    }).catch((e: Error) => setError(e.message));
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const data = await req("/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name }),
      }) as ProfileData;
      setProfile(data);
      setName(data.display_name);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const initials = (profile?.display_name || profile?.email || "U").slice(0, 1).toUpperCase();

  return (
    <div className="profile-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <header className="profile-dialog-header">
          <div><span className="eyebrow">ACCOUNT</span><h2 id="profile-title">Your profile</h2></div>
          <button className="profile-close" type="button" onClick={onClose} aria-label="Close profile">×</button>
        </header>
        {profile ? <>
          <div className="profile-identity">
            <span className="profile-avatar" aria-hidden="true">{initials}</span>
            <div><strong>{profile.display_name || "Your account"}</strong><span>{profile.email}</span></div>
          </div>
          <form className="profile-form" onSubmit={save}>
            <label htmlFor="profile-name">Display name</label>
            <input id="profile-name" autoComplete="name" maxLength={120} placeholder="Add your name" value={name} onChange={e => setName(e.target.value)} />
            <label htmlFor="profile-email">Email address</label>
            <input id="profile-email" type="email" value={profile.email} readOnly />
            {error && <p className="profile-message error" role="alert">{error}</p>}
            {saved && <p className="profile-message success" role="status">Profile updated.</p>}
            <div className="profile-form-actions">
              <button className="profile-cancel" type="button" onClick={onClose}>Close</button>
              <button className="button-primary profile-save" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
            </div>
          </form>
        </> : <p className="profile-loading" role="status">{error || "Loading your profile…"}</p>}
      </section>
    </div>
  );
}
