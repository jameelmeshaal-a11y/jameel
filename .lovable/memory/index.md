# Project Memory

## Core
UI: Emerald/dark slate palette, full RTL Arabic. High-capacity tables with sticky headers.
Tech: Supabase (RLS `user_id = auth.uid()`), Supabase Storage.
Constraints: Zero mock data. ASCII-safe storage filenames, original Arabic DB metadata. No hardcoded city fallbacks.
Pricing: Zero AI Pricing (all prices from library). Skip zero-rate items. VAT (15%) strictly excluded.
Integrity: `quantity > 0` is strictly `type: "priced"`. Confidence strictly integer 0-100.
Matching: item_no ≥95% match is HARD OVERRIDE — bypasses description scoring, returns confidence 99.
Governance: confidence <70 = pending (no price). Category conflicts = absolute block. Historical = prices only (no manual inheritance). Reset bypass via status=pending.

## Memories
- [Design Direction](mem://style/design-direction) — Emerald/dark slate, RTL Arabic, high-capacity tables
- [Hybrid Language Logic](mem://architecture/hybrid-language-logic) — AI logic English, UI bilingual, BoQ processed in Arabic
- [Clean Production State](mem://constraints/clean-production-state) — Zero mock data, empty until user upload
- [Document Classification](mem://features/document-classification) — Core, Technical, Other types for AI context
- [Versioning and Archive](mem://features/versioning-and-archive) — Version-controlled BoQ archive
- [System Readiness Diagnostics](mem://features/system-readiness-diagnostics) — QA Center for production simulations
- [Debug and Auditability](mem://features/debug-and-auditability) — Standalone diagnostic routes and global debug panel
- [Admin and Access Control](mem://features/admin-and-access-control) — RBAC (Admin, PM, User)
- [Admin Credentials](mem://auth/admin-credentials) — Test admin credentials
- [Pricing Calculation Logic](mem://features/pricing-calculation-logic) — Zero-Rate Pricing Guard
- [Rate Library V2 Intelligence](mem://features/rate-library-v2-intelligence) — Multi-source, tokenized keywords
- [Arabic Filename Compatibility](mem://constraints/arabic-filename-compatibility) — ASCII Supabase paths, Arabic DB metadata
- [BoQ Row Classification System](mem://features/boq-row-classification-system) — Quantity > 0 is always priced
- [Pre-Export Validation and Summary](mem://features/pre-export-validation-and-summary) — Warning-based export validation
- [Global Data Consistency System](mem://features/global-data-consistency-system) — Recalculate project total RPC
- [Independent BoQ Workflow](mem://features/independent-boq-workflow) — Pre-upload wizard persists metadata
- [Owner-Supplied Materials](mem://features/owner-supplied-materials) — Excludes material costs from calculations
- [Semantic Row Grouping and Pricing](mem://features/semantic-row-grouping-and-pricing) — Merges contributor rows to primary
- [Price Audit and Explanation](mem://features/price-audit-and-explanation) — Detailed price source and rationale
- [Arabic Category Detection Logic](mem://features/arabic-category-detection-logic) — Position-aware category detection
- [Confidence Data Integrity](mem://constraints/confidence-data-integrity) — Confidence is strict integer 0-100
- [City Fallback Logic](mem://constraints/city-fallback-logic) — No hardcoded fallbacks for location
- [Deterministic Historical Mapping](mem://features/deterministic-historical-mapping) — Historical matching with strict dimension checks
- [Automatic Budget Distribution](mem://features/automatic-budget-distribution) — Splits budget into Material/Labor/Equipment/Misc
- [Price Change Audit Logging](mem://features/price-change-audit-logging) — Audit trail in price_change_log table
- [Strict Library Enforcement UI](mem://features/strict-library-enforcement-ui) — Visual status badges for confidence
- [Price Library Bulk Management](mem://features/price-library-bulk-management) — SheetJS import/export with diff-preview
- [Fuzzy Semantic Matching Engine](mem://architecture/fuzzy-semantic-matching-engine) — Edge Function matching algorithm
- [BoQ Parser Hierarchical Logic](mem://features/boq-parser-hierarchical-logic) — Context inheritance and cleanUnit sanitization
- [Professional Excel Export](mem://features/professional-excel-export) — 17-column RTL Arabic ExcelJS export
- [Dynamic BoQ Section Numbering](mem://features/dynamic-boq-section-numbering) — section_no text column
- [Total Cost Distribution Logic](mem://features/total-cost-distribution-logic) — Component distribution priority hierarchy
- [UI Scaling and Navigation](mem://constraints/ui-scaling-and-navigation) — High-scale management without pagination limits
- [Smart Category Distribution](mem://features/smart-category-distribution) — Fallback category ratios
- [Inline Unit Synchronization](mem://features/inline-unit-synchronization) — Bidirectional unit sync to rate library
- [BoQ Advanced Filtering](mem://features/boq-advanced-filtering) — Multi-filter intersection (AND) logic
- [Rate Library Expansion Strategy](mem://features/rate-library-expansion-strategy) — Derives variants from core items
- [BoQ Lifecycle and Governance](mem://features/boq/lifecycle-and-governance) — Active/Archived isolation and reprice workflow
- [Text Normalization Engine](mem://architecture/text-normalization-engine) — Prefix-agnostic Arabic text parsing
- [Real-Time Sequential Pricing Workflow](mem://features/real-time-sequential-pricing-workflow) — Real-time incremental cache updates
- [Manual Correction Feedback Loop](mem://features/manual-correction-feedback-loop) — Learns from manual corrections
- [Price Library Import Logic](mem://features/price-library-import-logic) — Maps multiple column header variants
- [Individual Item Pricing Management](mem://features/individual-item-pricing-management) — Single-item re-price and clear actions
- [Unit Normalization Dictionary](mem://architecture/unit-normalization-dictionary) — Standardizes Arabic/English unit strings
- [Rate Library Data Reset](mem://features/rate-library-data-reset) — Library wipe and unlink functionality
- [Rate Library Content Standard](mem://features/rate-library-content-standard) — Brief and concise descriptions
- [BoQ Item Governance](mem://schema/boq-item-governance) — Strict CHECK constraints on status and source
- [Project Summary Report](mem://features/project-summary-report) — Centralized financial summary page
- [Saudi Location Engine](mem://features/saudi-location-engine) — 14 region multipliers based on city
- [Pricing Integrity System](mem://features/pricing/integrity-system) — 4-layer pricing sync and stale_price triggers
- [Pricing Audit Policy](mem://features/pricing/audit-policy) — Auto-reset items with >50% price deviation
- [BMS Pricing Logic](mem://features/bms/pricing-logic) — Points-based pricing, caps at 200 points
- [Etemad-Ready Export](mem://features/export/etemad-ready) — Inject prices into original Excel (strip shared formulas)
- [Financial Governance](mem://features/pricing/financial-governance) — Zero AI pricing, VAT excluded, manual overrides
- [Rate Library Manual Entry](mem://features/rate-library-manual-entry) — Row-by-row manual item addition
- [BoQ Category Visualization](mem://features/boq-category-visualization) — AI category badges and Structural Type Gate
- [Parent Authority Logic](mem://features/matching/parent-authority-logic) — Boosts matching score for parent descriptions
- [Conflict Resolution Gates](mem://features/matching/conflict-resolution-gates) — Hard-blocks logical and structural mismatches
- [Manual Approval Sync](mem://features/pricing/manual-approval-sync) — Atomic backend RPC save_manual_price
- [Reset Governance](mem://features/pricing/reset-governance) — Reset workflows preserve manual overrides
- [Deviation Reporting](mem://features/pricing/deviation-reporting) — Variance >30% reporting
- [Matching V4 Engine Core](mem://features/matching/v4-engine-core) — Contextual matching with item_no Hard Override (≥95% = confidence 99)
- [Contextual Matching Logic](mem://architecture/contextual-matching-logic) — Normalization-first approach
- [BoQ Table UI Optimization](mem://style/boq-table-ui-optimization) — Manual override locks, cost breakdown hidden
- [Category Hard Gate](mem://features/matching/category-hard-gate) — 4-layer incompatible category gate prevents cross-category price mixing
- [item_no Hard Override](mem://features/matching/item-no-hard-override) — item_no ≥95% bypasses description scoring, returns confidence 99
- [Hardened Propagation](mem://features/pricing/hardened-propagation) — word_similarity ≥0.65 for manual price propagation
- [Hardened Governance](mem://features/pricing/hardened-governance) — 5 locked rules: item_no override, pending <70, category block, no manual inheritance, reset bypass
