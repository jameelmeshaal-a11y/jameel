import { useNavigate } from "react-router-dom";
import { Plus, Search, Building2, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import AppLayout from "@/components/AppLayout";
import { sampleProjects, formatCurrency } from "@/lib/mockData";
import { useState } from "react";

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const filtered = sampleProjects.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    if (search && !p.name.includes(search) && !p.cities.some(c => c.includes(search))) return false;
    return true;
  });

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Projects</h1>
            <p className="page-subtitle">Manage your construction estimation projects</p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1">
            {["all", "active", "draft", "archived"].map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "ghost"}
                size="sm"
                onClick={() => setFilter(f)}
                className="capitalize"
              >
                {f}
              </Button>
            ))}
          </div>
        </div>

        {/* Project grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((project) => (
            <div
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="stat-card cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <Badge
                  variant={project.status === 'active' ? 'default' : 'secondary'}
                  className={project.status === 'active' ? 'bg-success text-success-foreground' : ''}
                >
                  {project.status}
                </Badge>
              </div>
              <h3 className="font-semibold mb-2" dir="rtl">{project.name}</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                <MapPin className="w-3 h-3" />
                {project.cities.join(", ")}
              </div>
              <div className="flex items-center justify-between pt-3 border-t">
                <div className="text-xs text-muted-foreground">
                  {project.boqCount} BoQ files • Updated {project.lastUpdated}
                </div>
                {project.totalValue > 0 && (
                  <span className="text-sm font-bold">{formatCurrency(project.totalValue)}</span>
                )}
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-5 right-5" />
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
