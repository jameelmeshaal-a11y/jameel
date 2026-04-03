import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCreateProject } from "@/hooks/useSupabase";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [cities, setCities] = useState("");
  const createProject = useCreateProject();

  const handleCreate = async () => {
    if (!name.trim()) return;

    try {
      const project = await createProject.mutateAsync({
        name: name.trim(),
        cities: cities.split(",").map(c => c.trim()).filter(Boolean),
      });
      toast.success(t("projectCreated"));
      setName("");
      setCities("");
      onOpenChange(false);
      navigate(`/projects/${project.id}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to create project");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createProject")}</DialogTitle>
          <DialogDescription>{t("createProjectDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>{t("projectName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("projectNamePlaceholder")} dir="auto" />
          </div>
          <div className="space-y-2">
            <Label>{t("projectCities")}</Label>
            <Input value={cities} onChange={(e) => setCities(e.target.value)} placeholder={t("projectCitiesPlaceholder")} dir="auto" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button onClick={handleCreate} disabled={!name.trim() || createProject.isPending}>
              {createProject.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
