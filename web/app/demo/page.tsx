import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DemoPageClient } from "@/components/demo/DemoPageClient";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-dvh w-full min-w-0 flex-1 flex-col">
      <DemoPageClient />
    </div>
  );
}
