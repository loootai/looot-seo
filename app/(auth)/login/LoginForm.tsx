"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { browserSupabase } from "@/lib/supabase/client";

type Mode = "signin" | "signup";
type Busy = null | "password" | "link";

function Banner({ title, children, onRetry }: { title: string; children: React.ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-ctl border border-warn/50 bg-warn/[0.07] px-3 py-2.5">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.5} aria-hidden />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-muted">{children}</p>
        {onRetry ? (
          <Button size="sm" className="mt-2" onClick={onRetry}>
            <RotateCw strokeWidth={1.5} /> Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Email and password sign-in, account creation and the emailed link, all through Supabase Auth. */
export function LoginForm({ configured, linkError }: { configured: boolean; linkError: boolean }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState<Busy>(null);
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({});
  const [unreachable, setUnreachable] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);
  const last = React.useRef<Busy>(null);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const redirectTo = () => `${window.location.origin}/auth/callback`;

  const run = async (kind: Exclude<Busy, null>) => {
    last.current = kind;
    const next: typeof errors = {};
    if (!validEmail) next.email = "Enter an email address such as you@example.com.";
    if (kind === "password" && password.length < 8) next.password = mode === "signup" ? "Use at least 8 characters." : "Enter your password. It has at least 8 characters.";
    setErrors(next);
    if (next.email) return emailRef.current?.focus();
    if (next.password) return document.getElementById("password")?.focus();
    setBusy(kind);
    setUnreachable(false);
    try {
      const supabase = browserSupabase();
      if (kind === "link") {
        const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } });
        if (error) throw error;
        setSentTo(email.trim());
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo() } });
        if (error) throw error;
        if (data.session) (router.push("/"), router.refresh());
        else setSentTo(email.trim());
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.push("/");
        router.refresh();
      }
    } catch (e) {
      const err = e as { status?: number; message?: string; name?: string };
      const network = err.name === "AuthRetryableFetchError" || err.status === 0 || err.status === undefined || /fetch|network/i.test(err.message ?? "");
      if (network) setUnreachable(true);
      else if (kind === "password" && mode === "signin") setErrors({ password: "That email and password do not match." });
      else if (err.status === 429) setErrors({ email: "Too many tries. Wait a minute, then try again." });
      else setErrors({ email: err.message ? `${err.message}.`.replace(/\.\.$/, ".") : "That did not work. Check the address and try again." });
    } finally {
      setBusy(null);
    }
  };

  if (sentTo) {
    return (
      <div>
        <MailCheck className="size-6 text-accent-text" strokeWidth={1.5} aria-hidden />
        <h1 className="page-title mt-3">Check your email</h1>
        <p className="mt-1.5 text-muted">
          A sign-in link went to <span className="num break-all text-ink">{sentTo}</span>. Open it on this device. The link works once and expires after an hour.
        </p>
        <Button variant="link" className="mt-4 h-auto px-0" onClick={() => (setSentTo(null), setPassword(""))}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">{mode === "signin" ? "Sign in" : "Create an account"}</h1>
      <p className="mb-6 mt-1 text-muted">{mode === "signin" ? "Your projects, keywords and run history are stored in your own Supabase project." : "One account per person. Each account sees only its own rows."}</p>

      {!configured ? (
        <Banner title="Supabase is not set up yet">
          Set <code className="num text-ink">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="num text-ink">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then restart. The README has the three steps.
        </Banner>
      ) : unreachable ? (
        <Banner title="Supabase did not answer" onRetry={() => last.current && run(last.current)}>
          The sign-in service could not be reached. Check your connection, or that the Supabase project is not paused.
        </Banner>
      ) : linkError ? (
        <Banner title="That link did not work">It was already used or it expired. Ask for a new one below.</Banner>
      ) : null}

      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run("password");
        }}
      >
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input ref={emailRef} id="email" name="email" type="email" inputMode="email" autoComplete="email" spellCheck={false} className="h-10" placeholder="you@example.com…" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email)} disabled={!configured} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password} hint={mode === "signup" ? "At least 8 characters." : undefined}>
          <Input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} className="h-10" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(errors.password)} disabled={!configured} />
        </Field>
        <div className="grid gap-2 pt-1">
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!configured || busy !== null}>
            {busy === "password" ? <Loader2 className="animate-spin" strokeWidth={2} aria-label="Working" /> : null}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          <Button size="lg" className="w-full" disabled={!configured || busy !== null} onClick={() => void run("link")}>
            {busy === "link" ? <Loader2 className="animate-spin" strokeWidth={2} aria-label="Working" /> : null}
            Email me a link
          </Button>
        </div>
      </form>

      <p className="mt-5 text-muted">
        {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
        <Button variant="link" className="h-auto px-0" onClick={() => (setMode(mode === "signin" ? "signup" : "signin"), setErrors({}))}>
          {mode === "signin" ? "Create account" : "Sign in"}
        </Button>
      </p>

      <div className="mt-8 border-t border-rule pt-5">
        <p className="font-medium">Just looking? Run it with demo data</p>
        <p className="mt-0.5 text-muted">No Supabase project, no token, nothing charged.</p>
        <pre className="num mt-2.5 overflow-x-auto rounded-ctl border border-rule bg-surface px-3 py-2 text-[12px]">
          <code>npm run demo</code>
        </pre>
      </div>
    </div>
  );
}
