import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Lock, Unlock, Search, Users, Database, DollarSign, Shield, CheckCircle, AlertTriangle, Layers } from "lucide-react";
import RateSourcesPanel from "@/components/RateSourcesPanel";

const CATEGORIES = [
  "Earthworks", "Concrete", "Finishing", "Waterproofing",
  "Doors & Windows", "Plumbing", "Electrical", "Mechanical", "Firefighting",
];

interface RateItem {
  id: string;
  category: string;
  standard_name_ar: string;
  standard_name_en: string;
  unit: string;
  base_rate: number;
  target_rate: number;
  min_rate: number;
  max_rate: number;
  materials_pct: number;
  labor_pct: number;
  equipment_pct: number;
  logistics_pct: number;
  risk_pct: number;
  profit_pct: number;
  market_level: string;
  is_locked: boolean;
  keywords: string[];
  notes: string | null;
  base_city: string;
  weight_class: string;
  complexity: string;
  source_type: string;
  last_reviewed_at: string | null;
}

export default function AdminDashboard() {
  const { user, isAdmin, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [editItem, setEditItem] = useState<RateItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [sourcesItem, setSourcesItem] = useState<RateItem | null>(null);

  const { data: rates = [], isLoading } = useQuery({
    queryKey: ["rate_library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_library")
        .select("*")
        .order("category", { ascending: true });
      if (error) throw error;
      return data as unknown as RateItem[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["admin_stats"],
    queryFn: async () => {
      const [projects, items, users] = await Promise.all([
        supabase.from("projects").select("id", { count: "exact", head: true }),
        supabase.from("boq_items").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      return {
        projects: projects.count || 0,
        items: items.count || 0,
        users: users.count || 0,
      };
    },
  });

  const toggleLock = useMutation({
    mutationFn: async ({ id, locked }: { id: string; locked: boolean }) => {
      const { error } = await supabase.from("rate_library").update({ is_locked: locked }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_library"] });
      toast.success("تم تحديث حالة القفل");
    },
  });

  const deleteRate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rate_library").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_library"] });
      toast.success("تم الحذف");
    },
  });

  const filtered = rates.filter(r => {
    const matchSearch = !search || r.standard_name_ar.includes(search) || r.standard_name_en.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "all" || r.category === catFilter;
    return matchSearch && matchCat;
  });

  const uniqueCategories = [...new Set(rates.map(r => r.category))];

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Shield className="w-7 h-7 text-primary" />
              لوحة تحكم الأدمن
            </h1>
            <p className="text-sm text-muted-foreground">
              {user?.email} — {isAdmin ? "مدير النظام" : "مستخدم"}
            </p>
          </div>
          <Button variant="outline" onClick={signOut}>تسجيل خروج</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 text-center">
              <Database className="w-7 h-7 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold">{stats?.projects || 0}</p>
              <p className="text-xs text-muted-foreground">مشاريع</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <DollarSign className="w-7 h-7 mx-auto text-emerald-500 mb-1" />
              <p className="text-2xl font-bold">{stats?.items || 0}</p>
              <p className="text-xs text-muted-foreground">بنود مسعّرة</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <Users className="w-7 h-7 mx-auto text-blue-500 mb-1" />
              <p className="text-2xl font-bold">{stats?.users || 0}</p>
              <p className="text-xs text-muted-foreground">مستخدمون</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <CheckCircle className="w-7 h-7 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold">{rates.length}</p>
              <p className="text-xs text-muted-foreground">بنود المكتبة</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <Lock className="w-7 h-7 mx-auto text-amber-500 mb-1" />
              <p className="text-2xl font-bold">{rates.filter(r => r.is_locked).length}</p>
              <p className="text-xs text-muted-foreground">مقفلة</p>
            </CardContent>
          </Card>
        </div>

        {/* Library info */}
        <div className="flex items-center gap-2 mb-4 text-sm">
          <Badge variant="outline">V2 — Multi-Source</Badge>
          <Badge variant="outline">{uniqueCategories.length} فئات</Badge>
          <Badge variant="outline">{rates.length} بنود</Badge>
          <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">المحرك يستخدم مصادر متعددة ✓</Badge>
        </div>

        {/* Rate Library */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle>مكتبة الأسعار — السوق السعودي V1</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)}
                    className="pl-8 w-48" />
                </div>
                <Select value={catFilter} onValueChange={setCatFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="الفئة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <RateFormDialog
                  open={showAdd}
                  onOpenChange={setShowAdd}
                  onSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ["rate_library"] });
                    setShowAdd(false);
                  }}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">البند</TableHead>
                    <TableHead>الفئة</TableHead>
                    <TableHead>الوحدة</TableHead>
                    <TableHead className="text-center">أدنى</TableHead>
                    <TableHead className="text-center font-bold">المستهدف</TableHead>
                    <TableHead className="text-center">أعلى</TableHead>
                    <TableHead className="text-center">مواد</TableHead>
                    <TableHead className="text-center">عمالة</TableHead>
                    <TableHead className="text-center">معدات</TableHead>
                    <TableHead className="text-center">الوزن</TableHead>
                    <TableHead className="text-center">المصدر</TableHead>
                    <TableHead className="text-center">حالة</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(item => (
                    <TableRow key={item.id} className={item.is_locked ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                      <TableCell className="text-right max-w-[200px]" dir="auto">
                        <div className="font-medium text-sm truncate">{item.standard_name_ar}</div>
                        <div className="text-xs text-muted-foreground truncate">{item.standard_name_en}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs whitespace-nowrap">{item.category}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{item.unit}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">{item.min_rate}</TableCell>
                      <TableCell className="text-center font-semibold">{item.target_rate}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">{item.max_rate}</TableCell>
                      <TableCell className="text-center text-xs">{item.materials_pct}%</TableCell>
                      <TableCell className="text-center text-xs">{item.labor_pct}%</TableCell>
                      <TableCell className="text-center text-xs">{item.equipment_pct}%</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-[10px]">{item.weight_class}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px]">{item.source_type}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {item.is_locked ? (
                          <Badge className="bg-amber-500 text-white text-[10px]">مقفل</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">مفتوح</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => toggleLock.mutate({ id: item.id, locked: !item.is_locked })}>
                            {item.is_locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </Button>
                          <RateFormDialog
                            item={item}
                            open={editItem?.id === item.id}
                            onOpenChange={(open) => setEditItem(open ? item : null)}
                            onSaved={() => {
                              queryClient.invalidateQueries({ queryKey: ["rate_library"] });
                              setEditItem(null);
                            }}
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            onClick={() => { if (confirm("حذف؟")) deleteRate.mutate(item.id); }}>✕</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                        {isLoading ? "جاري التحميل..." : "لا توجد بنود"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">إجمالي: {filtered.length} بند | الفئات: {uniqueCategories.length}</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function RateFormDialog({ item, open, onOpenChange, onSaved }: {
  item?: RateItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    category: item?.category || "Concrete",
    standard_name_ar: item?.standard_name_ar || "",
    standard_name_en: item?.standard_name_en || "",
    unit: item?.unit || "m2",
    target_rate: item?.target_rate || 0,
    min_rate: item?.min_rate || 0,
    max_rate: item?.max_rate || 0,
    materials_pct: item?.materials_pct || 50,
    labor_pct: item?.labor_pct || 25,
    equipment_pct: item?.equipment_pct || 15,
    logistics_pct: item?.logistics_pct || 10,
    risk_pct: item?.risk_pct || 5,
    profit_pct: item?.profit_pct || 5,
    weight_class: item?.weight_class || "Medium",
    complexity: item?.complexity || "Medium",
    keywords: item?.keywords?.join(", ") || "",
    notes: item?.notes || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.standard_name_ar || !form.target_rate) {
      toast.error("أدخل اسم البند والسعر المستهدف");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      base_rate: form.target_rate,
      keywords: form.keywords.split(",").map(k => k.trim()).filter(Boolean),
      source_type: item?.source_type || "Manual",
      last_reviewed_at: new Date().toISOString(),
    };

    let error;
    if (item) {
      ({ error } = await supabase.from("rate_library").update(payload).eq("id", item.id));
    } else {
      ({ error } = await supabase.from("rate_library").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(item ? "تم التحديث" : "تمت الإضافة");
      onSaved();
    }
  };

  const trigger = item
    ? <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(true)}>✎</Button>
    : <Button size="sm" className="gap-1" onClick={() => onOpenChange(true)}>
        <Plus className="w-4 h-4" /> إضافة بند
      </Button>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "تعديل بند" : "إضافة بند جديد"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>الاسم بالعربية</Label>
              <Input value={form.standard_name_ar} onChange={e => setForm(f => ({ ...f, standard_name_ar: e.target.value }))} dir="rtl" />
            </div>
            <div>
              <Label>الاسم بالإنجليزية</Label>
              <Input value={form.standard_name_en} onChange={e => setForm(f => ({ ...f, standard_name_en: e.target.value }))} dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>الفئة</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الوحدة</Label>
              <Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
            </div>
            <div>
              <Label>درجة التعقيد</Label>
              <Select value={form.complexity} onValueChange={v => setForm(f => ({ ...f, complexity: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">منخفض</SelectItem>
                  <SelectItem value="Medium">متوسط</SelectItem>
                  <SelectItem value="High">مرتفع</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>الحد الأدنى (SAR)</Label>
              <Input type="number" value={form.min_rate} onChange={e => setForm(f => ({ ...f, min_rate: +e.target.value }))} />
            </div>
            <div>
              <Label>المستهدف (SAR)</Label>
              <Input type="number" value={form.target_rate} onChange={e => setForm(f => ({ ...f, target_rate: +e.target.value }))} />
            </div>
            <div>
              <Label>الحد الأعلى (SAR)</Label>
              <Input type="number" value={form.max_rate} onChange={e => setForm(f => ({ ...f, max_rate: +e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label>مواد %</Label>
              <Input type="number" value={form.materials_pct} onChange={e => setForm(f => ({ ...f, materials_pct: +e.target.value }))} />
            </div>
            <div>
              <Label>عمالة %</Label>
              <Input type="number" value={form.labor_pct} onChange={e => setForm(f => ({ ...f, labor_pct: +e.target.value }))} />
            </div>
            <div>
              <Label>معدات %</Label>
              <Input type="number" value={form.equipment_pct} onChange={e => setForm(f => ({ ...f, equipment_pct: +e.target.value }))} />
            </div>
            <div>
              <Label>لوجستيات %</Label>
              <Input type="number" value={form.logistics_pct} onChange={e => setForm(f => ({ ...f, logistics_pct: +e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>فئة الوزن</Label>
              <Select value={form.weight_class} onValueChange={v => setForm(f => ({ ...f, weight_class: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Light">خفيف</SelectItem>
                  <SelectItem value="Medium">متوسط</SelectItem>
                  <SelectItem value="Heavy">ثقيل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>كلمات مفتاحية</Label>
              <Input value={form.keywords} onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))} dir="rtl" placeholder="حفر, تربة" />
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {item ? "حفظ التعديلات" : "إضافة"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
