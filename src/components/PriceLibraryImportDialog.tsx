import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useBulkUpsertPriceItems, usePriceLibrary } from "@/hooks/usePriceLibrary";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportRow {
  item_code: string;
  standard_name_ar: string;
  standard_name_en: string;
  item_name_aliases: string[];
  category: string;
  unit: string;
  base_rate: number;
  status: "new" | "update" | "unchanged";
  existingId?: string;
}

export default function PriceLibraryImportDialog({ open, onOpenChange }: Props) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: existing = [] } = usePriceLibrary();
  const bulkUpsert = useBulkUpsertPriceItems();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<any>(ws);

      const parsed: ImportRow[] = jsonData.map((row: any) => {
        const code = String(row["كود البند"] || row["Code"] || row["item_code"] || "").trim();
        const nameAr = String(row["اسم البند"] || row["Name"] || row["standard_name_ar"] || "").trim();
        const nameEn = String(row["الاسم الإنجليزي"] || row["English Name"] || row["standard_name_en"] || "").trim();
        const aliasesStr = String(row["الأسماء البديلة"] || row["Aliases"] || row["item_name_aliases"] || "");
        const aliases = aliasesStr ? aliasesStr.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
        const cat = String(row["التصنيف"] || row["Category"] || row["category"] || "").trim();
        const unit = String(row["الوحدة"] || row["Unit"] || row["unit"] || "").trim();
        const price = parseFloat(row["السعر"] || row["Price"] || row["base_rate"] || 0);

        // Check if exists by code or name
        const match = existing.find((e: any) =>
          (code && e.item_code === code) ||
          (nameAr && e.standard_name_ar === nameAr)
        );

        let status: ImportRow["status"] = "new";
        if (match) {
          status = Math.abs((match as any).base_rate - price) < 0.01 ? "unchanged" : "update";
        }

        return {
          item_code: code,
          standard_name_ar: nameAr,
          standard_name_en: nameEn,
          item_name_aliases: aliases,
          category: cat,
          unit,
          base_rate: price,
          status,
          existingId: match?.id,
        };
      }).filter((r: ImportRow) => r.standard_name_ar);

      setRows(parsed);
    };
    reader.readAsBinaryString(file);
  };

  const handleConfirm = () => {
    const items = rows.filter(r => r.status !== "unchanged").map(r => ({
      id: r.existingId,
      standard_name_ar: r.standard_name_ar,
      standard_name_en: r.standard_name_en,
      category: r.category || "عام",
      unit: r.unit,
      base_rate: r.base_rate,
      min_rate: +(r.base_rate * 0.9).toFixed(2),
      max_rate: +(r.base_rate * 1.1).toFixed(2),
      item_code: r.item_code,
      item_name_aliases: r.item_name_aliases,
      isUpdate: r.status === "update",
    }));

    bulkUpsert.mutate(items, {
      onSuccess: (result) => {
        toast.success(`تم استيراد ${result.inserted} بند جديد و تحديث ${result.updated} بند`);
        setRows([]);
        setFileName("");
        onOpenChange(false);
      },
      onError: () => toast.error("فشل في الاستيراد"),
    });
  };

  const newCount = rows.filter(r => r.status === "new").length;
  const updateCount = rows.filter(r => r.status === "update").length;
  const unchangedCount = rows.filter(r => r.status === "unchanged").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" /> رفع ملف الأسعار
          </DialogTitle>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <FileSpreadsheet className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4">اختر ملف Excel (.xlsx)</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>اختيار ملف</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm font-medium">{fileName}</span>
              <Badge variant="default" className="bg-emerald-500">{newCount} جديد</Badge>
              <Badge variant="secondary" className="bg-amber-500 text-white">{updateCount} تحديث</Badge>
              <Badge variant="outline">{unchangedCount} بدون تغيير</Badge>
            </div>

            <div className="overflow-auto flex-1 border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-right">الحالة</th>
                    <th className="p-2 text-right">الكود</th>
                    <th className="p-2 text-right">اسم البند</th>
                    <th className="p-2 text-right">التصنيف</th>
                    <th className="p-2 text-right">الوحدة</th>
                    <th className="p-2 text-right">السعر</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={
                      r.status === "new" ? "bg-emerald-50 dark:bg-emerald-950/20" :
                      r.status === "update" ? "bg-amber-50 dark:bg-amber-950/20" : ""
                    }>
                      <td className="p-2">
                        {r.status === "new" && <Badge variant="default" className="bg-emerald-500 text-xs">جديد</Badge>}
                        {r.status === "update" && <Badge variant="secondary" className="bg-amber-500 text-white text-xs">تحديث</Badge>}
                        {r.status === "unchanged" && <Badge variant="outline" className="text-xs">—</Badge>}
                      </td>
                      <td className="p-2 font-mono text-xs">{r.item_code}</td>
                      <td className="p-2" dir="rtl">{r.standard_name_ar}</td>
                      <td className="p-2 text-xs">{r.category}</td>
                      <td className="p-2 text-xs">{r.unit}</td>
                      <td className="p-2 font-mono text-xs">{r.base_rate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => { setRows([]); setFileName(""); onOpenChange(false); }}>إلغاء</Button>
          {rows.length > 0 && (
            <Button onClick={handleConfirm} disabled={bulkUpsert.isPending || (newCount + updateCount === 0)} className="gap-2">
              <Check className="w-4 h-4" /> حفظ ({newCount + updateCount} بند)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
