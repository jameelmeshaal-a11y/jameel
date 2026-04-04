import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { BoQExportBlockingRow } from "@/lib/boqRowClassification";

interface BoQBlockingRowsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: BoQExportBlockingRow[];
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
          <DialogTitle>Blocking rows</DialogTitle>
          <DialogDescription>
            These are the only rows currently preventing export.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {rows.map((row, index) => (
            <div key={`${row.rowNumber ?? "row"}-${row.itemCode}-${index}`} className="rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
                <span>Row: {row.rowNumber ?? "—"}</span>
                <span>Item: {row.itemCode || "—"}</span>
              </div>
              <div className="mt-1 text-sm">{row.description || "—"}</div>
              <div className="mt-2 text-xs text-muted-foreground">Reason: {row.reason}</div>
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