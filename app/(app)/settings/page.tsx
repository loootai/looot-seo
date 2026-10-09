import type { Metadata } from "next";
import { SettingsScreen } from "./SettingsScreen";
import { getStore } from "@/lib/data";
import { IS_DEMO } from "@/lib/env";
import { OP, fallbackPrice } from "@/lib/looot/catalog";
import { TOKEN_ENV, hasLoootToken } from "@/lib/looot/server";
import type { UserDefaults } from "@/lib/types";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const store = await getStore();
  let email: string | null = null;
  let defaults: UserDefaults = { depth: 30, country: "US", language: "en", serp_operation: OP.serper };
  let failed = false;
  try {
    [email, defaults] = await Promise.all([store.userEmail(), store.getDefaults()]);
  } catch (e) {
    console.error("looot-seo: settings failed", e);
    failed = true;
  }
  return <SettingsScreen email={email} defaults={defaults} demo={IS_DEMO} hasToken={!IS_DEMO && hasLoootToken()} tokenEnv={TOKEN_ENV} failed={failed} serpPrices={{ [OP.serper]: fallbackPrice(OP.serper), [OP.anyapi]: fallbackPrice(OP.anyapi) }} />;
}
