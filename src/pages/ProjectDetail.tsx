import { useParams, useNavigate } from "react-router-dom";
import { useState, useMemo, useCallback } from "react";
import { ArrowLeft, FileText, FolderOpen, Settings, Loader2, Plus, ChevronDown, ChevronRight, Building2, DollarSign, Archive, ArchiveRestore, Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import AppLayout from "@/components/AppLayout";
import BoQTable from "@/components/BoQTable";
import DocumentsTab from "@/components/DocumentsTab";
import CreateBoQDialog from "@/components/CreateBoQDialog";
import BudgetDistributionPanel from "@/components/BudgetDistributionPanel";
import ProjectBoQSummary from "@/components/ProjectBoQSummary";
import { useProject, useBoQFiles, useBoQItems, useDeleteBoQ, useDeleteProject, useArchiveBoQ, useRestoreBoQ, useRenameBoQ } from "@/hooks/useSupabase";
import { formatCurrency } from "@/lib/mockData";
import { useLanguage } from "@/contexts/LanguageContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

function PricingStatusBadge({ boqFileId }: { boqFileId: string }) {
  const { data: items = [] } = useBoQItems(boqFileId);
  const priceable = items.filter(i => i.quantity > 0 && i.unit && i.item_no);
  const priced = priceable.filter(i => i.unit_rate && i.unit_rate > 0);

  if (priceable.length === 0) return null;

  if (priced.length === 0) return <Badge variant="destructive" className="text-[10px]">غير مسعّر</Badge>;
  if (priced.length === priceable.length) return <Badge className="text-[10px] bg-emerald-500 text-white">مسعّر بالكامل</Badge>;
  return <Badge variant="secondary" className="text-[10px] bg-amber-500 text-white">مسعّر جزئياً ({priced.length}/{priceable.length})</Badge>;
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("boq");
  const [createBoQOpen, setCreateBoQOpen] = useState(false);
  const [selectedBoQFileId, setSelectedBoQFileId] = useState<string | null>(null);
  const [collapsedFacilities, setCollapsedFacilities] = useState<Set<string>>(new Set());
  const [boqListFilter, setBoqListFilter] = useState<"active" | "archived">("active");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const { data: project, isLoading } = useProject(id);
  const { data: boqFiles = [], isLoading: boqFilesLoading } = useBoQFiles(id);

  const deleteBoQ = useDeleteBoQ();
  const deleteProject = useDeleteProject();
  const archiveBoQ = useArchiveBoQ();
  const restoreBoQ = useRestoreBoQ();
  const renameBoQ = useRenameBoQ();

  const activeFiles = useMemo(() => boqFiles.filter(f => !(f as any).is_archived), [boqFiles]);
  const archivedFiles = useMemo(() => boqFiles.filter(f => (f as any).is_archived), [boqFiles]);
  const displayedFiles = boqListFilter === "active" ? activeFiles : archivedFiles;

  // Group BoQ files by facility_name
  const facilityGroups = useMemo(() => {
    const groups: Record<string, typeof displayedFiles> = {};
    for (const file of displayedFiles) {
      const key = (file as any).facility_name || t("ungroupedFacility");
      if (!groups[key]) groups[key] = [];
      groups[key].push(file);
    }
    return groups;
  }, [displayedFiles, t]);

  const toggleFacility = (name: string) => {
    setCollapsedFacilities(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleDeleteBoQ = useCallback(async (boqId: string) => {
    try {
      await deleteBoQ.mutateAsync(boqId);
      if (selectedBoQFileId === boqId) setSelectedBoQFileId(null);
      toast.success("تم حذف جدول الكميات");
    } catch { toast.error("فشل حذف جدول الكميات"); }
  }, [deleteBoQ, selectedBoQFileId]);

  const handleDeleteProject = useCallback(async () => {
    if (!id) return;
    try {
      await deleteProject.mutateAsync(id);
      navigate("/projects");
      toast.success("تم حذف المشروع");
    } catch { toast.error("فشل حذف المشروع"); }
  }, [deleteProject, id, navigate]);

  const handleArchive = useCallback(async (boqId: string) => {
    try {
      await archiveBoQ.mutateAsync(boqId);
      if (selectedBoQFileId === boqId) setSelectedBoQFileId(null);
      toast.success("تم أرشفة جدول الكميات");
    } catch { toast.error("فشل أرشفة جدول الكميات"); }
  }, [archiveBoQ, selectedBoQFileId]);

  const handleRestore = useCallback(async (boqId: string) => {
    try {
      await restoreBoQ.mutateAsync(boqId);
      toast.success("تم استعادة جدول الكميات");
    } catch { toast.error("فشل استعادة جدول الكميات"); }
  }, [restoreBoQ]);

  const handleRenameSubmit = useCallback(async (boqId: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    try {
      await renameBoQ.mutateAsync({ id: boqId, name: renameValue.trim() });
      toast.success("تم تحديث الاسم");
    } catch { toast.error("فشل تحديث الاسم"); }
    setRenamingId(null);
  }, [renameBoQ, renameValue]);

  const selectedFile = useMemo(() => boqFiles.find(f => f.id === selectedBoQFileId), [boqFiles, selectedBoQFileId]);

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

  const isArchived = !!(selectedFile as any)?.is_archived;

  return (
    <AppLayout>
      <div className="animate-fade-in">
        {/* Breadcrumb */}
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/projects" onClick={(e) => { e.preventDefault(); navigate("/projects"); }}>
                المشاريع
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {selectedBoQFileId ? (
                <BreadcrumbLink href="#" onClick={(e) => { e.preventDefault(); setSelectedBoQFileId(null); }}>
                  {project.name}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{project.name}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {selectedFile && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{selectedFile.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mb-6">
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
            {/* Header + active/archived tabs */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">{t("billsOfQuantities")}</h3>
                <Tabs value={boqListFilter} onValueChange={(v) => { setBoqListFilter(v as any); setSelectedBoQFileId(null); }}>
                  <TabsList>
                    <TabsTrigger value="active">نشط ({activeFiles.length})</TabsTrigger>
                    <TabsTrigger value="archived">مؤرشف ({archivedFiles.length})</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              {boqListFilter === "active" && (
                <Button className="gap-2" onClick={() => setCreateBoQOpen(true)}>
                  <Plus className="w-4 h-4" /> {t("addNewBoQ")}
                </Button>
              )}
            </div>

            {/* Project BoQ Summary */}
            {!selectedBoQFileId && <ProjectBoQSummary projectId={project.id} />}

            {/* BoQ files grouped by facility */}
            {boqFilesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : displayedFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                  <FileText className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {boqListFilter === "active" ? t("noBoQFiles") : "لا توجد ملفات مؤرشفة"}
                </h3>
                <p className="text-muted-foreground max-w-sm mb-5">
                  {boqListFilter === "active" ? t("noBoQDesc") : "لم يتم أرشفة أي جدول كميات بعد"}
                </p>
                {boqListFilter === "active" && (
                  <Button className="gap-2" onClick={() => setCreateBoQOpen(true)}>
                    <Plus className="w-4 h-4" /> {t("addNewBoQ")}
                  </Button>
                )}
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
                        <div
                          key={file.id}
                          className={`flex flex-col w-full p-3 rounded-md text-sm transition-colors border ${
                            selectedBoQFileId === file.id
                              ? "bg-primary/10 border-primary/30"
                              : "border-transparent hover:bg-muted/50 hover:border-border"
                          }`}
                        >
                          <div className="flex items-center gap-3 w-full">
                            <button onClick={() => setSelectedBoQFileId(file.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                              {renamingId === file.id ? (
                                <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                                  <Input
                                    value={renameValue}
                                    onChange={e => setRenameValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") handleRenameSubmit(file.id); if (e.key === "Escape") setRenamingId(null); }}
                                    className="h-7 text-sm"
                                    autoFocus
                                  />
                                  <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => handleRenameSubmit(file.id)}><Check className="w-3 h-3" /></Button>
                                  <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => setRenamingId(null)}><X className="w-3 h-3" /></Button>
                                </div>
                              ) : (
                                <span className="flex-1 font-medium truncate" dir="auto">{file.name}</span>
                              )}
                            </button>
                            <PricingStatusBadge boqFileId={file.id} />
                            <Badge variant="secondary" className={`text-[10px] ${statusColor(file.status)}`}>
                              {file.status}
                            </Badge>
                            {/* Action buttons */}
                            <div className="flex items-center gap-0.5">
                              {renamingId !== file.id && (
                                <Button variant="ghost" size="icon" className="w-7 h-7" title="إعادة تسمية"
                                  onClick={(e) => { e.stopPropagation(); setRenamingId(file.id); setRenameValue(file.name); }}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {boqListFilter === "active" ? (
                                <Button variant="ghost" size="icon" className="w-7 h-7" title="أرشفة"
                                  onClick={(e) => { e.stopPropagation(); handleArchive(file.id); }}>
                                  <Archive className="w-3.5 h-3.5" />
                                </Button>
                              ) : (
                                <Button variant="ghost" size="icon" className="w-7 h-7" title="استعادة"
                                  onClick={(e) => { e.stopPropagation(); handleRestore(file.id); }}>
                                  <ArchiveRestore className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive" title="حذف"
                                    onClick={(e) => e.stopPropagation()}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent dir="rtl">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>حذف جدول الكميات</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      هل أنت متأكد من حذف "{file.name}"؟ سيتم حذف جميع البنود المرتبطة. لا يمكن التراجع عن هذا الإجراء.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDeleteBoQ(file.id)}>حذف</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
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
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            )}

            {/* Selected BoQ table */}
            {selectedBoQFileId ? (
              (() => {
                const isOwnerMaterials = !!(selectedFile as any)?.owner_materials;
                return (
                  <div>
                    {isArchived && (
                      <div className="rounded-lg border border-amber-500 bg-amber-500/10 p-3 mb-4 flex items-center gap-2">
                        <Archive className="w-5 h-5 text-amber-600" />
                        <span className="text-sm font-medium text-amber-700">هذا الجدول مؤرشف — للقراءة والتصدير فقط</span>
                      </div>
                    )}
                    <BoQTable boqFileId={selectedBoQFileId} projectId={project.id} cities={project.cities || []} ownerMaterials={isOwnerMaterials} isArchived={isArchived} />
                  </div>
                );
              })()
            ) : displayedFiles.length > 0 ? (
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

        {activeTab === "budget" && (
          <div className="max-w-3xl">
            <BudgetDistributionPanel projectId={project.id} />
          </div>
        )}

        {activeTab === "documents" && <DocumentsTab projectId={project.id} />}
        {activeTab === "settings" && (
          <div className="stat-card">
            <h3 className="font-semibold mb-4">{t("projectSettings")}</h3>
            <p className="text-sm text-muted-foreground mb-6">{t("projectSettingsDesc")}</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2">
                  <Trash2 className="w-4 h-4" /> حذف المشروع
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>حذف المشروع</AlertDialogTitle>
                  <AlertDialogDescription>
                    هل أنت متأكد من حذف مشروع "{project.name}" وجميع جداول الكميات المرتبطة؟ لا يمكن التراجع عن هذا الإجراء.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteProject}>
                    حذف المشروع وجميع ملفاته
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
