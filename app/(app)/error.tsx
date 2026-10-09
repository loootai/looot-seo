"use client";

import { Region } from "@/components/shell/PageHead";
import { ErrorPanel } from "@/components/tables/parts";

export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Region className="mt-6">
      <ErrorPanel title="This screen could not be loaded" code={error.digest ?? "screen_failed"} detail="The data for this screen did not load. Nothing was charged." onRetry={reset} />
    </Region>
  );
}
