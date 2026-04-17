import React, { useState, useCallback } from "react";
import { Search, Plus, BookOpen, Download, Upload, Check, X, Pencil, Trash2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import AppLayout from "@/components/AppLayout";
import { formatNumber } from "@/lib/mockData";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePriceLibrary, usePriceLibraryCategories, useUpdatePriceItem, useApprovePriceItem, useDeletePriceItem, useAddPriceItem, useBulkApprovePending } from "@/hooks/usePriceLibrary";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import PriceLibraryImportDialog from "@/components/PriceLibraryImportDialog";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export default function RateLibraryPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [codeFilter, setCodeFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("all");
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Debounce search
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (val: string) => {
    setSearch(val);
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => setDebouncedSearch(val), 300));
  };

  const { data: items = [], isLoading } = usePriceLibrary(debouncedSearch, category);
  const { data: categories = [] } = usePriceLibraryCategories();
  const updateItem = useUpdatePriceItem();
  const approveItem = useApprovePriceItem();
  const deleteItem = useDeletePriceItem();
  const addItem = useAddPriceItem();
  const bulkApprove = useBulkApprovePending();

  // Apply client-side filters: item_code prefix and unit
  const filteredItems = items.filter((it: any) => {
    if (codeFilter && !((it.item_code || "").toLowerCase().includes(codeFilter.toLowerCase()))) return false;
    if (unitFilter !== "all" && (it.unit || "").trim() !== unitFilter) return false;
    return true;
  });

  // Distinct units for the unit filter dropdown
  const units = Array.from(new Set(items.map((i: any) => (i.unit || "").trim()).filter(Boolean))).sort() as string[];

  const pendingCount = filteredItems.filter((i: any) => !i.approved_at).length;

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditValues({
      standard_name_ar: item.standard_name_ar,
      standard_name_en: item.standard_name_en,
      category: item.category,
      unit: item.unit,
      base_rate: item.base_rate,
      item_code: item.item_code || "",
      item_description: item.item_description || "",
    });
  };

  const saveEdit = (item: any) => {
    updateItem.mutate({
      id: item.id,
      updates: {
        ...editValues,
        target_rate: editValues.base_rate,
        updated_at: new Date().toISOString(),
      },
      oldPrice: item.base_rate,
      newPrice: editValues.base_rate,
      userId: user?.id,
    }, {
      onSuccess: () => { setEditingId(null); toast.success("تم التحديث"); },
      onError: () => toast.error("فشل التحديث"),
    });
  };

  const handleExport = () => {
    const exportData = filteredItems.map((r: any) => ({
      "كود البند": r.item_code || "",
      "اسم البند": r.standard_name_ar,
      "الاسم الإنجليزي": r.standard_name_en,
      "الأسماء البديلة": (r.item_name_aliases || []).join(", "),
      "التصنيف": r.category,
      "الوحدة": r.unit,
      "السعر": r.base_rate,
      "العملة": "SAR",
      "معتمد": r.approved_at ? "نعم" : "لا",
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "مكتبة الأسعار");
    XLSX.writeFile(wb, `price_library_${Date.now()}.xlsx`);
    toast.success("تم تصدير الملف");
  };

  const allCategories = ["all", ...categories];

  return (
    <AppLayout>
      <div className="animate-fade-in">
        {/* Header with search in same row */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div className="shrink-0">
            <h1 className="page-title">{t("rateLibraryTitle")}</h1>
            <p className="page-subtitle">{t("rateLibrarySubtitle")}</p>
          </div>
          <div className="relative flex-1 min-w-[280px] max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder={t("searchRates")}
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 h-11 text-base w-full"
            />
            {debouncedSearch && !isLoading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {filteredItems.length} نتيجة
              </span>
            )}
          </div>
        </div>

        {/* Action buttons row */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {pendingCount > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50">
                  <Check className="w-4 h-4" /> اعتماد جميع البنود المعلقة ({pendingCount})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>اعتماد البنود المعلقة</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم اعتماد {pendingCount} بند معلق. هل تريد المتابعة؟
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={() => {
                    bulkApprove.mutate(user!.id, {
                      onSuccess: (result: any) => {
                        toast.success(`تم اعتماد ${result.approved} بند`);
                        if (result.skipped > 0) {
                          toast.warning(`تم تخطي ${result.skipped} بند بسبب سعر صفر — يجب إدخال السعر أولاً`);
                        }
                      },
                      onError: () => toast.error("فشل اعتماد البنود"),
                    });
                  }}>
                    اعتماد الكل
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={filteredItems.length === 0}>
            <Download className="w-4 h-4" /> تنزيل Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" /> رفع ملف أسعار
          </Button>
          <Button className="gap-2" size="sm">
            <Plus className="w-4 h-4" /> {t("addRate")}
          </Button>
        </div>

        {/* Category chips - scrollable */}
        <div className="mb-3 overflow-x-auto pb-1">
          <div className="flex gap-1.5 min-w-max">
            {allCategories.map((c) => (
              <Button key={c} variant={category === c ? "default" : "outline"} size="sm" onClick={() => setCategory(c)} className="capitalize text-xs whitespace-nowrap">
                {c === "all" ? t("all") : c}
              </Button>
            ))}
          </div>
        </div>

        {/* Secondary filters: item_code + unit */}
        <div className="flex flex-wrap items-center gap-2 mb-6" dir="rtl">
          <div className="relative w-48">
            <Input
              placeholder="رقم/كود البند"
              value={codeFilter}
              onChange={(e) => setCodeFilter(e.target.value)}
              className="h-9 text-xs"
              dir="rtl"
            />
          </div>
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            dir="rtl"
          >
            <option value="all">كل الوحدات</option>
            {units.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          {(codeFilter || unitFilter !== "all") && (
            <Button variant="ghost" size="sm" className="text-xs h-9" onClick={() => { setCodeFilter(""); setUnitFilter("all"); }}>
              <X className="w-3 h-3 ml-1" /> مسح الفلاتر
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <BookOpen className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">
              {debouncedSearch ? t("noMatchingRates") : t("rateLibraryEmpty")}
            </h2>
            <p className="text-muted-foreground max-w-md mb-6">
              {debouncedSearch ? t("noMatchingRatesDesc") : t("rateLibraryEmptyDesc")}
            </p>
            {!debouncedSearch && (
              <Button className="gap-2" onClick={() => setImportOpen(true)}>
                <Upload className="w-4 h-4" /> رفع ملف أسعار
              </Button>
            )}
          </div>
        ) : (
          <div className="border rounded-lg overflow-auto bg-card">
            <table className="boq-table">
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th>{t("code")}</th>
                  <th className="max-w-[280px]">{t("description")}</th>
                  <th className="min-w-[160px]">{t("arabic")}</th>
                  <th>{t("unit")}</th>
                  <th>{t("category")}</th>
                  <th className="text-right">{t("baseRate")}</th>
                  <th className="text-center">الحالة</th>
                  <th className="text-center w-24">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((rate: any, idx: number) => {
                  const isEditing = editingId === rate.id;
                  const isApproved = !!rate.approved_at;
                  return (
                    <React.Fragment key={rate.id}>
                    <tr className="group">
                      <td className="text-xs text-muted-foreground">{idx + 1}</td>
                      <td className="font-mono text-xs">
                        {isEditing ? (
                          <Input value={editValues.item_code} onChange={(e) => setEditValues({...editValues, item_code: e.target.value})} className="h-7 text-xs w-20" />
                        ) : rate.item_code || "—"}
                      </td>
                      <td className="text-sm max-w-[280px]">
                        {isEditing ? (
                          <Input value={editValues.standard_name_en} onChange={(e) => setEditValues({...editValues, standard_name_en: e.target.value})} className="h-7 text-xs" />
                        ) : (
                          <span className="block truncate" title={rate.standard_name_en || ""}>
                            {rate.standard_name_en || "—"}
                          </span>
                        )}
                      </td>
                      <td className="text-sm" dir="rtl">
                        {isEditing ? (
                          <Input value={editValues.standard_name_ar} onChange={(e) => setEditValues({...editValues, standard_name_ar: e.target.value})} className="h-7 text-xs" dir="rtl" />
                        ) : (
                          <div className="flex items-center gap-1">
                            <span>{rate.standard_name_ar}</span>
                            {rate.item_description && (
                              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setExpandedId(expandedId === rate.id ? null : rate.id)}>
                                {expandedId === rate.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="text-xs text-center">
                        {isEditing ? (
                          <Input value={editValues.unit} onChange={(e) => setEditValues({...editValues, unit: e.target.value})} className="h-7 text-xs w-16" />
                        ) : rate.unit}
                      </td>
                      <td>
                        <Badge variant="secondary" className="text-xs">{rate.category}</Badge>
                      </td>
                      <td className="text-right font-mono text-sm font-semibold">
                        {isEditing ? (
                          <Input type="number" value={editValues.base_rate} onChange={(e) => setEditValues({...editValues, base_rate: +e.target.value})} className="h-7 text-xs w-24 ml-auto" />
                        ) : (
                          <span className={rate.base_rate <= 0 ? "text-destructive" : ""}>
                            {rate.base_rate <= 0 ? "⚠️ 0" : formatNumber(rate.base_rate)}
                          </span>
                        )}
                      </td>
                      <td className="text-center">
                        {isApproved ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-200 text-xs">✅ معتمد</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-200">⏳ قيد الانتظار</Badge>
                        )}
                      </td>
                      <td className="text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEdit(rate)}>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                              <X className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(rate)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            {!isApproved && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                                approveItem.mutate({ id: rate.id, userId: user!.id }, {
                                  onSuccess: () => toast.success("تم الاعتماد"),
                                  onError: (err: any) => {
                                    if (err?.message === "ZERO_RATE") {
                                      toast.error("لا يمكن اعتماد بند بسعر صفر — يجب إدخال السعر أولاً");
                                    } else {
                                      toast.error("فشل الاعتماد");
                                    }
                                  },
                                });
                              }}>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                              if (confirm("هل تريد حذف هذا البند؟")) {
                                deleteItem.mutate(rate.id, {
                                  onSuccess: () => toast.success("تم الحذف"),
                                });
                              }
                            }}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {(expandedId === rate.id || isEditing) && (
                      <tr className="bg-muted/20">
                        <td colSpan={9} className="px-4 py-2" dir="rtl">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">وصف تفصيلي:</span>
                              <Input
                                value={editValues.item_description}
                                onChange={(e) => setEditValues({...editValues, item_description: e.target.value})}
                                className="h-7 text-xs flex-1"
                                dir="rtl"
                                placeholder="وصف تفصيلي للبند (السياق الأصلي من جدول الكميات)"
                              />
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium">وصف تفصيلي: </span>
                              {rate.item_description || "—"}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PriceLibraryImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </AppLayout>
  );
}
