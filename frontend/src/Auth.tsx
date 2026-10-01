import { FormEvent, useState } from "react";
import { login } from "./api";

export default function Auth({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [reg, setReg] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      setErr("");
      await login(email, pw, reg);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-story" aria-label="Legal Agent">
        <div className="brand-lockup">
          <span className="brand-mark">L</span>
          <span>LEGAL AGENT</span>
        </div>
        <div className="auth-story-copy">
          <span className="eyebrow">YOUR RESEARCH DESK</span>
          <h1>Clarity, with<br /><em>the record in view.</em></h1>
          <p>A focused workspace for working through the documents that matter.</p>
          <div className="auth-principles">
            <div><span>01</span><p>Keep your case materials together.</p></div>
            <div><span>02</span><p>Trace answers back to their sources.</p></div>
            <div><span>03</span><p>Stay in control of your research.</p></div>
          </div>
        </div>
        <div className="auth-story-foot"><span>PRIVATE WORKSPACE</span><span>01 — LEGAL RESEARCH</span></div>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <span className="eyebrow auth-eyebrow">{reg ? "CREATE YOUR WORKSPACE" : "WELCOME BACK"}</span>
          <h2>{reg ? "Start with a clear record." : "Sign in to continue."}</h2>
          <p className="auth-subtitle">{reg ? "Your research desk is ready when you are." : "Return to your cases and conversations."}</p>

          <form className="auth-form" onSubmit={go}>
            <label htmlFor="auth-email">Email address</label>
            <input id="auth-email" type="email" autoComplete="email" placeholder="you@firm.com" value={email} onChange={e => setEmail(e.target.value)} required />
            <label htmlFor="auth-password">Password</label>
            <div className="auth-password-field">
              <input id="auth-password" type={showPw ? "text" : "password"} autoComplete={reg ? "new-password" : "current-password"} placeholder={reg ? "At least 10 characters" : "Enter your password"} value={pw} onChange={e => setPw(e.target.value)} minLength={reg ? 10 : undefined} required />
              <button className="auth-password-toggle" type="button" aria-label={showPw ? "Hide password" : "Show password"} aria-pressed={showPw} onClick={() => setShowPw(value => !value)}>{showPw ? "Hide" : "Show"}</button>
            </div>
            {err && <div className="form-error" role="alert">{err}</div>}
            <button className="button-primary auth-submit" type="submit" disabled={busy}>{busy ? "Please wait..." : reg ? "Create account" : "Sign in"}</button>
          </form>

          <p className="auth-switch">
            {reg ? "Already have an account?" : "New to Legal Agent?"}
            <button className="text-button" type="button" onClick={() => { setReg(!reg); setErr(""); }}>{reg ? "Sign in" : "Create an account"}</button>
          </p>
          <p className="auth-legal">AI-assisted legal research. Always verify the law and source materials before relying on an answer.</p>
        </div>
      </section>
    </div>
  );
}
