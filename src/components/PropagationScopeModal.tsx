import { useState, useEffect } from "react";
import { X, ArrowRight, Globe, FolderOpen, FileEdit, Shield, AlertTriangle, Loader2, Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/mockData";
import type { BreakdownValues } from "@/lib/pricing/smartRecalculator";
import type { ChangeScope, EditType } from "@/lib/pricing/propagationService";
import type { SimilarItem } from "@/lib/pricing/similarItemMatcher";
import { findSimilarInProject, findSimilarGlobally } from "@/lib/pricing/similarItemMatcher";

interface Props {
  item: {
    id: string;
    item_no: string;
    description: string;
    description_en: string;
    unit: string;
    unit_rate: number | null;
    status: string;
    source: string | null;
    linked_rate_id?: string | null;
  };
  newValues: BreakdownValues;
  newUnitRate: number;
  boqFileId: string;
  projectId: string;
  onConfirm: (scope: ChangeScope, editType: EditType, reason: string, targets: SimilarItem[], updateMaster: boolean) => void;
  onCancel: () => void;
}

export default function PropagationScopeModal({ item, newValues, newUnitRate, boqFileId, projectId, onConfirm, onCancel }: Props) {
  const [scope, setScope] = useState<ChangeScope>("item_only");
  const [editType, setEditType] = useState<EditType>("project_override");
  const [reason, setReason] = useState("");
  const [updateMaster, setUpdateMaster] = useState(false);
  const [projectSimilar, setProjectSimilar] = useState<SimilarItem[]>([]);
  const [globalSimilar, setGlobalSimilar] = useState<SimilarItem[]>([]);
  const [loading, setLoading] = useState(false);

  const isLocked = item.status === "approved" || item.source === "locked";

  useEffect(() => {
    setLoading(true);
    Promise.all([
      findSimilarInProject(item, boqFileId),
      findSimilarGlobally(item),
    ]).then(([proj, glob]) => {
      setProjectSimilar(proj);
      setGlobalSimilar(glob);
      setLoading(false);
    });
  }, [item, boqFileId]);

  const targets = scope === "project" ? projectSimilar : scope === "global" ? globalSimilar : [];
  const rateChange = item.unit_rate ? ((newUnitRate - item.unit_rate) / item.unit_rate * 100).toFixed(1) : "N/A";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-card rounded-xl shadow-xl border w-full max-w-2xl mx-4 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h3 className="font-semibold text-lg">Choose Pricing Update Type</h3>
            <span className="text-xs text-muted-foreground">Item {item.item_no} — {item.description_en || item.description}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel}><X className="w-4 h-4" /></Button>
        </div>

        <div className="p-5 space-y-5">
          {/* Price Change Summary */}
          <div className="flex items-center gap-4 p-3 rounded-lg bg-secondary">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Current Rate</div>
              <div className="font-mono font-semibold">{formatNumber(item.unit_rate || 0)}</div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <div className="text-center">
              <div className="text-xs text-muted-foreground">New Rate</div>
              <div className="font-mono font-semibold text-primary">{formatNumber(newUnitRate)}</div>
            </div>
            <Badge variant={Number(rateChange) > 0 ? "destructive" : "default"} className="ml-auto">
              {rateChange}%
            </Badge>
          </div>

          {isLocked && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm">
              <Lock className="w-4 h-4 text-warning" />
              <span>This item is <strong>locked/approved</strong>. Changes require confirmation.</span>
            </div>
          )}

          {/* Edit Type Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">Edit Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                className={`p-4 rounded-lg border-2 text-left transition-all ${editType === "project_override" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                onClick={() => { setEditType("project_override"); setUpdateMaster(false); }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <FolderOpen className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">Project Override</span>
                </div>
                <p className="text-xs text-muted-foreground">Temporary — affects this project only</p>
              </button>
              <button
                className={`p-4 rounded-lg border-2 text-left transition-all ${editType === "master_update" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                onClick={() => setEditType("master_update")}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">Master Rate Update</span>
                </div>
                <p className="text-xs text-muted-foreground">Permanent — updates company rate library</p>
              </button>
            </div>
          </div>

          {/* Scope Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">Change Scope</label>
            <div className="space-y-2">
              {[
                { value: "item_only" as const, label: "This item only", icon: FileEdit, count: 1 },
                { value: "project" as const, label: "Similar items in this project", icon: FolderOpen, count: projectSimilar.length },
                { value: "global" as const, label: "Similar items across all projects", icon: Globe, count: globalSimilar.length },
              ].map(opt => (
                <button
                  key={opt.value}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${scope === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  onClick={() => setScope(opt.value)}
                  disabled={opt.value !== "item_only" && opt.count === 0}
                >
                  <opt.icon className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm font-medium">{opt.label}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {loading && opt.value !== "item_only" ? <Loader2 className="w-3 h-3 animate-spin" /> : `${opt.count} items`}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          {/* Preview affected items */}
          {scope !== "item_only" && targets.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-secondary text-xs font-medium flex items-center justify-between">
                <span>Affected Items Preview</span>
                <span className="text-muted-foreground">{targets.length} items</span>
              </div>
              <div className="max-h-40 overflow-auto">
                {targets.slice(0, 10).map(t => (
                  <div key={t.id} className="px-3 py-2 border-t text-xs flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-muted-foreground mr-2">{t.item_no}</span>
                      <span className="truncate">{t.description_en || t.description}</span>
                      {t.project_name && <Badge variant="outline" className="ml-2 text-[10px]">{t.project_name}</Badge>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-mono">{formatNumber(t.unit_rate || 0)}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="font-mono text-primary">{formatNumber(newUnitRate)}</span>
                      <Badge variant="secondary" className="text-[10px]">{t.confidence}%</Badge>
                    </div>
                  </div>
                ))}
                {targets.length > 10 && (
                  <div className="px-3 py-2 border-t text-xs text-muted-foreground text-center">
                    +{targets.length - 10} more items
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Master rate update option */}
          {editType === "master_update" && (
            <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-secondary/50">
              <input
                type="checkbox"
                checked={updateMaster}
                onChange={e => setUpdateMaster(e.target.checked)}
                className="rounded"
              />
              <div>
                <div className="text-sm font-medium">Update Master Approved Rate</div>
                <div className="text-xs text-muted-foreground">Permanently update the rate library for all future pricing</div>
              </div>
              <Shield className="w-4 h-4 text-warning ml-auto" />
            </label>
          )}

          {/* Reason */}
          <div>
            <label className="text-sm font-medium mb-1 block">Reason for change {editType === "master_update" && <span className="text-destructive">*</span>}</label>
            <Textarea
              placeholder="e.g., Updated supplier quote, project-specific logistics, market correction..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="h-20 text-sm"
            />
          </div>

          {/* Warnings */}
          {scope === "global" && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30 text-xs">
              <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <span>Global propagation will affect items across <strong>all projects</strong>. This action cannot be easily undone.</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={() => onConfirm(scope, editType, reason, targets, updateMaster)}
              disabled={editType === "master_update" && !reason.trim()}
            >
              Apply Changes ({scope === "item_only" ? "1 item" : `${targets.length + 1} items`})
            </Button>
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
