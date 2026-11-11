import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth-screen";
import { Dashboard } from "@/components/dashboard";
import { createClient } from "@/lib/supabase/server";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return <AuthScreen />;

  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error) console.error("is_admin check failed:", error.message);

  if (isAdmin === true) redirect("/admin");

  return (
    <Dashboard
      email={user.email ?? ""}
      name={user.user_metadata.full_name}
      role="student"
    />
  );
}
