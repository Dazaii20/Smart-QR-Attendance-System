"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "signin" | "signup";

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("fullName") ?? "").trim();
    setError("");
    setNotice("");
    setLoading(true);
    const supabase = createClient();

    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/auth/callback` },
        });

    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setNotice("Check your email to confirm your account, then sign in.");
      return;
    }
    window.location.assign("/");
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setNotice("");
  }

  return (
    <div className="auth-screen">
      <aside className="auth-aside">
        <a className="brand brand-light" href="/" aria-label="Rollcall home"><span className="brand-mark">r.</span><span>rollcall</span></a>
        <div className="auth-story">
          <p className="eyebrow eyebrow-light">CAMPUS ATTENDANCE, REIMAGINED</p>
          <h1>Show up.<br /><em>Be counted.</em></h1>
          <p>One scan. One session. A clear record of every day you put in.</p>
        </div>
        <div className="auth-aside-foot"><span className="pulse-dot" /> BUILT FOR THE CLASSROOM, READY FOR SIWES</div>
        <div className="auth-pattern" aria-hidden="true" />
      </aside>
      <main className="auth-main">
        <div className="auth-form-wrap">
          <p className="eyebrow">{mode === "signin" ? "WELCOME BACK" : "GET STARTED"}</p>
          <h2>{mode === "signin" ? "Sign in to your account" : "Create your account"}</h2>
          <p className="auth-subtitle">{mode === "signin" ? "Your attendance record, right where you left it." : "Join your SIWES attendance workspace."}</p>
          <div className="auth-tabs" role="tablist" aria-label="Authentication">
            <button className={`auth-tab ${mode === "signin" ? "active" : ""}`} onClick={() => changeMode("signin")} type="button">Sign in</button>
            <button className={`auth-tab ${mode === "signup" ? "active" : ""}`} onClick={() => changeMode("signup")} type="button">Create account</button>
          </div>
          <form onSubmit={handleSubmit} noValidate>
            {mode === "signup" && <label className="field"><span>Full name</span><input name="fullName" type="text" autoComplete="name" minLength={2} required placeholder="e.g. Amaka Okafor" /></label>}
            <label className="field"><span>Email address</span><input name="email" type="email" autoComplete="email" required placeholder="you@school.edu.ng" /></label>
            <label className="field"><span>Password</span><input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} required placeholder="At least 8 characters" /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            {notice && <p className="auth-notice" role="status">{notice}</p>}
            <button className="button button-primary auth-submit" disabled={loading} type="submit">{loading ? "Please wait…" : mode === "signin" ? "Sign in →" : "Create account →"}</button>
          </form>
          <p className="auth-note">Secured by Supabase Auth · Lagos, Nigeria</p>
        </div>
      </main>
    </div>
  );
}
