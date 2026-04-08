import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Building2, MapPin, ArrowRight, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import AppLayout from "@/components/AppLayout";
import CreateProjectDialog from "@/components/CreateProjectDialog";
import { useProjects, useDeleteProject } from "@/hooks/useSupabase";
import { formatCurrency } from "@/lib/mockData";
import { useLanguage } from "@/contexts/LanguageContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const { data: projects = [], isLoading } = useProjects();
  const deleteProject = useDeleteProject();

  const handleDeleteProject = useCallback(async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteProject.mutateAsync(projectId);
      toast.success("تم حذف المشروع");
    } catch { toast.error("فشل حذف المشروع"); }
  }, [deleteProject]);

  const filterLabels: Record<string, string> = {
    all: t("all"),
    active: t("active"),
    draft: t("draft"),
    archived: t("archived"),
  };

  const filtered = projects.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    if (search && !p.name.includes(search) && !(p.cities || []).some(c => c.includes(search))) return false;
    return true;
  });

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">{t("projectsTitle")}</h1>
            <p className="page-subtitle">{t("projectsSubtitle")}</p>
          </div>
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            {t("newProject")}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {projects.length > 0 && (
              <div className="flex items-center gap-3 mb-6">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder={t("searchProjects")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>
                <div className="flex gap-1">
                  {Object.entries(filterLabels).map(([key, label]) => (
                    <Button key={key} variant={filter === key ? "default" : "ghost"} size="sm" onClick={() => setFilter(key)}>
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                  <FolderOpen className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-2">
                  {projects.length === 0 ? t("noProjectsYet") : t("noMatchingProjects")}
                </h2>
                <p className="text-muted-foreground max-w-md mb-6">
                  {projects.length === 0 ? t("createFirstProjectDesc") : t("noMatchingProjectsDesc")}
                </p>
                {projects.length === 0 && (
                  <Button className="gap-2" onClick={() => setCreateOpen(true)}>
                    <Plus className="w-4 h-4" /> {t("createFirstProject")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map((project) => (
                  <div key={project.id} onClick={() => navigate(`/projects/${project.id}`)} className="stat-card cursor-pointer group relative">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={project.status === "active" ? "default" : "secondary"}
                          className={project.status === "active" ? "bg-emerald-500 text-white" : ""}>
                          {project.status}
                        </Badge>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent dir="rtl" onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>حذف المشروع</AlertDialogTitle>
                              <AlertDialogDescription>
                                هل أنت متأكد من حذف مشروع "{project.name}" وجميع جداول الكميات المرتبطة؟ لا يمكن التراجع عن هذا الإجراء.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>إلغاء</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={(e) => handleDeleteProject(project.id, e)}>
                                حذف المشروع
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    <h3 className="font-semibold mb-2" dir="auto">{project.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                      <MapPin className="w-3 h-3" />
                      {(project.cities || []).join(", ")}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t">
                      <div className="text-xs text-muted-foreground">
                        {project.boq_count || 0} {t("boqFiles")}
                      </div>
                      {(project.total_value || 0) > 0 && (
                        <span className="text-sm font-bold">{formatCurrency(project.total_value)}</span>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-5 right-5" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </AppLayout>
  );
}
