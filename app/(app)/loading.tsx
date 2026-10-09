import { Region } from "@/components/shell/PageHead";
import { TableSkeleton } from "@/components/tables/parts";
import { Skeleton } from "@/components/ui/controls";

export default function Loading() {
  return (
    <>
      <div className="px-4 pb-4 pt-5 md:px-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2.5 w-80 max-w-full" />
      </div>
      <Region>
        <TableSkeleton rows={10} widths={["2fr", 90, 90, 120, 110]} />
      </Region>
    </>
  );
}
