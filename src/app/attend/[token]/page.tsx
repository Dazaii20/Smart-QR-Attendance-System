import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default function AttendPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<main className="auth-main"><div className="auth-form-wrap"><p>Checking your attendance…</p></div></main>}>
      <AttendGate params={params} />
    </Suspense>
  );
}

async function AttendGate({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data, error } = await supabase.rpc("mark_attendance", { p_qr_token: token });
  const result = Array.isArray(data) ? data[0] : data;

  return (
    <main className="auth-main">
      <div className="auth-form-wrap">
        <p className="eyebrow">ROLLCALL CHECK-IN</p>
        {error ? (
          <>
            <h2>Couldn’t mark attendance</h2>
            <p className="form-error" role="alert">{error.message}</p>
          </>
        ) : (
          <>
            <h2>{result?.already_marked ? "You’re already checked in" : "Attendance recorded"}</h2>
            {result?.attendance_time && (
              <p className="auth-notice" role="status">
                {new Date(result.attendance_time).toLocaleString("en-NG")}
              </p>
            )}
          </>
        )}
        <a className="button button-primary auth-submit" href="/">Go to dashboard</a>
      </div>
    </main>
  );
}
