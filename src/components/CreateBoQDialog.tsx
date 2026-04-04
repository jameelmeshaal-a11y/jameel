import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Loader2, CheckCircle, XCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { parseBoQExcel } from "@/lib/boqParser";
import { getRowPersistenceStatus, getRowClassificationNote } from "@/lib/boqRowClassification";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface CreateBoQDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectCities: string[];
}

type SubmitPhase = "idle" | "creating" | "uploading" | "processing" | "done" | "error";

const FACILITY_TYPES = [
  { value: "residential", labelEn: "Residential", labelAr: "سكني" },
  { value: "commercial", labelEn: "Commercial", labelAr: "تجاري" },
  { value: "industrial", labelEn: "Industrial", labelAr: "صناعي" },
  { value: "infrastructure", labelEn: "Infrastructure", labelAr: "بنية تحتية" },
  { value: "healthcare", labelEn: "Healthcare", labelAr: "صحي" },
  { value: "educational", labelEn: "Educational", labelAr: "تعليمي" },
  { value: "hospitality", labelEn: "Hospitality", labelAr: "ضيافة" },
  { value: "mixed_use", labelEn: "Mixed Use", labelAr: "متعدد الاستخدامات" },
  { value: "other", labelEn: "Other", labelAr: "أخرى" },
];

const REMOTENESS_LEVELS = [
  { value: "urban", labelEn: "Urban", labelAr: "حضري" },
  { value: "suburban", labelEn: "Suburban", labelAr: "ضواحي" },
  { value: "normal", labelEn: "Normal", labelAr: "عادي" },
  { value: "remote", labelEn: "Remote", labelAr: "نائي" },
  { value: "very_remote", labelEn: "Very Remote", labelAr: "نائي جداً" },
];

const PRICING_MODES = [
  { value: "review", labelEn: "Review", labelAr: "مراجعة" },
  { value: "smart", labelEn: "Smart", labelAr: "ذكي" },
  { value: "auto", labelEn: "Auto", labelAr: "تلقائي" },
];

const LOCATION_FACTOR_MAP: Record<string, number> = {
  urban: 0.95,
  suburban: 1.0,
  normal: 1.0,
  remote: 1.15,
  very_remote: 1.30,
};

const getInitialState = () => ({
  boqName: "",
  facilityName: "",
  facilityType: "",
  city: "",
  remotenessLevel: "normal",
  locationFactor: "1.00",
  pricingMode: "review",
  notes: "",
  packageCode: "",
  discipline: "",
  specialRemarks: "",
  file: null as File | null,
  ownerMaterials: false,
});

