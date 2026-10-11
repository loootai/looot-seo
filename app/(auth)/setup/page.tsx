import type { Metadata } from "next";

export const metadata: Metadata = { title: "Set the allow-list" };
export const dynamic = "force-dynamic";

/** Shown while no owner allow-list is set. Nobody gets data, settings or spending until the operator sets one. */
export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[560px] flex-col justify-center px-6 py-10">
      <h1 className="text-[20px] font-semibold leading-7">Set who may use this workspace</h1>
      <p className="mt-2 text-muted">This server has no owner allow-list, so it refuses every request that reads data, changes settings or spends. Nobody becomes the admin by signing in first.</p>
      <p className="mt-4">Set one or both of these on the server, then restart it:</p>
      <pre className="mt-2 overflow-x-auto rounded-ctl border border-rule bg-surface p-3 text-[13px]">{`LOOOT_SEO_ALLOWED_EMAILS=you@example.com
LOOOT_SEO_ALLOWED_DOMAINS=example.com`}</pre>
      <p className="mt-4 text-muted">Emails are comma separated and match exactly, ignoring case. Domains match the part after the @ exactly. In Supabase, turn off public sign-ups too if only you should have an account.</p>
    </main>
  );
}
