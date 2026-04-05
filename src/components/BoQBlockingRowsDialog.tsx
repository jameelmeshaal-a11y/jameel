import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { BoQExportWarningRow, BoQExportBlockingRow } from "@/lib/boqRowClassification";

interface BoQBlockingRowsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: (BoQExportWarningRow | BoQExportBlockingRow)[];
  onRevalidate: () => void;
  revalidating?: boolean;
}

export default function BoQBlockingRowsDialog({
  open,
  onOpenChange,
  rows,
  onRevalidate,
  revalidating = false,
}: BoQBlockingRowsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>صفوف تحتاج مراجعة — Rows with Warnings</DialogTitle>
          <DialogDescription>
            These rows were priced but need review due to missing or incomplete data.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {rows.map((row, index) => (
            <div key={`${row.rowNumber ?? "row"}-${row.itemCode}-${index}`} className="rounded-lg border border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20 p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
                <span>Row: {row.rowNumber ?? "—"}</span>
                <span>Item: {row.itemCode || "—"}</span>
              </div>
              <div className="mt-1 text-sm">{row.description || "—"}</div>
              <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">Warning: {row.reason}</div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onRevalidate} disabled={revalidating}>
            {revalidating ? "Revalidating..." : "Revalidate Project"}
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