export default function CreateBoQDialog({ open, onOpenChange, projectId, projectCities }: CreateBoQDialogProps) {
  const { t, lang } = useLanguage();
  const qc = useQueryClient();
  const [form, setForm] = useState(getInitialState());
  const [phase, setPhase] = useState<SubmitPhase>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Independence Rule: full reset on every open
  useEffect(() => {
    if (open) {
      setForm(getInitialState());
      setPhase("idle");
      setErrorMsg("");
    }
  }, [open]);

  // Auto-update location factor when remoteness changes
  const handleRemotenessChange = (value: string) => {
    setForm(prev => ({
      ...prev,
      remotenessLevel: value,
      locationFactor: (LOCATION_FACTOR_MAP[value] ?? 1.0).toFixed(2),
    }));
  };

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const isLang = (l: string) => lang === l;

  const requiredFilled =
    form.boqName.trim() !== "" &&
    form.facilityName.trim() !== "" &&
    form.facilityType !== "" &&
    form.city.trim() !== "" &&
    form.remotenessLevel !== "" &&
    form.locationFactor.trim() !== "" &&
    form.pricingMode !== "" &&
    form.notes.trim() !== "" &&
    form.file !== null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setForm(prev => ({ ...prev, file }));
  };

  const handleSubmit = async () => {
    if (!requiredFilled) return;
    setPhase("creating");
    setErrorMsg("");

    try {
      // Phase 1: Create DB record
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: boqFile, error: insertError } = await supabase
        .from("boq_files")
        .insert({
          project_id: projectId,
          name: form.boqName.trim(),
          file_path: "",
          status: "draft",
          user_id: user.id,
          facility_name: form.facilityName.trim(),
          facility_type: form.facilityType,
          city: form.city.trim(),
          remoteness_level: form.remotenessLevel,
          location_factor: parseFloat(form.locationFactor) || 1.0,
          pricing_mode: form.pricingMode,
          notes: form.notes.trim(),
          package_code: form.packageCode.trim() || null,
          discipline: form.discipline.trim() || null,
          special_remarks: form.specialRemarks.trim() || null,
        } as any)
        .select()
        .single();

      if (insertError) throw new Error(`Record creation failed: ${insertError.message}`);

      const boqFileId = boqFile.id;

      // Phase 2: Upload file
      setPhase("uploading");
      const file = form.file!;
      const fileExt = file.name.split(".").pop()?.trim() || "xlsx";
      const safeName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${fileExt}`;
      const filePath = `${projectId}/${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("boq-files")
        .upload(filePath, file);

      if (uploadError) {
        await supabase.from("boq_files").update({ status: "failed" } as any).eq("id", boqFileId);
        throw new Error(`File upload failed: ${uploadError.message}`);
      }

      await supabase.from("boq_files").update({ file_path: filePath, status: "uploading" } as any).eq("id", boqFileId);

      // Phase 3: Parse and insert items
      setPhase("processing");
      const buffer = await file.arrayBuffer();
      const parsed = parseBoQExcel(buffer);

      if (parsed.length === 0) {
        await supabase.from("boq_files").update({ status: "failed" } as any).eq("id", boqFileId);
        throw new Error("No valid BoQ rows detected in the file.");
      }

      const items = parsed.map(row => ({
        boq_file_id: boqFileId,
        item_no: row.item_no,
        description: row.description,
        description_en: row.description_en,
        unit: row.unit,
        quantity: row.quantity,
        row_index: row.row_index,
        status: getRowPersistenceStatus(row),
        notes: getRowClassificationNote(row),
      }));

      for (let i = 0; i < items.length; i += 100) {
        const batch = items.slice(i, i + 100);
        const { error } = await supabase.from("boq_items").insert(batch);
        if (error) {
          // Cleanup on parse failure
          await supabase.from("boq_items").delete().eq("boq_file_id", boqFileId);
          await supabase.from("boq_files").update({ status: "failed" } as any).eq("id", boqFileId);
          throw new Error(`Failed to save items: ${error.message}`);
        }
      }

      await supabase.from("boq_files").update({ status: "ready" } as any).eq("id", boqFileId);

      // Update project boq_count
      const { data: allFiles } = await supabase
        .from("boq_files")
        .select("id")
        .eq("project_id", projectId);
      await supabase
        .from("projects")
        .update({ boq_count: allFiles?.length || 1, status: "active" })
        .eq("id", projectId);

      setPhase("done");
      toast.success(`${parsed.length} items parsed successfully`);
      qc.invalidateQueries({ queryKey: ["boq-files", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });

      setTimeout(() => onOpenChange(false), 800);
    } catch (err: any) {
      setPhase("error");
      setErrorMsg(err.message || "An error occurred");
      toast.error(err.message);
    }
  };

  const phaseLabel = {
    idle: "",
    creating: isLang("ar") ? "إنشاء السجل..." : "Creating record...",
    uploading: isLang("ar") ? "رفع الملف..." : "Uploading file...",
    processing: isLang("ar") ? "معالجة البيانات..." : "Processing items...",
    done: isLang("ar") ? "تم بنجاح!" : "Done!",
    error: isLang("ar") ? "فشل" : "Failed",
  };

  const isSubmitting = ["creating", "uploading", "processing"].includes(phase);

  return (
    <Dialog open={open} onOpenChange={isSubmitting ? undefined : onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("addNewBoQ")}</DialogTitle>
          <DialogDescription>{t("addNewBoQDesc")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {/* Required fields */}
          <div className="col-span-2">
            <Label>{t("boqName")} *</Label>
            <Input value={form.boqName} onChange={e => set("boqName", e.target.value)} placeholder={isLang("ar") ? "اسم جدول الكميات" : "BoQ Name"} disabled={isSubmitting} />
          </div>

          <div>
            <Label>{t("facilityName")} *</Label>
            <Input value={form.facilityName} onChange={e => set("facilityName", e.target.value)} placeholder={isLang("ar") ? "اسم المنشأة / المبنى" : "Facility / Building name"} disabled={isSubmitting} />
          </div>

          <div>
            <Label>{t("facilityType")} *</Label>
            <Select value={form.facilityType} onValueChange={v => set("facilityType", v)} disabled={isSubmitting}>
              <SelectTrigger><SelectValue placeholder={isLang("ar") ? "اختر النوع" : "Select type"} /></SelectTrigger>
              <SelectContent>
                {FACILITY_TYPES.map(ft => (
                  <SelectItem key={ft.value} value={ft.value}>{isLang("ar") ? ft.labelAr : ft.labelEn}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("cityLocation")} *</Label>
            {projectCities.length > 0 ? (
              <Select value={form.city} onValueChange={v => set("city", v)} disabled={isSubmitting}>
                <SelectTrigger><SelectValue placeholder={isLang("ar") ? "اختر المدينة" : "Select city"} /></SelectTrigger>
                <SelectContent>
                  {projectCities.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={form.city} onChange={e => set("city", e.target.value)} placeholder={isLang("ar") ? "المدينة" : "City"} disabled={isSubmitting} />
            )}
          </div>

          <div>
            <Label>{t("remotenessLevel")} *</Label>
            <Select value={form.remotenessLevel} onValueChange={handleRemotenessChange} disabled={isSubmitting}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REMOTENESS_LEVELS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{isLang("ar") ? r.labelAr : r.labelEn}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("locationFactorLabel")} *</Label>
            <Input type="number" step="0.01" min="0.5" max="3.0" value={form.locationFactor} onChange={e => set("locationFactor", e.target.value)} disabled={isSubmitting} />
          </div>

          <div>
            <Label>{t("pricingModeLabel")} *</Label>
            <Select value={form.pricingMode} onValueChange={v => set("pricingMode", v)} disabled={isSubmitting}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRICING_MODES.map(pm => (
                  <SelectItem key={pm.value} value={pm.value}>{isLang("ar") ? pm.labelAr : pm.labelEn}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label>{t("notesLabel")} *</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder={isLang("ar") ? "ملاحظات حول هذا الجدول..." : "Notes about this BoQ..."} rows={2} disabled={isSubmitting} />
          </div>

          {/* Optional fields */}
          <div>
            <Label>{t("packageCode")} <span className="text-muted-foreground text-xs">({t("optional")})</span></Label>
            <Input value={form.packageCode} onChange={e => set("packageCode", e.target.value)} placeholder="PKG-001" disabled={isSubmitting} />
          </div>

          <div>
            <Label>{t("disciplineCategory")} <span className="text-muted-foreground text-xs">({t("optional")})</span></Label>
            <Input value={form.discipline} onChange={e => set("discipline", e.target.value)} placeholder={isLang("ar") ? "مثل: ميكانيكي، كهربائي" : "e.g. Mechanical, Electrical"} disabled={isSubmitting} />
          </div>

          <div className="col-span-2">
            <Label>{t("specialRemarks")} <span className="text-muted-foreground text-xs">({t("optional")})</span></Label>
            <Textarea value={form.specialRemarks} onChange={e => set("specialRemarks", e.target.value)} rows={2} disabled={isSubmitting} />
          </div>

          {/* File upload */}
          <div className="col-span-2">
            <Label>{t("uploadBoQFile")} *</Label>
            <div className="mt-1">
              {form.file ? (
                <div className="flex items-center gap-2 text-sm p-2 border rounded-md bg-muted/30">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span className="truncate">{form.file.name}</span>
                  <Button variant="ghost" size="sm" className="ml-auto h-6 px-2" onClick={() => setForm(prev => ({ ...prev, file: null }))} disabled={isSubmitting}>
                    ✕
                  </Button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-md p-4 cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{isLang("ar") ? "اختر ملف Excel" : "Choose Excel file"}</span>
                  <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileSelect} disabled={isSubmitting} />
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Status feedback */}
        {phase !== "idle" && (
          <div className={`flex items-center gap-2 p-3 rounded-md text-sm ${phase === "error" ? "bg-destructive/10 text-destructive" : phase === "done" ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}>
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {phase === "done" && <CheckCircle className="w-4 h-4" />}
            {phase === "error" && <XCircle className="w-4 h-4" />}
            <span>{phaseLabel[phase]}</span>
            {errorMsg && <span className="text-xs ml-2">{errorMsg}</span>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!requiredFilled || isSubmitting}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {t("createAndUpload")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
