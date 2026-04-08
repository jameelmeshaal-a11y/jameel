import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description, description_en, unit, category } = await req.json();

    if (!description && !description_en) {
      return new Response(
        JSON.stringify({ error: "description or description_en required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a Saudi Arabia construction cost estimation expert.
Given a construction work item description, generate a realistic cost breakdown percentage distribution.

Rules:
- Percentages must reflect real Middle East / Saudi construction practices
- Different item types have very different distributions:
  - Excavation/earthwork: equipment-heavy (40-55% equipment)
  - Concrete/structural: materials-heavy (45-60% materials)  
  - MEP/electrical: materials-heavy with significant labor (40-50% materials, 25-35% labor)
  - Finishing/painting: labor-heavy (35-50% labor)
  - Steel/metal work: materials-heavy (50-65% materials)
  - Plumbing: balanced materials and labor
- All 6 percentages must sum to exactly 100
- Risk is typically 3-8%, Profit is typically 5-10%
- Be specific to the item, not generic`;

    const userPrompt = `Generate cost breakdown percentages for this construction item:
Description (AR): ${description || "N/A"}
Description (EN): ${description_en || "N/A"}
Unit: ${unit || "N/A"}
Category: ${category || "Unknown"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "set_breakdown_percentages",
              description: "Set the cost breakdown percentages for a construction item. All values must sum to 100.",
              parameters: {
                type: "object",
                properties: {
                  materials_pct: { type: "number", description: "Materials percentage (0-100)" },
                  labor_pct: { type: "number", description: "Labor percentage (0-100)" },
                  equipment_pct: { type: "number", description: "Equipment percentage (0-100)" },
                  logistics_pct: { type: "number", description: "Logistics/transport percentage (0-100)" },
                  risk_pct: { type: "number", description: "Risk/contingency percentage (0-100)" },
                  profit_pct: { type: "number", description: "Profit percentage (0-100)" },
                },
                required: ["materials_pct", "labor_pct", "equipment_pct", "logistics_pct", "risk_pct", "profit_pct"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "set_breakdown_percentages" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "AI generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(
        JSON.stringify({ error: "AI did not return structured breakdown" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const args = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    // Validate and normalize
    const pcts = {
      materials_pct: Math.max(0, Number(args.materials_pct) || 0),
      labor_pct: Math.max(0, Number(args.labor_pct) || 0),
      equipment_pct: Math.max(0, Number(args.equipment_pct) || 0),
      logistics_pct: Math.max(0, Number(args.logistics_pct) || 0),
      risk_pct: Math.max(0, Number(args.risk_pct) || 0),
      profit_pct: Math.max(0, Number(args.profit_pct) || 0),
    };

    const sum = pcts.materials_pct + pcts.labor_pct + pcts.equipment_pct +
      pcts.logistics_pct + pcts.risk_pct + pcts.profit_pct;

    // Normalize to 100 if needed
    if (sum > 0 && Math.abs(sum - 100) > 0.1) {
      const factor = 100 / sum;
      pcts.materials_pct = Math.round(pcts.materials_pct * factor * 10) / 10;
      pcts.labor_pct = Math.round(pcts.labor_pct * factor * 10) / 10;
      pcts.equipment_pct = Math.round(pcts.equipment_pct * factor * 10) / 10;
      pcts.logistics_pct = Math.round(pcts.logistics_pct * factor * 10) / 10;
      pcts.risk_pct = Math.round(pcts.risk_pct * factor * 10) / 10;
      pcts.profit_pct = Math.round(pcts.profit_pct * factor * 10) / 10;
    }

    return new Response(
      JSON.stringify({ percentages: pcts, normalized: Math.abs(sum - 100) > 0.1 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-breakdown error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
