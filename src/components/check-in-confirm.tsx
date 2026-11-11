"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SessionInfo = {
  session_id: string;
  title: string;
  course: string;
  starts_at: string;
  closes_at: string;
  is_open: boolean;
  already_marked: boolean;
  marked_at: string | null;
};

type MarkResult = {
  attendance_session_id: string;
  attendance_time: string;
  already_marked: boolean;
};

type Props = {
  token: string;
  onCancel: () => void;
  onDone: (sessionId: string) => void;
  cancelLabel?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

export function CheckInConfirm({ token, onCancel, onDone, cancelLabel = "Cancel" }: Props) {
  const validToken = UUID.test(token);
  const [state, setState] = useState<"loading" | "ready" | "submitting" | "done" | "error">(validToken ? "loading" : "error");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [message, setMessage] = useState(validToken ? "" : "This QR code isn’t a Rollcall session code.");
  const [markedAt, setMarkedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!validToken) return;
    let active = true;
    createClient()
      .rpc("session_for_token", { p_qr_token: token })
      .then(({ data, error }) => {
        if (!active) return;
        const row = (Array.isArray(data) ? data[0] : data) as SessionInfo | undefined;
        if (error || !row) {
          setState("error");
          setMessage(error?.message ?? "This QR code doesn’t match any session.");
          return;
        }
        setSession(row);
        if (row.already_marked) {
          setState("error");
          setMessage(`You were already admitted into this session${row.marked_at ? ` on ${formatDateTime(row.marked_at)}` : ""}. Attendance can only be marked once.`);
          return;
        }
        if (!row.is_open) {
          setState("error");
          setMessage("This session is not open for check-in. It may have ended or not started yet.");
          return;
        }
        setState("ready");
      });
    return () => {
      active = false;
    };
  }, [token, validToken]);

  async function confirm() {
    setState("submitting");
    const { data, error } = await createClient().rpc("mark_attendance", { p_qr_token: token });
    const row = (Array.isArray(data) ? data[0] : data) as MarkResult | undefined;
    if (error || !row) {
      setState("error");
      setMessage(error?.message ?? "Attendance could not be recorded. Please try again.");
      return;
    }
    if (row.already_marked) {
      setState("error");
      setMessage(`You were already admitted into this session on ${formatDateTime(row.attendance_time)}. Attendance can only be marked once.`);
      return;
    }
    setMarkedAt(row.attendance_time);
    setState("done");
  }

  return (
    <div className="content-section" style={{ maxWidth: "440px", width: "100%", textAlign: "center" }} role="dialog" aria-modal="true" aria-labelledby="check-in-title">
      <p className="eyebrow">{state === "done" ? "CHECKED IN" : "CONFIRM ATTENDANCE"}</p>
      <h2 id="check-in-title">
        {state === "loading" && "Looking up session…"}
        {(state === "ready" || state === "submitting") && session?.title}
        {state === "done" && `You’ve been admitted into ${session?.title ?? "the session"}`}
        {state === "error" && (session?.already_marked ? "Already admitted" : "Can’t check in")}
      </h2>
      {session && state !== "error" && (
        <p className="empty-inline">
          {session.course} · closes {formatDateTime(session.closes_at)}
        </p>
      )}
      {state === "ready" && <p className="page-subtitle">Confirm that you are present for this session. This can only be done once.</p>}
      {state === "done" && markedAt && <p className="auth-notice" role="status">Recorded at {formatDateTime(markedAt)}</p>}
      {state === "error" && <p className="form-error" role="alert">{message}</p>}
      <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "16px", flexWrap: "wrap" }}>
        {state === "done" && session ? (
          <button className="button button-primary" type="button" onClick={() => onDone(session.session_id)}>Continue to dashboard</button>
        ) : (
          <>
            <button className="button button-light" type="button" onClick={onCancel} disabled={state === "submitting"}>{cancelLabel}</button>
            {(state === "ready" || state === "submitting") && (
              <button className="button button-primary" type="button" onClick={confirm} disabled={state === "submitting"}>
                {state === "submitting" ? "Marking…" : "Confirm attendance"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function AttendCheckIn({ token }: { token: string }) {
  return (
    <CheckInConfirm
      token={token}
      cancelLabel="Back to dashboard"
      onCancel={() => window.location.assign("/")}
      onDone={(sessionId) => window.location.assign(`/?checked_in=${encodeURIComponent(sessionId)}`)}
    />
  );
}
