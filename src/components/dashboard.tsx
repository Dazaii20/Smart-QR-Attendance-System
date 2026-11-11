"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { QrScanner } from "@/components/qr-scanner";
import { CheckInConfirm } from "@/components/check-in-confirm";

type Props = { email: string; name?: string; role?: "student" | "admin" };

type MySession = {
  session_id: string;
  title: string;
  course: string;
  starts_at: string;
  closes_at: string;
  status: "open" | "scheduled" | "closed" | "ended";
  attended_at: string | null;
};

type Stats = {
  attended: MySession[];
  missed: MySession[];
  upcoming: MySession[];
  history: MySession[];
  rate: number;
  nextUp: MySession | null;
};

const STATUS_LABEL: Record<MySession["status"], string> = {
  open: "Open now",
  scheduled: "Scheduled",
  closed: "Closed",
  ended: "Ended",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function buildStats(sessions: MySession[]): Stats {
  const attended = sessions
    .filter((s) => s.attended_at)
    .sort((a, b) => new Date(b.attended_at!).getTime() - new Date(a.attended_at!).getTime());
  const missed = sessions.filter((s) => !s.attended_at && (s.status === "closed" || s.status === "ended"));
  const upcoming = sessions
    .filter((s) => !s.attended_at && (s.status === "open" || s.status === "scheduled"))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const history = sessions.filter((s) => s.attended_at || s.status === "closed" || s.status === "ended");
  const counted = attended.length + missed.length;
  return {
    attended,
    missed,
    upcoming,
    history,
    rate: counted ? Math.round((attended.length / counted) * 100) : 0,
    nextUp: upcoming.find((s) => s.status === "open") ?? upcoming[0] ?? null,
  };
}

export function Dashboard({ email, name, role = "student" }: Props) {
  const [view, setView] = useState<"overview" | "scan" | "history">("overview");
  const [sessions, setSessions] = useState<MySession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [admittedId, setAdmittedId] = useState<string | null>(null);
  const firstName = name?.split(" ")[0] || email.split("@")[0];
  const date = useMemo(() => new Intl.DateTimeFormat("en-NG", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date()).toUpperCase(), []);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("my_sessions");
    if (error) console.error("my_sessions failed:", error.message);
    setSessions((data as MySession[] | null) ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    const checkedIn = new URLSearchParams(window.location.search).get("checked_in");
    if (checkedIn) {
      setAdmittedId(checkedIn);
      window.history.replaceState(null, "", "/");
    }
    load();
  }, [load]);

  const stats = useMemo(() => buildStats(sessions), [sessions]);
  const admitted = sessions.find((s) => s.session_id === admittedId && s.attended_at) ?? null;

  const handleCheckedIn = useCallback((sessionId: string) => {
    setAdmittedId(sessionId);
    setView("overview");
    load();
  }, [load]);

  async function signOut() {
    await createClient().auth.signOut();
    window.location.assign("/");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/"><span className="brand-mark">r.</span><span>rollcall</span></a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className={`nav-link ${view === "overview" ? "active" : ""}`} onClick={() => setView("overview")}><span className="nav-icon">◫</span>Overview</button>
          <button className={`nav-link ${view === "scan" ? "active" : ""}`} onClick={() => setView("scan")}><span className="nav-icon">▦</span>Mark attendance</button>
          <button className={`nav-link ${view === "history" ? "active" : ""}`} onClick={() => setView("history")}><span className="nav-icon">◷</span>Attendance history</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="security-note"><span className="security-icon">QR</span><div><strong>One scan per session</strong><small>Codes expire automatically</small></div></div>
          <div className="profile-button"><span className="avatar">{firstName.slice(0, 1).toUpperCase()}</span><span className="profile-copy"><strong>{name || firstName}</strong><small>{email}</small></span></div>
          <button className="signout-button" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div><p className="topbar-kicker">{date}</p><p className="topbar-location">Lagos, Nigeria <span className="location-dot" /> Secure workspace</p></div><span className="role-chip">{role.toUpperCase()}</span></header>
        {view === "overview" && (
          <Overview
            firstName={firstName}
            stats={stats}
            loaded={loaded}
            admitted={admitted}
            onDismiss={() => setAdmittedId(null)}
            onScan={() => setView("scan")}
          />
        )}
        {view === "scan" && <Scan onCheckedIn={handleCheckedIn} />}
        {view === "history" && <History stats={stats} loaded={loaded} />}
      </main>
    </div>
  );
}

