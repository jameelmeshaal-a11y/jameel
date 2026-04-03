import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle, AlertTriangle, FileText, Building2, History, ShieldCheck } from "lucide-react";

const SOURCE_TYPE_CONFIG = {
  Supplier: { label: "مورّد", icon: Building2, color: "bg-blue-500/10 text-blue-700 border-blue-200" },
  Historical: { label: "تاريخي", icon: History, color: "bg-amber-500/10 text-amber-700 border-amber-200" },
  Approved: { label: "معتمد", icon: ShieldCheck, color: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
} as const;

interface RateSource {
  id: string;
  rate_library_id: string;
  source_type: string;
  source_name: string;
  project_name: string | null;
  city: string;
  rate: number;
  date: string;
  notes: string | null;
  is_verified: boolean;
  created_at: string;
}

interface Props {
  rateLibraryId: string;
  rateNameAr: string;
  targetRate: number;
  isAdmin: boolean;
}

export default function RateSourcesPanel({ rateLibraryId, rateNameAr, targetRate, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["rate_sources", rateLibraryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_sources")
        .select("*")
        .eq("rate_library_id", rateLibraryId)
        .order("source_type", { ascending: true });
      if (error) throw error;
      return data as RateSource[];
    },
  });

  const deleteSource = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rate_sources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_sources", rateLibraryId] });
      toast.success("تم حذف المصدر");
    },
  });

  const toggleVerified = useMutation({
    mutationFn: async ({ id, verified }: { id: string; verified: boolean }) => {
      const { error } = await supabase.from("rate_sources").update({ is_verified: verified }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_sources", rateLibraryId] });
    },
  });

  const filtered = sources.filter(s => typeFilter === "all" || s.source_type === typeFilter);

  // Compute weighted average and variance
  const supplierRates = sources.filter(s => s.source_type === "Supplier").map(s => s.rate);
  const historicalRates = sources.filter(s => s.source_type === "Historical").map(s => s.rate);
  const approvedRates = sources.filter(s => s.source_type === "Approved").map(s => s.rate);

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const supplierAvg = avg(supplierRates);
  const historicalAvg = avg(historicalRates);
  const approvedRate = approvedRates.length ? approvedRates[approvedRates.length - 1] : null;

  // Weighted: Approved > Supplier 40% + Historical 30% + Target 30%
  let computedRate = targetRate;
  if (approvedRate !== null) {
    computedRate = approvedRate;
  } else if (supplierRates.length > 0 || historicalRates.length > 0) {
    const sWeight = supplierRates.length > 0 ? 0.4 : 0;
    const hWeight = historicalRates.length > 0 ? 0.3 : 0;
    const tWeight = 1 - sWeight - hWeight;
    computedRate = (supplierAvg * sWeight) + (historicalAvg * hWeight) + (targetRate * tWeight);
  }

  // Variance detection
  const allRates = sources.map(s => s.rate);
  const maxRate = Math.max(...allRates, targetRate);
  const minRate = Math.min(...allRates, targetRate);
  const variance = maxRate > 0 ? ((maxRate - minRate) / maxRate) * 100 : 0;
  const highVariance = variance > 30;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">مصادر التسعير — {rateNameAr}</h3>
          <p className="text-xs text-muted-foreground">{sources.length} مصدر | السعر المحسوب: {computedRate.toFixed(2)} SAR</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="Supplier">مورّد</SelectItem>
              <SelectItem value="Historical">تاريخي</SelectItem>
              <SelectItem value="Approved">معتمد</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && (
            <SourceFormDialog
              rateLibraryId={rateLibraryId}
              open={showAdd}
              onOpenChange={setShowAdd}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ["rate_sources", rateLibraryId] });
                setShowAdd(false);
              }}
            />
          )}
        </div>
      </div>

      {highVariance && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-200 text-amber-700 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>تباين عالي في المصادر ({variance.toFixed(0)}%) — يُنصح بمراجعة الأسعار</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border p-2 text-center">
          <p className="text-[10px] text-muted-foreground">مورّدون</p>
          <p className="text-sm font-semibold">{supplierRates.length > 0 ? `${supplierAvg.toFixed(0)} SAR` : "—"}</p>
          <p className="text-[10px] text-muted-foreground">{supplierRates.length} مصدر</p>
        </div>
        <div className="rounded-md border p-2 text-center">
          <p className="text-[10px] text-muted-foreground">تاريخي</p>
          <p className="text-sm font-semibold">{historicalRates.length > 0 ? `${historicalAvg.toFixed(0)} SAR` : "—"}</p>
          <p className="text-[10px] text-muted-foreground">{historicalRates.length} مصدر</p>
        </div>
        <div className="rounded-md border p-2 text-center bg-emerald-500/5">
          <p className="text-[10px] text-muted-foreground">معتمد</p>
          <p className="text-sm font-semibold">{approvedRate !== null ? `${approvedRate.toFixed(0)} SAR` : "—"}</p>
          <p className="text-[10px] text-muted-foreground">{approvedRates.length > 0 ? "✓ أولوية" : "لا يوجد"}</p>
        </div>
      </div>

      {/* Sources table */}
      {filtered.length > 0 ? (
        <div className="rounded-md border overflow-auto max-h-60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right text-xs">النوع</TableHead>
                <TableHead className="text-right text-xs">المصدر</TableHead>
                <TableHead className="text-right text-xs">المدينة</TableHead>
                <TableHead className="text-center text-xs">السعر</TableHead>
                <TableHead className="text-center text-xs">موثّق</TableHead>
                {isAdmin && <TableHead className="w-16"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(src => {
                const cfg = SOURCE_TYPE_CONFIG[src.source_type as keyof typeof SOURCE_TYPE_CONFIG];
                const Icon = cfg?.icon || FileText;
                return (
                  <TableRow key={src.id}>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] gap-1 ${cfg?.color || ""}`}>
                        <Icon className="w-3 h-3" />
                        {cfg?.label || src.source_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{src.source_name}</div>
                      {src.project_name && <div className="text-muted-foreground text-[10px]">{src.project_name}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{src.city}</TableCell>
                    <TableCell className="text-center font-mono text-sm font-semibold">{src.rate.toFixed(2)}</TableCell>
                    <TableCell className="text-center">
                      {isAdmin ? (
                        <Checkbox
                          checked={src.is_verified}
                          onCheckedChange={(checked) => toggleVerified.mutate({ id: src.id, verified: !!checked })}
                        />
                      ) : (
                        src.is_verified ? <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          onClick={() => { if (confirm("حذف المصدر؟")) deleteSource.mutate(src.id); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground text-sm">
          {isLoading ? "جاري التحميل..." : "لا توجد مصادر بعد"}
        </div>
      )}
    </div>
  );
}

function SourceFormDialog({ rateLibraryId, open, onOpenChange, onSaved }: {
  rateLibraryId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    source_type: "Supplier" as string,
    source_name: "",
    project_name: "",
    city: "Riyadh",
    rate: 0,
    notes: "",
    is_verified: false,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.source_name || !form.rate) {
      toast.error("أدخل اسم المصدر والسعر");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("rate_sources").insert({
      rate_library_id: rateLibraryId,
      source_type: form.source_type,
      source_name: form.source_name,
      project_name: form.project_name || null,
      city: form.city,
      rate: form.rate,
      notes: form.notes || null,
      is_verified: form.is_verified,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("تمت إضافة المصدر");
      setForm({ source_type: "Supplier", source_name: "", project_name: "", city: "Riyadh", rate: 0, notes: "", is_verified: false });
      onSaved();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={() => onOpenChange(true)}>
          <Plus className="w-3.5 h-3.5" /> مصدر جديد
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إضافة مصدر تسعير</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">نوع المصدر</Label>
              <Select value={form.source_type} onValueChange={v => setForm(f => ({ ...f, source_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Supplier">مورّد</SelectItem>
                  <SelectItem value="Historical">تاريخي</SelectItem>
                  <SelectItem value="Approved">معتمد</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">المدينة</Label>
              <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label className="text-xs">اسم المصدر</Label>
            <Input value={form.source_name} onChange={e => setForm(f => ({ ...f, source_name: e.target.value }))} placeholder="مثال: شركة المواد الأولى" />
          </div>
          <div>
            <Label className="text-xs">اسم المشروع (اختياري)</Label>
            <Input value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">السعر (SAR)</Label>
              <Input type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: +e.target.value }))} />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Checkbox checked={form.is_verified} onCheckedChange={c => setForm(f => ({ ...f, is_verified: !!c }))} />
              <Label className="text-xs">موثّق</Label>
            </div>
          </div>
          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm">إضافة المصدر</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
