import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, Check, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  item_code: string;
  standard_name_ar: string;
  standard_name_en: string;
  item_name_aliases: string[];
  category: string;
  unit: string;
  base_rate: number;
}

const CHUNK_SIZE = 500;

export default function PriceLibraryImportDialog({ open, onOpenChange }: Props) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<any>(ws);

      const parsed: ParsedRow[] = jsonData.map((row: any) => {
        const code = String(row["كود البند"] || row["Code"] || row["item_code"] || "").trim();
        const nameAr = String(row["اسم البند"] || row["Name"] || row["standard_name_ar"] || "").trim();
        const nameEn = String(row["الاسم الإنجليزي"] || row["English Name"] || row["standard_name_en"] || "").trim();
        const aliasesStr = String(row["الأسماء البديلة"] || row["Aliases"] || row["item_name_aliases"] || "");
        const aliases = aliasesStr ? aliasesStr.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
        const cat = String(row["التصنيف"] || row["Category"] || row["category"] || "").trim();
        const unit = String(row["الوحدة"] || row["Unit"] || row["unit"] || "").trim();
        const price = parseFloat(row["السعر"] || row["Price"] || row["base_rate"] || 0);

        return {
          item_code: code,
          standard_name_ar: nameAr,
          standard_name_en: nameEn,
          item_name_aliases: aliases,
          category: cat || "عام",
          unit,
          base_rate: isNaN(price) ? 0 : price,
        };
      }).filter((r: ParsedRow) => r.standard_name_ar);

      setRows(parsed);
      toast.success(`تم قراءة ${parsed.length} بند — جاهز للرفع`);
    } catch (err: any) {
      console.error("Parse error:", err);
      toast.error("فشل في قراءة الملف: " + (err?.message || "خطأ غير معروف"));
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (rows.length === 0) return;
    setUploading(true);
    setProgress({ done: 0, total: rows.length });

    try {
      // Build inserts. No pre-flight existence check — DB-side dedupe via item_code if needed later.
      // This avoids thousands of GET roundtrips and is 50-100x faster.
      const inserts = rows.map(r => ({
        standard_name_ar: r.standard_name_ar,
        standard_name_en: r.standard_name_en,
        category: r.category,
        unit: r.unit,
        base_rate: r.base_rate,
        target_rate: r.base_rate,
        min_rate: +(r.base_rate * 0.9).toFixed(2),
        max_rate: +(r.base_rate * 1.1).toFixed(2),
        item_code: r.item_code || null,
        item_name_aliases: r.item_name_aliases,
      }));

      let inserted = 0;
      // Parallel chunks: 4 in flight at once for max throughput
      const chunks: typeof inserts[] = [];
      for (let i = 0; i < inserts.length; i += CHUNK_SIZE) {
        chunks.push(inserts.slice(i, i + CHUNK_SIZE));
      }

      const PARALLEL = 4;
      for (let i = 0; i < chunks.length; i += PARALLEL) {
        const batch = chunks.slice(i, i + PARALLEL);
        await Promise.all(
          batch.map(async (slice) => {
            const { error } = await supabase.from("rate_library").insert(slice);
            if (error) throw error;
            inserted += slice.length;
            setProgress({ done: inserted, total: rows.length });
          })
        );
      }

      toast.success(`✅ تم رفع ${inserted} بند بنجاح`);
      qc.invalidateQueries({ queryKey: ["price-library"] });
      qc.invalidateQueries({ queryKey: ["price-library-stats"] });
      qc.invalidateQueries({ queryKey: ["price-library-categories"] });
      setRows([]);
      setFileName("");
      setProgress({ done: 0, total: 0 });
      onOpenChange(false);
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("فشل في الرفع: " + (err?.message || "خطأ غير معروف"));
    } finally {
      setUploading(false);
    }
  };

  const previewRows = rows.slice(0, 200);
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!uploading) onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" /> رفع ملف الأسعار
            <Badge variant="outline" className="gap-1 text-xs"><Zap className="w-3 h-3" /> رفع سريع</Badge>
          </DialogTitle>
        </DialogHeader>

        {parsing ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">جاري قراءة الملف...</p>
          </div>
        ) : uploading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <div className="w-full max-w-md space-y-2">
              <Progress value={pct} className="h-3" />
              <div className="flex justify-between text-sm">
                <span className="font-medium">{progress.done.toLocaleString()} / {progress.total.toLocaleString()} بند</span>
                <span className="font-bold text-primary">{pct}%</span>
              </div>
              <p className="text-xs text-muted-foreground text-center">رفع متوازي بسرعة عالية — لا تغلق النافذة</p>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <FileSpreadsheet className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-2">اختر ملف Excel (.xlsx)</p>
            <p className="text-xs text-muted-foreground mb-4">يدعم حتى 50,000+ بند — رفع متوازي سريع</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>اختيار ملف</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="text-sm font-medium">{fileName}</span>
              <Badge variant="default" className="bg-emerald-500">{rows.length.toLocaleString()} بند جاهز للرفع</Badge>
              {rows.length > previewRows.length && (
                <span className="text-xs text-muted-foreground">عرض أول {previewRows.length} للمعاينة</span>
              )}
            </div>

            <div className="overflow-auto flex-1 border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-right">الكود</th>
                    <th className="p-2 text-right">اسم البند</th>
                    <th className="p-2 text-right">التصنيف</th>
                    <th className="p-2 text-right">الوحدة</th>
                    <th className="p-2 text-right">السعر</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className="border-t">
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
          <Button
            variant="ghost"
            disabled={uploading}
            onClick={() => { setRows([]); setFileName(""); onOpenChange(false); }}
          >
            إلغاء
          </Button>
          {rows.length > 0 && !uploading && (
            <Button onClick={handleConfirm} className="gap-2">
              <Check className="w-4 h-4" />
              رفع {rows.length.toLocaleString()} بند
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
