"use client";

import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { QrScanner } from "@/components/qr-scanner";

type Props = { email: string; name?: string; role?: "student" | "admin" };

const sessions = [
  { title: "SIWES project briefing", course: "Industrial Training · 300L", time: "09:30", status: "Open" },
  { title: "Industry mentor check-in", course: "Industrial Training · 300L", time: "Tomorrow", status: "Scheduled" },
];

export function Dashboard({ email, name, role = "student" }: Props) {
  const [view, setView] = useState<"overview" | "scan" | "history">("overview");
  const firstName = name?.split(" ")[0] || email.split("@")[0];
  const date = useMemo(() => new Intl.DateTimeFormat("en-NG", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date()).toUpperCase(), []);

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
          <div className="security-note"><span className="security-icon">12h</span><div><strong>Session QR window</strong><small>Codes expire automatically</small></div></div>
          <div className="profile-button"><span className="avatar">{firstName.slice(0, 1).toUpperCase()}</span><span className="profile-copy"><strong>{name || firstName}</strong><small>{email}</small></span></div>
          <button className="signout-button" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div><p className="topbar-kicker">{date}</p><p className="topbar-location">Lagos, Nigeria <span className="location-dot" /> Secure workspace</p></div><span className="role-chip">{role.toUpperCase()}</span></header>
        {view === "overview" && <Overview firstName={firstName} onScan={() => setView("scan")} />}
        {view === "scan" && <Scan />}
        {view === "history" && <History />}
      </main>
    </div>
  );
}

function Overview({ firstName, onScan }: { firstName: string; onScan: () => void }) {
  return <section className="view active"><div className="page-heading"><div><p className="eyebrow">YOUR CAMPUS, IN SYNC</p><h1>Good morning, <span>{firstName}.</span></h1><p className="page-subtitle">Here’s the shape of your attendance this semester.</p></div></div><div className="welcome-strip"><div><span className="strip-tag">NEXT UP</span><h2>SIWES project briefing</h2><p>Industrial Training · 300L · Today at 09:30</p></div><button className="button button-light" type="button" onClick={onScan}>Scan to attend →</button><div className="strip-decoration" aria-hidden="true">01</div></div><div className="metrics-grid"><Metric label="ATTENDANCE RATE" value="0%" green /><Metric label="DAYS ATTENDED" value="0" /><Metric label="DAYS MISSED" value="0" /><Metric label="UPCOMING" value="2" /></div><div className="content-grid"><section className="content-section"><div className="section-heading"><div><p className="eyebrow">THE LATEST</p><h2>Recent activity</h2></div></div><p className="empty-inline">No activity yet. Your check-ins will appear here.</p></section><aside className="content-section side-section"><div className="section-heading"><div><p className="eyebrow">ON THE RADAR</p><h2>Sessions</h2></div></div><div className="upcoming-list">{sessions.map(session => <div className="upcoming-row" key={session.title}><div className="upcoming-copy"><strong>{session.title}</strong><small>{session.course}</small></div><span className="upcoming-time">{session.time}</span></div>)}</div></aside></div></section>;
}

function Metric({ label, value, green = false }: { label: string; value: string; green?: boolean }) { return <article className={`metric-panel ${green ? "metric-green" : ""}`}><div className="metric-top"><span>{label}</span><span className="metric-mark">↗</span></div><div className="metric-number">{value}</div><div className="metric-caption">Synced securely</div></article>; }
function Scan() {
  const handleToken = useCallback((token: string) => {
    window.location.assign(`/attend/${encodeURIComponent(token)}`);
  }, []);

  return <section className="view active"><div className="page-heading"><div><p className="eyebrow">QUICK CHECK-IN</p><h1>Mark attendance</h1><p className="page-subtitle">Point your camera at the session QR code shown by your lecturer.</p></div></div><div className="scan-layout"><section className="scan-panel"><div className="scan-panel-head"><span className="scan-number">01</span><div><h2>Scan a session QR</h2><p>Only open session codes can be used.</p></div></div><QrScanner onToken={handleToken} /></section><aside className="scan-help"><div className="help-index">02 / ATTENDANCE</div><h2>Right place.<br /><em>Right time.</em></h2><p>Allow camera access when prompted. Your attendance is recorded the moment the code is read.</p></aside></div></section>;
}
function History() { return <section className="view active"><div className="page-heading"><div><p className="eyebrow">YOUR RECORD</p><h1>Attendance history</h1><p className="page-subtitle">Every session, clearly accounted for.</p></div></div><div className="history-summary"><div><span className="summary-label">TOTAL SESSIONS</span><strong>0</strong></div><div><span className="summary-label">ATTENDED</span><strong>0</strong></div><div><span className="summary-label">MISSED</span><strong>0</strong></div><div className="history-summary-note">Attendance records will be stored in your Supabase database.</div></div><div className="records-table-wrap"><div className="empty-state"><span>◷</span><h3>No attendance records yet</h3><p>Your Supabase-backed check-ins will appear here.</p></div></div></section>; }
