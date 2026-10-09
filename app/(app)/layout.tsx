import { AppShell } from "@/components/shell/AppShell";
import { Providers } from "@/components/shell/Providers";
import { getStore } from "@/lib/data";
import { IS_DEMO } from "@/lib/env";
import { hasLoootToken, readBalance } from "@/lib/looot/server";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let projects: Project[] = [];
  let email: string | null = null;
  try {
    const store = await getStore();
    [projects, email] = await Promise.all([store.listProjects(), store.userEmail()]);
  } catch (e) {
    // The page below shows its own error panel; the shell still renders.
    console.error("looot-seo: shell data failed", e);
  }
  const balance = IS_DEMO ? null : await readBalance();
  return (
    <Providers demo={IS_DEMO}>
      <AppShell projects={projects} demo={IS_DEMO} hasToken={!IS_DEMO && hasLoootToken()} balanceMicros={balance?.availableMicros ?? null} email={email}>
        {children}
      </AppShell>
    </Providers>
  );
}
