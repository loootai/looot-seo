import type { Metadata } from "next";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not authorised" };
export const dynamic = "force-dynamic";

/** Shown to a signed-in user who is not on the allow-list. */
export default function NotAuthorisedPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[560px] flex-col justify-center px-6 py-10">
      <h1 className="text-[20px] font-semibold leading-7">Not authorised for this workspace</h1>
      <p className="mt-2 text-muted">You are signed in, but this address is not on the list the operator set. Nothing here is available to you. Ask the operator to add your email, or sign in with another account.</p>
      <form action={signOut} className="mt-5">
        <Button type="submit">Sign out</Button>
      </form>
    </main>
  );
}
