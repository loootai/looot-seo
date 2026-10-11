import { redirect } from "next/navigation";
import { currentAccess } from "@/lib/auth/guard";
import { AppShell } from "@/components/shell/AppShell";
import { Providers } from "@/components/shell/Providers";
import { getStore } from "@/lib/data";
import { IS_DEMO } from "@/lib/env";
import type { BudgetStatus } from "@/lib/looot/budget";
import { hasLoootToken, readBalance } from "@/lib/looot/server";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const access = await currentAccess();
  if (access.state === "setup") redirect("/setup");
  if (access.state === "denied") redirect("/not-authorised");
  if (access.state === "signed_out") redirect("/login");
  let projects: Project[] = [];
  let email: string | null = null;
  let budget: BudgetStatus | null = null;
  try {
    const store = await getStore();
    [projects, email, budget] = await Promise.all([store.listProjects(), store.userEmail(), store.budgetStatus(new Date()).catch(() => null)]);
  } catch (e) {
    // The page below shows its own error panel; the shell still renders.
    console.error("looot-seo: shell data failed", e);
  }
  const balance = IS_DEMO ? null : await readBalance();
  return (
    <Providers demo={IS_DEMO}>
      <AppShell projects={projects} demo={IS_DEMO} hasToken={!IS_DEMO && hasLoootToken()} balanceMicros={balance?.availableMicros ?? null} budget={budget} email={email}>
        {children}
      </AppShell>
    </Providers>
  );
}
