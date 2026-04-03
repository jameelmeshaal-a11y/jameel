import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { sampleProjects } from "@/lib/mockData";
import type { Project } from "@/lib/mockData";
import { toast } from "sonner";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [cities, setCities] = useState("");

  const handleCreate = () => {
    if (!name.trim()) return;

    const newProject: Project = {
      id: crypto.randomUUID(),
      name: name.trim(),
      cities: cities.split(",").map(c => c.trim()).filter(Boolean),
      status: "draft",
      boqCount: 0,
      totalValue: 0,
      lastUpdated: new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString().split("T")[0],
    };

    sampleProjects.push(newProject);
    toast.success(t("projectCreated"));
    setName("");
    setCities("");
    onOpenChange(false);
    navigate(`/projects/${newProject.id}`);
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
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("projectNamePlaceholder")}
              dir="auto"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("projectCities")}</Label>
            <Input
              value={cities}
              onChange={(e) => setCities(e.target.value)}
              placeholder={t("projectCitiesPlaceholder")}
              dir="auto"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim()}>
              {t("create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
