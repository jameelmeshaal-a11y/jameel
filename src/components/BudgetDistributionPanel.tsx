import { useState, useEffect } from "react";
import { DollarSign, Percent, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBudgetDistribution, useUpsertBudgetDistribution } from "@/hooks/usePriceLibrary";
import { useAuth } from "@/contexts/AuthContext";
import { formatNumber } from "@/lib/mockData";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  projectId: string;
}

export default function BudgetDistributionPanel({ projectId }: Props) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { data: existing, isLoading } = useBudgetDistribution(projectId);
  const upsert = useUpsertBudgetDistribution();

  const [total, setTotal] = useState(0);
  const [pcts, setPcts] = useState({ materials: 45, labor: 30, equipment: 15, other: 10 });
  const [amounts, setAmounts] = useState({ materials: 0, labor: 0, equipment: 0, other: 0 });

  useEffect(() => {
    if (existing) {
      setTotal(existing.total_amount);
      setPcts({
        materials: existing.materials_percentage,
        labor: existing.labor_percentage,
        equipment: existing.equipment_percentage,
        other: existing.other_percentage,
      });
      setAmounts({
        materials: existing.materials_amount,
        labor: existing.labor_amount,
        equipment: existing.equipment_amount,
        other: existing.other_amount,
      });
    }
  }, [existing]);

  const sum = pcts.materials + pcts.labor + pcts.equipment + pcts.other;

  const distribute = () => {
    if (Math.abs(sum - 100) > 0.01) {
      toast.error("مجموع النسب يجب أن يساوي 100%");
      return;
    }
    const newAmounts = {
      materials: +(total * pcts.materials / 100).toFixed(2),
      labor: +(total * pcts.labor / 100).toFixed(2),
      equipment: +(total * pcts.equipment / 100).toFixed(2),
      other: +(total * pcts.other / 100).toFixed(2),
    };
    setAmounts(newAmounts);

    upsert.mutate({
      id: existing?.id,
      project_id: projectId,
      user_id: user!.id,
      total_amount: total,
      materials_percentage: pcts.materials,
      labor_percentage: pcts.labor,
      equipment_percentage: pcts.equipment,
      other_percentage: pcts.other,
    }, {
      onSuccess: () => toast.success("تم توزيع الميزانية بنجاح"),
      onError: () => toast.error("فشل في حفظ التوزيع"),
    });
  };

  if (isLoading) return null;

  const fields = [
    { key: "materials" as const, label: "المواد", icon: "🧱" },
    { key: "labor" as const, label: "العمالة", icon: "👷" },
    { key: "equipment" as const, label: "المعدات", icon: "🏗️" },
    { key: "other" as const, label: "أخرى", icon: "📦" },
  ];

  return (
    <div className="border rounded-lg p-4 bg-card mb-4">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-sm">توزيع الميزانية</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
        <div className="md:col-span-2">
          <Label className="text-xs">المبلغ الإجمالي (SAR)</Label>
          <Input
            type="number"
            value={total || ""}
            onChange={(e) => setTotal(+e.target.value)}
            placeholder="0"
            className="font-mono"
          />
        </div>

        {fields.map((f) => (
          <div key={f.key}>
            <Label className="text-xs">{f.icon} {f.label} (%)</Label>
            <Input
              type="number"
              value={pcts[f.key] || ""}
              onChange={(e) => setPcts({ ...pcts, [f.key]: +e.target.value })}
              className="font-mono text-sm"
              min={0}
              max={100}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-3">
        <Button onClick={distribute} disabled={upsert.isPending || total <= 0} size="sm" className="gap-2">
          <DollarSign className="w-4 h-4" /> توزيع تلقائي
        </Button>
        <span className={`text-xs ${Math.abs(sum - 100) > 0.01 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
          المجموع: {sum}%
        </span>
      </div>

      {amounts.materials + amounts.labor + amounts.equipment + amounts.other > 0 && (
        <div className="grid grid-cols-4 gap-2 mt-4">
          {fields.map((f) => (
            <div key={f.key} className="text-center p-2 rounded-md bg-muted/50">
              <div className="text-xs text-muted-foreground">{f.label}</div>
              <div className="font-mono text-sm font-semibold">{formatNumber(amounts[f.key])}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
