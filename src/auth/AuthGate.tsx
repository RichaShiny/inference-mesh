import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import "./auth.css";

export default function AuthGate({ children }: { children: ReactNode }) {
  const googleEnabled = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === "true";
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    setMessage(error ? error.message : "Check your inbox for a secure sign-in link.");
  }

  async function signInWithGoogle() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
    }
  }

  if (loading) return <main className="auth-loading">Opening your workspace…</main>;
  if (!session) {
    return <main className="auth-page">
      <section className="auth-story">
        <div className="brand-mark">IM</div>
        <p className="eyebrow">INFERENCEMESH</p>
        <h1>A private AI support desk your team can trust.</h1>
        <p>Sort customer requests on-device, apply company policy, and keep every human decision in a secure shared workspace.</p>
        <ul><li>Customer text can stay on your device</li><li>Your team shares one review queue</li><li>Every AI suggestion requires human approval</li></ul>
      </section>
      <section className="auth-card">
        <p className="eyebrow">WELCOME</p><h2>Sign in to your workspace</h2><p>Receive a secure one-time sign-in link by email.</p>
        {googleEnabled&&<><button className="google-button" onClick={() => void signInWithGoogle()} disabled={busy}>Continue with Google</button><div className="auth-divider"><span/>or use email<span/></div></>}
        <form onSubmit={sendMagicLink}><label htmlFor="auth-email">Work email</label><input id="auth-email" type="email" required value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="you@company.com"/><button type="submit" disabled={busy}>{busy?"Sending…":"Email me a sign-in link"}</button></form>
        {message&&<p className="auth-message" role="status">{message}</p>}
        <small>By continuing, you create a private personal workspace. Team invitations come next.</small>
      </section>
    </main>;
  }

  return <><div className="account-strip"><span>Signed in as <strong>{session.user.email}</strong></span><button onClick={()=>void supabase.auth.signOut()}>Sign out</button></div>{children}</>;
}
