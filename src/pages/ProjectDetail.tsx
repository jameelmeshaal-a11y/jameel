import { useParams, useNavigate } from "react-router-dom";
import { useState, useMemo } from "react";
import { ArrowLeft, FileText, FolderOpen, Settings, Loader2, Plus, ChevronDown, ChevronRight, Building2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AppLayout from "@/components/AppLayout";
import BoQTable from "@/components/BoQTable";
import DocumentsTab from "@/components/DocumentsTab";
import CreateBoQDialog from "@/components/CreateBoQDialog";
import BudgetDistributionPanel from "@/components/BudgetDistributionPanel";
import { useProject, useBoQFiles } from "@/hooks/useSupabase";
import { formatCurrency } from "@/lib/mockData";
import { useLanguage } from "@/contexts/LanguageContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("boq");
  const [createBoQOpen, setCreateBoQOpen] = useState(false);
  const [selectedBoQFileId, setSelectedBoQFileId] = useState<string | null>(null);
  const [collapsedFacilities, setCollapsedFacilities] = useState<Set<string>>(new Set());

  const { data: project, isLoading } = useProject(id);
  const { data: boqFiles = [], isLoading: boqFilesLoading } = useBoQFiles(id);

  // Group BoQ files by facility_name
  const facilityGroups = useMemo(() => {
    const groups: Record<string, typeof boqFiles> = {};
    for (const file of boqFiles) {
      const key = (file as any).facility_name || t("ungroupedFacility");
      if (!groups[key]) groups[key] = [];
      groups[key].push(file);
    }
    return groups;
  }, [boqFiles, t]);

  const toggleFacility = (name: string) => {
    setCollapsedFacilities(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const tabs = [
    { id: "boq", label: t("billsOfQuantities"), icon: FileText },
    { id: "budget", label: "الميزانية", icon: Building2 },
    { id: "documents", label: t("documents"), icon: FolderOpen },
    { id: "settings", label: t("projectSettings"), icon: Settings },
  ];

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-6">
            <FolderOpen className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">{t("projectNotFound")}</h2>
          <p className="text-muted-foreground max-w-md mb-6">{t("projectNotFoundDesc")}</p>
          <Button onClick={() => navigate("/projects")} className="gap-2">{t("goToProjects")}</Button>
        </div>
      </AppLayout>
    );
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "ready": case "parsed": case "priced": return "bg-emerald-500 text-white";
      case "failed": case "error": return "bg-destructive text-destructive-foreground";
      case "processing": case "uploading": return "bg-amber-500 text-white";
      default: return "";
    }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/projects")} className="gap-1 mb-3 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> {t("backToProjects")}
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="page-title" dir="auto">{project.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <Badge variant={project.status === "active" ? "default" : "secondary"}
                  className={project.status === "active" ? "bg-emerald-500 text-white" : ""}>
                  {project.status}
                </Badge>
                <span className="text-sm text-muted-foreground">{(project.cities || []).join(", ")}</span>
                {project.total_value > 0 && (
                  <span className="text-sm font-semibold">{formatCurrency(project.total_value)}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-1 border-b mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSelectedBoQFileId(null); }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "boq" && (
          <div>
            {/* Add New BoQ button — project level */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t("billsOfQuantities")}</h3>
              <Button className="gap-2" onClick={() => setCreateBoQOpen(true)}>
                <Plus className="w-4 h-4" /> {t("addNewBoQ")}
              </Button>
            </div>

            {/* BoQ files grouped by facility */}
            {boqFilesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : boqFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                  <FileText className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t("noBoQFiles")}</h3>
                <p className="text-muted-foreground max-w-sm mb-5">{t("noBoQDesc")}</p>
                <Button className="gap-2" onClick={() => setCreateBoQOpen(true)}>
                  <Plus className="w-4 h-4" /> {t("addNewBoQ")}
                </Button>
              </div>
            ) : (
              <div className="space-y-3 mb-6">
                {Object.entries(facilityGroups).map(([facilityName, files]) => (
                  <Collapsible
                    key={facilityName}
                    open={!collapsedFacilities.has(facilityName)}
                    onOpenChange={() => toggleFacility(facilityName)}
                  >
                    <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm flex-1 text-left">{facilityName}</span>
                      <Badge variant="secondary" className="text-xs">{files.length}</Badge>
                      {!collapsedFacilities.has(facilityName)
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      }
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1 ml-6 space-y-2">
                      {files.map(file => (
                        <button
                          key={file.id}
                          onClick={() => setSelectedBoQFileId(file.id)}
                          className={`flex flex-col w-full p-3 rounded-md text-sm transition-colors border ${
                            selectedBoQFileId === file.id
                              ? "bg-primary/10 border-primary/30"
                              : "border-transparent hover:bg-muted/50 hover:border-border"
                          }`}
                        >
                          <div className="flex items-center gap-3 w-full">
                            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="flex-1 text-left font-medium truncate" dir="auto">{file.name}</span>
                            <Badge variant="secondary" className={`text-[10px] ${statusColor(file.status)}`}>
                              {file.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 ml-7 text-xs text-muted-foreground">
                            {(file as any).facility_name && (
                              <span dir="auto">🏢 {(file as any).facility_name}</span>
                            )}
                            {(file as any).city && (
                              <span>📍 {(file as any).city}</span>
                            )}
                            {(file as any).package_code && (
                              <span>📦 {(file as any).package_code}</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            )}

            {/* Selected BoQ table */}
            {selectedBoQFileId ? (
              (() => {
                const selectedFile = boqFiles.find(f => f.id === selectedBoQFileId);
                const isOwnerMaterials = !!(selectedFile as any)?.owner_materials;
                return <BoQTable boqFileId={selectedBoQFileId} projectId={project.id} cities={project.cities || []} ownerMaterials={isOwnerMaterials} />;
              })()
            ) : boqFiles.length > 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center border rounded-lg bg-muted/20">
                <FileText className="w-8 h-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">{t("selectBoQ")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("selectBoQDesc")}</p>
              </div>
            ) : null}

            <CreateBoQDialog
              open={createBoQOpen}
              onOpenChange={setCreateBoQOpen}
              projectId={project.id}
              projectCities={project.cities || []}
            />
          </div>
        )}

        {activeTab === "documents" && <DocumentsTab projectId={project.id} />}
        {activeTab === "settings" && (
          <div className="stat-card">
            <h3 className="font-semibold mb-4">{t("projectSettings")}</h3>
            <p className="text-sm text-muted-foreground">{t("projectSettingsDesc")}</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
