import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, RefreshCw, Trash2, CheckCircle2, Loader2, ShieldAlert, Database } from "lucide-react";
import { useDuplicateLibraryItems, usePriceDrift, useBulkMergeDuplicates, useForceResyncRate } from "@/hooks/usePriceSyncAudit";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function PriceSyncAuditPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: duplicates = [], isLoading: dupLoading, isFetching: dupFetching, refetch: refetchDup } = useDuplicateLibraryItems();
  const { data: drift = [], isLoading: drLoading, isFetching: drFetching, refetch: refetchDr } = usePriceDrift();
  const bulkMerge = useBulkMergeDuplicates();
  const resyncRate = useForceResyncRate();
  const [resyncTarget, setResyncTarget] = useState<{ id: string; name: string; price: number } | null>(null);
  const [newPrice, setNewPrice] = useState<string>("");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const handleHardRefresh = async () => {
    // Force invalidation + remove cached data + refetch from server
    await qc.invalidateQueries({ queryKey: ["price-sync-duplicates"] });
    await qc.invalidateQueries({ queryKey: ["price-sync-drift"] });
    qc.removeQueries({ queryKey: ["price-sync-duplicates"] });
    qc.removeQueries({ queryKey: ["price-sync-drift"] });
    const [a, b] = await Promise.all([refetchDup(), refetchDr()]);
    setLastChecked(new Date());
    toast.success(`✅ تم التحديث — ${a.data?.length || 0} مكرر، ${b.data?.length || 0} غير متزامن`);
  };

  const handleBulkMerge = async () => {
    if (!confirm(`سيتم دمج ${duplicates.length} مجموعة بنود مكررة. هل أنت متأكد؟`)) return;
    try {
      const r = await bulkMerge.mutateAsync(user?.id);
      toast.success(`✅ تم دمج ${r.duplicates_deleted} نسخة مكررة وإعادة ربط ${r.items_relinked} بند`);
    } catch (e: any) {
      toast.error(e.message || "فشلت العملية");
    }
  };

  const handleResync = async (rateId: string, price: number, name: string) => {
    try {
      const r = await resyncRate.mutateAsync({ rateId, newPrice: price, userId: user?.id });
      toast.success(
        `✅ "${name.slice(0, 40)}..." — تم تحديث السعر من ${r.old_price} إلى ${r.new_price}، دُمجت ${r.merged_duplicates} نسخة، تزامن ${r.synced_boq_items} بند في ${r.affected_boq_files} ملف`,
        { duration: 8000 }
      );
      setResyncTarget(null);
      setNewPrice("");
    } catch (e: any) {
      toast.error(e.message || "فشلت المزامنة");
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 p-6" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <ShieldAlert className="h-8 w-8 text-warning" />
              تشخيص ومزامنة الأسعار
            </h1>
            <p className="text-muted-foreground mt-1">
              تحديد البنود المكررة والأسعار غير المتزامنة بين المكتبة وجداول الكميات، مع أداة إصلاح قسرية.
            </p>
          </div>
          <Button onClick={() => { refetchDup(); refetchDr(); }} variant="outline">
            <RefreshCw className="h-4 w-4 ml-2" /> تحديث الفحص
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 border-l-4 border-l-destructive">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <div>
                <div className="text-3xl font-bold">{duplicates.length}</div>
                <div className="text-sm text-muted-foreground">مجموعات بنود مكررة</div>
              </div>
            </div>
          </Card>
          <Card className="p-5 border-l-4 border-l-warning">
            <div className="flex items-center gap-3">
              <Database className="h-8 w-8 text-warning" />
              <div>
                <div className="text-3xl font-bold">{drift.length}</div>
                <div className="text-sm text-muted-foreground">بنود بسعر قديم (drift)</div>
              </div>
            </div>
          </Card>
          <Card className="p-5 border-l-4 border-l-emerald-500">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <div>
                <div className="text-3xl font-bold">
                  {duplicates.reduce((s, d) => s + (d.dup_count - 1), 0)}
                </div>
                <div className="text-sm text-muted-foreground">نسخة قابلة للحذف</div>
              </div>
            </div>
          </Card>
        </div>

        <Tabs defaultValue="duplicates">
          <TabsList>
            <TabsTrigger value="duplicates">المكررات ({duplicates.length})</TabsTrigger>
            <TabsTrigger value="drift">البنود غير المتزامنة ({drift.length})</TabsTrigger>
          </TabsList>

          {/* DUPLICATES */}
          <TabsContent value="duplicates" className="space-y-3">
            <div className="flex justify-end">
              <Button
                onClick={handleBulkMerge}
                disabled={bulkMerge.isPending || duplicates.length === 0}
                variant="destructive"
              >
                {bulkMerge.isPending ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Trash2 className="h-4 w-4 ml-2" />}
                دمج جميع المكررات (الاحتفاظ بالأحدث)
              </Button>
            </div>

            {dupLoading ? (
              <div className="text-center py-8"><Loader2 className="animate-spin mx-auto" /></div>
            ) : duplicates.length === 0 ? (
              <Card className="p-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                <p className="text-lg font-semibold">لا توجد بنود مكررة 🎉</p>
              </Card>
            ) : (
              duplicates.map((g, i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <div className="font-semibold text-sm line-clamp-2">{g.normalized_name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        الوحدة: <Badge variant="outline">{g.unit}</Badge> — عدد النسخ: <Badge variant="destructive">{g.dup_count}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1 border-t pt-2">
                    {g.variants.map((v, idx) => (
                      <div key={v.id} className="flex items-center justify-between text-xs gap-2 py-1">
                        <div className="flex items-center gap-2">
                          {idx === 0 && <Badge className="bg-emerald-600">الأحدث</Badge>}
                          <code className="text-muted-foreground">{v.id.slice(0, 8)}</code>
                          <span className="font-mono font-bold">{v.target_rate} ر.س</span>
                          {v.is_locked && <Badge variant="outline">🔒</Badge>}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setResyncTarget({ id: v.id, name: g.normalized_name, price: v.target_rate });
                            setNewPrice(String(v.target_rate));
                          }}
                        >
                          <RefreshCw className="h-3 w-3 ml-1" /> اجعله الرئيسي + زامن
                        </Button>
                      </div>
                    ))}
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* DRIFT */}
          <TabsContent value="drift" className="space-y-3">
            {drLoading ? (
              <div className="text-center py-8"><Loader2 className="animate-spin mx-auto" /></div>
            ) : drift.length === 0 ? (
              <Card className="p-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                <p className="text-lg font-semibold">جميع البنود متزامنة مع المكتبة 🎉</p>
              </Card>
            ) : (
              <Card className="p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-right">رقم البند</th>
                      <th className="p-2 text-right">الوصف</th>
                      <th className="p-2 text-right">الملف</th>
                      <th className="p-2 text-right">السعر الحالي</th>
                      <th className="p-2 text-right">سعر المكتبة</th>
                      <th className="p-2 text-right">الفرق</th>
                      <th className="p-2 text-right">إصلاح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drift.slice(0, 100).map((d) => (
                      <tr key={d.item_id} className="border-t hover:bg-muted/30">
                        <td className="p-2 font-mono text-xs">{d.item_no}</td>
                        <td className="p-2 max-w-xs truncate" title={d.description}>{d.description}</td>
                        <td className="p-2 text-xs text-muted-foreground">{d.boq_file_name}</td>
                        <td className="p-2 font-mono text-destructive">{d.current_unit_rate?.toLocaleString()}</td>
                        <td className="p-2 font-mono text-emerald-600">{d.library_target_rate?.toLocaleString()}</td>
                        <td className="p-2 font-mono">
                          <Badge variant={Math.abs(d.variance) > 100 ? "destructive" : "secondary"}>
                            {d.variance > 0 ? "+" : ""}{d.variance}
                          </Badge>
                        </td>
                        <td className="p-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResync(d.linked_rate_id, d.library_target_rate, d.library_name)}
                            disabled={resyncRate.isPending}
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {drift.length > 100 && (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    عرض أول 100 من {drift.length} بند
                  </div>
                )}
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Resync dialog */}
        {resyncTarget && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setResyncTarget(null)}>
            <Card className="p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-bold text-lg mb-2">مزامنة قسرية</h3>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{resyncTarget.name}</p>
              <label className="text-sm">السعر الجديد:</label>
              <input
                type="number"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className="w-full border rounded p-2 mt-1 mb-4 font-mono"
                autoFocus
              />
              <div className="text-xs text-muted-foreground mb-4 bg-muted p-3 rounded">
                ⚠️ سيتم: حذف النسخ المكررة، تحديث المكتبة، مزامنة جميع بنود المشاريع المرتبطة، وإعادة حساب الإجماليات.
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setResyncTarget(null)}>إلغاء</Button>
                <Button
                  onClick={() => handleResync(resyncTarget.id, parseFloat(newPrice), resyncTarget.name)}
                  disabled={resyncRate.isPending || !newPrice || parseFloat(newPrice) <= 0}
                >
                  {resyncRate.isPending ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <RefreshCw className="h-4 w-4 ml-2" />}
                  تأكيد المزامنة
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
