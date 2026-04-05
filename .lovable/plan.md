

# Fix: Round and bound confidence before DB write

## Single change — `src/lib/pricingEngine.ts`

In the `supabase.from("boq_items").update(...)` call inside the main pricing loop, replace the `confidence` field:

**Current:**
```typescript
confidence: matchedItem ? matchConfidence : cost.confidence,
```

**Replace with:**
```typescript
confidence: Math.max(0, Math.min(100, Math.round(matchedItem ? matchConfidence : cost.confidence))),
```

No other file changes or database migrations needed. All three protection layers (position-aware category detection, approved-rate fallback, deviation protection) are already implemented in the current codebase.

