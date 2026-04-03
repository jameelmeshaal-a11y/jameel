import AppLayout from "@/components/AppLayout";

export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">System configuration and preferences</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="stat-card">
            <h3 className="font-semibold mb-3">Location Factors</h3>
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
                    {loc.base && <span className="text-[10px] text-primary font-medium uppercase">Base</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="stat-card">
            <h3 className="font-semibold mb-3">Default Pricing Mode</h3>
            <div className="space-y-3 text-sm">
              <div className="p-3 rounded-lg border-2 border-primary bg-primary/5">
                <div className="font-medium">Review Mode</div>
                <p className="text-xs text-muted-foreground mt-1">Price all items, mark low-confidence for review, require user approval</p>
              </div>
              <div className="p-3 rounded-lg border">
                <div className="font-medium">Smart Mode</div>
                <p className="text-xs text-muted-foreground mt-1">Auto-approve high confidence, flag only uncertain items</p>
              </div>
              <div className="p-3 rounded-lg border">
                <div className="font-medium">Auto Mode</div>
                <p className="text-xs text-muted-foreground mt-1">Fully automatic pricing, no review required</p>
              </div>
            </div>
          </div>

          <div className="stat-card">
            <h3 className="font-semibold mb-3">Profit & Risk Defaults</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>Default Profit Margin</span>
                <span className="font-mono font-medium">5%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Default Risk Factor</span>
                <span className="font-mono font-medium">3%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Confidence Threshold (Review)</span>
                <span className="font-mono font-medium">80%</span>
              </div>
            </div>
          </div>

          <div className="stat-card">
            <h3 className="font-semibold mb-3">System Info</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between"><span>Rate Library Items</span><span className="font-medium text-foreground">8</span></div>
              <div className="flex justify-between"><span>Total Projects</span><span className="font-medium text-foreground">5</span></div>
              <div className="flex justify-between"><span>AI Engine</span><span className="font-medium text-foreground">Ready</span></div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
