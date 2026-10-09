import Link from "next/link";
import { Region } from "@/components/shell/PageHead";
import { EmptyState } from "@/components/tables/parts";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Region className="mt-6">
      <EmptyState
        title="This page does not exist"
        actions={
          <Button asChild variant="primary">
            <Link href="/">Go to projects</Link>
          </Button>
        }
      >
        <p>The project or keyword in the address was not found for your account. It may have been deleted, or the link belongs to someone else.</p>
      </EmptyState>
    </Region>
  );
}
