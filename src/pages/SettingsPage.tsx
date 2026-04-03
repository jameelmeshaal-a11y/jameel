import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLayout from "@/components/AppLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { sampleProjects, sampleRateLibrary } from "@/lib/mockData";

export default function SettingsPage() {
  const { t, lang, setLang } = useLanguage();

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">{t("settingsTitle")}</h1>
            <p className="page-subtitle">{t("settingsSubtitle")}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Language */}
          <div className="stat-card">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4" /> {t("language")}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">{t("languageDesc")}</p>
            <div className="flex gap-2">
              <Button
                variant={lang === "en" ? "default" : "outline"}
                size="sm"
                onClick={() => setLang("en")}
              >
                {t("english")}
              </Button>
              <Button
                variant={lang === "ar" ? "default" : "outline"}
                size="sm"
                onClick={() => setLang("ar")}
              >
                {t("arabicLang")}
              </Button>
            </div>
          </div>

          {/* Location Factors */}
          <div className="stat-card">
            <h3 className="font-semibold mb-3">{t("locationFactors")}</h3>
            <div className="space-y-3">
              {[
                { city: "Riyadh (الرياض)", factor: "1.00", base: true },
                { city: "Makkah (مكة المكرمة)", factor: "1.05" },
                { city: "Jeddah (جدة)", factor: "1.03" },
                { city: "Aseer (عسير)", factor: "1.15" },
                { city: "Tabuk (تبوك)", factor: "1.12" },
              ].map((loc) => (
                <div key={loc.city} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="text-sm">{loc.city}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">×{loc.factor}</span>
                    {loc.base && <span className="text-[10px] text-primary font-medium uppercase">{t("base")}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Default Pricing Mode */}
          <div className="stat-card">
            <h3 className="font-semibold mb-3">{t("defaultPricingMode")}</h3>
            <div className="space-y-3 text-sm">
              <div className="p-3 rounded-lg border-2 border-primary bg-primary/5">
                <div className="font-medium">{t("review")}</div>
                <p className="text-xs text-muted-foreground mt-1">{t("reviewModeDesc")}</p>
              </div>
              <div className="p-3 rounded-lg border">
                <div className="font-medium">{t("smart")}</div>
                <p className="text-xs text-muted-foreground mt-1">{t("smartModeDesc")}</p>
              </div>
              <div className="p-3 rounded-lg border">
                <div className="font-medium">{t("auto")}</div>
                <p className="text-xs text-muted-foreground mt-1">{t("autoModeDesc")}</p>
              </div>
            </div>
          </div>

          {/* Profit & Risk */}
          <div className="stat-card">
            <h3 className="font-semibold mb-3">{t("profitRiskDefaults")}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>{t("defaultProfitMargin")}</span>
                <span className="font-mono font-medium">5%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("defaultRiskFactor")}</span>
                <span className="font-mono font-medium">3%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("confidenceThreshold")}</span>
                <span className="font-mono font-medium">80%</span>
              </div>
            </div>
          </div>

          {/* System Info */}
          <div className="stat-card">
            <h3 className="font-semibold mb-3">{t("systemInfo")}</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>{t("rateLibraryItems")}</span>
                <span className="font-medium text-foreground">{sampleRateLibrary.length}</span>
              </div>
              <div className="flex justify-between">
                <span>{t("totalProjects")}</span>
                <span className="font-medium text-foreground">{sampleProjects.length}</span>
              </div>
              <div className="flex justify-between">
                <span>{t("aiEngine")}</span>
                <span className="font-medium text-foreground">{t("ready")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
