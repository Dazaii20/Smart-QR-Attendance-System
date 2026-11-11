import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { createClient } from "@/lib/supabase/server";

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminGate />
    </Suspense>
  );
}

async function AdminGate() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error) console.error("is_admin check failed:", error.message);

  if (isAdmin !== true) redirect("/");

  return (
    <AdminDashboard
      email={user.email ?? ""}
      name={user.user_metadata?.full_name}
      baseUrl={process.env.BASE_URL?.trim().replace(/\/+$/, "")}
    />
  );
}
