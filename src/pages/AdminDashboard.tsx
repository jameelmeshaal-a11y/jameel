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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Lock, Unlock, Search, Users, Database, DollarSign, Shield } from "lucide-react";

const CATEGORIES = [
  "excavation", "backfill", "blinding_concrete", "foundation_concrete",
  "column_concrete", "beam_concrete", "slab_concrete", "shear_wall_concrete",
  "general_concrete", "rebar", "formwork", "blockwork", "plastering",
  "painting", "tiling", "ceiling", "cladding", "waterproofing",
  "thermal_insulation", "electrical_conduit", "electrical_wiring",
  "electrical_panels", "electrical_fixtures", "plumbing_pipes",
  "plumbing_fixtures", "hvac_ductwork", "hvac_equipment", "fire_fighting",
  "doors", "windows", "aluminum", "steel_structural", "steel_misc",
  "asphalt", "curbs", "landscaping", "furniture", "general",
];

interface RateItem {
  id: string;
  category: string;
  item_name_ar: string;
  item_name_en: string;
  unit: string;
  base_rate: number;
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
}

export default function AdminDashboard() {
  const { user, isAdmin, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [editItem, setEditItem] = useState<RateItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data: rates = [], isLoading } = useQuery({
    queryKey: ["rate_library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_library")
        .select("*")
        .order("category", { ascending: true });
      if (error) throw error;
      return data as RateItem[];
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
        rates: rates.length,
      };
    },
  });

  const toggleLock = useMutation({
    mutationFn: async ({ id, locked }: { id: string; locked: boolean }) => {
      const { error } = await supabase
        .from("rate_library")
        .update({ is_locked: locked })
        .eq("id", id);
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
    const matchSearch = !search || r.item_name_ar.includes(search) || r.item_name_en.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "all" || r.category === catFilter;
    return matchSearch && matchCat;
  });

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 text-center">
              <Database className="w-8 h-8 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold">{stats?.projects || 0}</p>
              <p className="text-xs text-muted-foreground">مشاريع</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <DollarSign className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
              <p className="text-2xl font-bold">{stats?.items || 0}</p>
              <p className="text-xs text-muted-foreground">بنود مسعّرة</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <Users className="w-8 h-8 mx-auto text-blue-500 mb-2" />
              <p className="text-2xl font-bold">{stats?.users || 0}</p>
              <p className="text-xs text-muted-foreground">مستخدمون</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <Lock className="w-8 h-8 mx-auto text-amber-500 mb-2" />
              <p className="text-2xl font-bold">{rates.filter(r => r.is_locked).length}</p>
              <p className="text-xs text-muted-foreground">أسعار مقفلة</p>
            </CardContent>
          </Card>
        </div>

        {/* Rate Library */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle>مكتبة الأسعار — السوق السعودي</CardTitle>
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
                      <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
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
                    <TableHead className="text-center">الحد الأدنى</TableHead>
                    <TableHead className="text-center">المتوسط</TableHead>
                    <TableHead className="text-center">الحد الأعلى</TableHead>
                    <TableHead className="text-center">مواد%</TableHead>
                    <TableHead className="text-center">عمالة%</TableHead>
                    <TableHead className="text-center">معدات%</TableHead>
                    <TableHead className="text-center">حالة</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(item => (
                    <TableRow key={item.id} className={item.is_locked ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                      <TableCell className="text-right font-medium max-w-[200px] truncate" dir="auto">
                        {item.item_name_ar}
                        <br />
                        <span className="text-xs text-muted-foreground">{item.item_name_en}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{item.category.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell className="text-center">{item.min_rate}</TableCell>
                      <TableCell className="text-center font-semibold">{item.base_rate}</TableCell>
                      <TableCell className="text-center">{item.max_rate}</TableCell>
                      <TableCell className="text-center">{item.materials_pct}%</TableCell>
                      <TableCell className="text-center">{item.labor_pct}%</TableCell>
                      <TableCell className="text-center">{item.equipment_pct}%</TableCell>
                      <TableCell className="text-center">
                        {item.is_locked ? (
                          <Badge className="bg-amber-500 text-white text-xs">مقفل</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">مفتوح</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm"
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
                          <Button variant="ghost" size="sm" className="text-destructive"
                            onClick={() => { if (confirm("حذف؟")) deleteRate.mutate(item.id); }}>✕</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                        {isLoading ? "جاري التحميل..." : "لا توجد بنود"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">إجمالي البنود: {filtered.length}</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

// Rate Form Dialog (add/edit)
function RateFormDialog({ item, open, onOpenChange, onSaved }: {
  item?: RateItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    category: item?.category || "general",
    item_name_ar: item?.item_name_ar || "",
    item_name_en: item?.item_name_en || "",
    unit: item?.unit || "م2",
    base_rate: item?.base_rate || 0,
    min_rate: item?.min_rate || 0,
    max_rate: item?.max_rate || 0,
    materials_pct: item?.materials_pct || 50,
    labor_pct: item?.labor_pct || 25,
    equipment_pct: item?.equipment_pct || 15,
    logistics_pct: item?.logistics_pct || 10,
    risk_pct: item?.risk_pct || 3,
    profit_pct: item?.profit_pct || 5,
    keywords: item?.keywords?.join(", ") || "",
    notes: item?.notes || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.item_name_ar || !form.base_rate) {
      toast.error("أدخل اسم البند والسعر الأساسي");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      keywords: form.keywords.split(",").map(k => k.trim()).filter(Boolean),
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
    ? <Button variant="ghost" size="sm" onClick={() => onOpenChange(true)}>✎</Button>
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
              <Input value={form.item_name_ar} onChange={e => setForm(f => ({ ...f, item_name_ar: e.target.value }))} dir="rtl" />
            </div>
            <div>
              <Label>الاسم بالإنجليزية</Label>
              <Input value={form.item_name_en} onChange={e => setForm(f => ({ ...f, item_name_en: e.target.value }))} dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>الفئة</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الوحدة</Label>
              <Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>الحد الأدنى (SAR)</Label>
              <Input type="number" value={form.min_rate} onChange={e => setForm(f => ({ ...f, min_rate: +e.target.value }))} />
            </div>
            <div>
              <Label>المتوسط (SAR)</Label>
              <Input type="number" value={form.base_rate} onChange={e => setForm(f => ({ ...f, base_rate: +e.target.value }))} />
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
          <div>
            <Label>كلمات مفتاحية (مفصولة بفاصلة)</Label>
            <Input value={form.keywords} onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))} dir="rtl" />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {item ? "حفظ التعديلات" : "إضافة"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
