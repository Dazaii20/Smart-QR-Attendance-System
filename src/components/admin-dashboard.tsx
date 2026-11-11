"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import { createClient } from "@/lib/supabase/client";

type Props = { email: string; name?: string; baseUrl?: string };

type SessionRow = {
  id: string;
  title: string;
  course: string;
  starts_at: string;
  closes_at: string;
  qr_token: string;
  cancelled_at: string | null;
};

type AttendanceRow = {
  session_id: string;
  scanned_at: string;
  attendance_sessions: { title: string; course: string } | { title: string; course: string }[] | null;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
};

function sessionStatus(session: SessionRow): { label: string; open: boolean } {
  if (session.cancelled_at) return { label: "Ended", open: false };
  const now = Date.now();
  if (now > new Date(session.closes_at).getTime()) return { label: "Expired", open: false };
  if (now < new Date(session.starts_at).getTime()) return { label: "Scheduled", open: false };
  return { label: "Open", open: true };
}

function first<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export function AdminDashboard({ email, name, baseUrl }: Props) {
  const [view, setView] = useState<"sessions" | "attendance">("sessions");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [origin, setOrigin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [selected, setSelected] = useState<SessionRow | null>(null);

  const firstName = name?.split(" ")[0] || email.split("@")[0];
  const date = useMemo(
    () => new Intl.DateTimeFormat("en-NG", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date()).toUpperCase(),
    [],
  );

  const loadSessions = useCallback(async () => {
    const { data } = await createClient()
      .from("attendance_sessions")
      .select("id, title, course, starts_at, closes_at, qr_token, cancelled_at")
      .order("created_at", { ascending: false });
    setSessions((data as SessionRow[]) ?? []);
  }, []);

  const loadRecords = useCallback(async () => {
    const { data } = await createClient()
      .from("attendance_records")
      .select("session_id, scanned_at, attendance_sessions(title, course), profiles(full_name)")
      .order("scanned_at", { ascending: false });
    setRecords((data as unknown as AttendanceRow[]) ?? []);
  }, []);

  useEffect(() => {
    setOrigin(baseUrl || window.location.origin);
    loadSessions();
    loadRecords();
    const timer = window.setInterval(() => {
      loadSessions();
      loadRecords();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [baseUrl, loadSessions, loadRecords]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const record of records) map.set(record.session_id, (map.get(record.session_id) ?? 0) + 1);
    return map;
  }, [records]);

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const course = String(data.get("course") ?? "").trim();
    const hours = Math.min(Math.max(Number(data.get("hours")) || 12, 1), 72);
    setError("");
    setBusy(true);
    const { error: insertError } = await createClient()
      .from("attendance_sessions")
      .insert({ title, course, closes_at: new Date(Date.now() + hours * 3_600_000).toISOString() });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    form.reset();
    await loadSessions();
  }

  async function endSession(id: string) {
    const { error: updateError } = await createClient()
      .from("attendance_sessions")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) setError(updateError.message);
    await loadSessions();
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(`${origin}/attend/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  async function signOut() {
    await createClient().auth.signOut();
    window.location.assign("/");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/admin"><span className="brand-mark">r.</span><span>rollcall</span></a>
        <div className="workspace-label">ADMIN WORKSPACE</div>
        <nav className="primary-nav" aria-label="Admin navigation">
          <button className={`nav-link ${view === "sessions" ? "active" : ""}`} onClick={() => setView("sessions")}><span className="nav-icon">▦</span>Sessions & QR</button>
          <button className={`nav-link ${view === "attendance" ? "active" : ""}`} onClick={() => setView("attendance")}><span className="nav-icon">◷</span>All attendance</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="security-note"><span className="security-icon">QR</span><div><strong>Scan-to-attend</strong><small>Codes point to /attend/…</small></div></div>
          <div className="profile-button"><span className="avatar">{firstName.slice(0, 1).toUpperCase()}</span><span className="profile-copy"><strong>{name || firstName}</strong><small>{email}</small></span></div>
          <button className="signout-button" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div><p className="topbar-kicker">{date}</p><p className="topbar-location">Lagos, Nigeria <span className="location-dot" /> Admin workspace</p></div><span className="role-chip">ADMIN</span></header>
        {view === "sessions" && (
          <section className="view active">
            <div className="page-heading"><div><p className="eyebrow">SESSION CONTROL</p><h1>Sessions & QR codes</h1><p className="page-subtitle">Open a session and let students scan the code to check in.</p></div></div>
            <div className="content-grid">
              <section className="content-section">
                <div className="section-heading"><div><p className="eyebrow">NEW SESSION</p><h2>Create a session</h2></div></div>
                <form onSubmit={createSession} noValidate>
                  <label className="field"><span>Session title</span><input name="title" type="text" minLength={2} maxLength={120} required placeholder="e.g. SIWES project briefing" /></label>
                  <label className="field"><span>Course</span><input name="course" type="text" minLength={2} maxLength={120} required placeholder="e.g. Industrial Training · 300L" /></label>
                  <label className="field"><span>Closes in (hours)</span><input name="hours" type="number" min={1} max={72} defaultValue={12} required /></label>
                  {error && <p className="form-error" role="alert">{error}</p>}
                  <button className="button button-primary auth-submit" disabled={busy} type="submit">{busy ? "Creating…" : "Create session →"}</button>
                </form>
              </section>
              <aside className="content-section side-section">
                <div className="section-heading"><div><p className="eyebrow">LIVE & PAST</p><h2>Sessions</h2></div></div>
                {sessions.length === 0 && <p className="empty-inline">No sessions yet. Create one to generate its QR code.</p>}
                <div className="upcoming-list">
                  {sessions.map((session) => {
                    const status = sessionStatus(session);
                    return (
                      <div className="upcoming-row" key={session.id} style={{ flexWrap: "wrap", gap: "12px" }}>
                        <div className="upcoming-copy">
                          <strong>{session.title}</strong>
                          <small>{session.course} · {status.label} · {counts.get(session.id) ?? 0} checked in · closes {new Date(session.closes_at).toLocaleString("en-NG")}</small>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <button className="button button-light" type="button" onClick={() => setSelected(session)}>View QR</button>
                          <button className="button button-light" type="button" onClick={() => copyLink(session.qr_token)}>{copied === session.qr_token ? "Copied!" : "Copy link"}</button>
                          {status.open && <button className="button button-light" type="button" onClick={() => endSession(session.id)}>End session</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </aside>
            </div>
          </section>
        )}
        {view === "attendance" && (
          <section className="view active">
            <div className="page-heading"><div><p className="eyebrow">FULL RECORD</p><h1>All attendance</h1><p className="page-subtitle">{records.length} check-in{records.length === 1 ? "" : "s"} recorded across all sessions.</p></div></div>
            <div className="history-summary">
              <div><span className="summary-label">TOTAL CHECK-INS</span><strong>{records.length}</strong></div>
              <div><span className="summary-label">SESSIONS</span><strong>{new Set(records.map((r) => first(r.attendance_sessions)?.title)).size}</strong></div>
              <div><span className="summary-label">STUDENTS</span><strong>{new Set(records.map((r) => first(r.profiles)?.full_name)).size}</strong></div>
            </div>
            <div className="records-table-wrap">
              {records.length === 0 ? (
                <div className="empty-state"><span>◷</span><h3>No attendance records yet</h3><p>Check-ins appear here the moment a student scans a session QR.</p></div>
              ) : (
                <div className="upcoming-list">
                  {records.map((record, index) => (
                    <div className="upcoming-row" key={index}>
                      <div className="upcoming-copy">
                        <strong>{first(record.profiles)?.full_name || "Unknown student"}</strong>
                        <small>{first(record.attendance_sessions)?.title ?? "Session"} · {first(record.attendance_sessions)?.course ?? ""}</small>
                      </div>
                      <span className="upcoming-time">{new Date(record.scanned_at).toLocaleString("en-NG")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
        {selected && origin && (
          <div
            onClick={() => setSelected(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(12, 24, 19, 0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", zIndex: 50 }}
          >
            <div
              className="content-section"
              onClick={(event) => event.stopPropagation()}
              style={{ maxWidth: "420px", width: "100%", textAlign: "center" }}
            >
              <div className="section-heading"><div><p className="eyebrow">SCAN TO ATTEND</p><h2>{selected.title}</h2><p className="empty-inline">{selected.course}</p></div></div>
              <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", display: "inline-block" }}>
                <QRCode value={`${origin}/attend/${selected.qr_token}`} size={280} />
              </div>
              <p className="empty-inline" style={{ marginTop: "12px" }}>{counts.get(selected.id) ?? 0} checked in · valid until {new Date(selected.closes_at).toLocaleString("en-NG")}</p>
              <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "12px" }}>
                <button className="button button-light" type="button" onClick={() => copyLink(selected.qr_token)}>{copied === selected.qr_token ? "Copied!" : "Copy link"}</button>
                <button className="button button-primary" type="button" onClick={() => setSelected(null)}>Done</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