function Overview({ firstName, stats, loaded, admitted, onDismiss, onScan }: {
  firstName: string;
  stats: Stats;
  loaded: boolean;
  admitted: MySession | null;
  onDismiss: () => void;
  onScan: () => void;
}) {
  const next = stats.nextUp;
  return (
    <section className="view active">
      <div className="page-heading"><div><p className="eyebrow">YOUR CAMPUS, IN SYNC</p><h1>Good morning, <span>{firstName}.</span></h1><p className="page-subtitle">Here’s the shape of your attendance this semester.</p></div></div>
      {admitted?.attended_at && (
        <div className="content-section" role="status" style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", borderLeft: "4px solid #1f6b4f" }}>
          <div>
            <p className="eyebrow">CHECKED IN</p>
            <h2 style={{ margin: 0 }}>You’ve been admitted into {admitted.title}</h2>
            <p className="empty-inline" style={{ margin: 0 }}>{admitted.course} · {formatDateTime(admitted.attended_at)}</p>
          </div>
          <button className="button button-light" type="button" onClick={onDismiss}>Dismiss</button>
        </div>
      )}
      <div className="welcome-strip">
        <div>
          <span className="strip-tag">{next?.status === "open" ? "OPEN NOW" : "NEXT UP"}</span>
          <h2>{next ? next.title : loaded ? "No open sessions right now" : "Loading sessions…"}</h2>
          <p>
            {next
              ? `${next.course} · ${next.status === "open" ? `closes ${formatDateTime(next.closes_at)}` : `starts ${formatDateTime(next.starts_at)}`}`
              : "New sessions from your lecturer will appear here."}
          </p>
        </div>
        <button className="button button-light" type="button" onClick={onScan}>Scan to attend →</button>
        <div className="strip-decoration" aria-hidden="true">{String(stats.upcoming.length).padStart(2, "0")}</div>
      </div>
      <div className="metrics-grid">
        <Metric label="ATTENDANCE RATE" value={`${stats.rate}%`} green />
        <Metric label="DAYS ATTENDED" value={String(stats.attended.length)} />
        <Metric label="DAYS MISSED" value={String(stats.missed.length)} />
        <Metric label="UPCOMING" value={String(stats.upcoming.length)} />
      </div>
      <div className="content-grid">
        <section className="content-section">
          <div className="section-heading"><div><p className="eyebrow">THE LATEST</p><h2>Recent activity</h2></div></div>
          {stats.attended.length === 0 ? (
            <p className="empty-inline">No activity yet. Your check-ins will appear here.</p>
          ) : (
            <div className="upcoming-list">
              {stats.attended.slice(0, 5).map((session) => (
                <div className="upcoming-row" key={session.session_id}>
                  <div className="upcoming-copy"><strong>{session.title}</strong><small>{session.course} · Admitted</small></div>
                  <span className="upcoming-time">{formatDateTime(session.attended_at!)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <aside className="content-section side-section">
          <div className="section-heading"><div><p className="eyebrow">ON THE RADAR</p><h2>Sessions</h2></div></div>
          {stats.upcoming.length === 0 ? (
            <p className="empty-inline">{loaded ? "No upcoming sessions." : "Loading…"}</p>
          ) : (
            <div className="upcoming-list">
              {stats.upcoming.map((session) => (
                <div className="upcoming-row" key={session.session_id}>
                  <div className="upcoming-copy"><strong>{session.title}</strong><small>{session.course}</small></div>
                  <span className="upcoming-time">{STATUS_LABEL[session.status]}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function Metric({ label, value, green = false }: { label: string; value: string; green?: boolean }) { return <article className={`metric-panel ${green ? "metric-green" : ""}`}><div className="metric-top"><span>{label}</span><span className="metric-mark">↗</span></div><div className="metric-number">{value}</div><div className="metric-caption">Synced securely</div></article>; }

function Scan({ onCheckedIn }: { onCheckedIn: (sessionId: string) => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [scannerKey, setScannerKey] = useState(0);

  const scanAgain = useCallback(() => {
    setToken(null);
    setScannerKey((key) => key + 1);
  }, []);

  return (
    <section className="view active">
      <div className="page-heading"><div><p className="eyebrow">QUICK CHECK-IN</p><h1>Mark attendance</h1><p className="page-subtitle">Point your camera at the session QR code shown by your lecturer.</p></div></div>
      <div className="scan-layout">
        <section className="scan-panel">
          <div className="scan-panel-head"><span className="scan-number">01</span><div><h2>Scan a session QR</h2><p>Only open session codes can be used.</p></div></div>
          {token ? (
            <div className="scanner-frame"><div className="scanner-placeholder"><div className="scan-corners"><i /><i /><i /><i /><span>▦</span></div><p>QR code detected</p></div></div>
          ) : (
            <QrScanner key={scannerKey} onToken={setToken} />
          )}
        </section>
        <aside className="scan-help"><div className="help-index">02 / ATTENDANCE</div><h2>Right place.<br /><em>Right time.</em></h2><p>Allow camera access when prompted, then confirm the session. Each session can only be marked once.</p></aside>
      </div>
      {token && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(12, 24, 19, 0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", zIndex: 50 }}>
          <CheckInConfirm token={token} cancelLabel="Scan again" onCancel={scanAgain} onDone={onCheckedIn} />
        </div>
      )}
    </section>
  );
}

function History({ stats, loaded }: { stats: Stats; loaded: boolean }) {
  return (
    <section className="view active">
      <div className="page-heading"><div><p className="eyebrow">YOUR RECORD</p><h1>Attendance history</h1><p className="page-subtitle">Every session, clearly accounted for.</p></div></div>
      <div className="history-summary">
        <div><span className="summary-label">TOTAL SESSIONS</span><strong>{stats.history.length}</strong></div>
        <div><span className="summary-label">ATTENDED</span><strong>{stats.attended.length}</strong></div>
        <div><span className="summary-label">MISSED</span><strong>{stats.missed.length}</strong></div>
        <div className="history-summary-note">Attendance rate: {stats.rate}%</div>
      </div>
      <div className="records-table-wrap">
        {stats.history.length === 0 ? (
          <div className="empty-state"><span>◷</span><h3>{loaded ? "No attendance records yet" : "Loading…"}</h3><p>Your check-ins will appear here after you scan a session QR.</p></div>
        ) : (
          <div className="upcoming-list">
            {stats.history.map((session) => (
              <div className="upcoming-row" key={session.session_id}>
                <div className="upcoming-copy">
                  <strong>{session.title}</strong>
                  <small>{session.course} · {session.attended_at ? "Attended" : "Missed"}</small>
                </div>
                <span className="upcoming-time">{session.attended_at ? formatDateTime(session.attended_at) : formatDateTime(session.closes_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
