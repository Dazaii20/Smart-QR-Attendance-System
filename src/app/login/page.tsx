import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth-screen";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

type SearchParams = Promise<{ next?: string | string[] }>;

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <LoginGate searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginGate({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const { next } = await searchParams;
  const target = safeNext(Array.isArray(next) ? next[0] : next);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect(target);

  return <AuthScreen next={target} />;
}
