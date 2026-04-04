

# Confirmed: Full-Stack Implementation (Not UI-Only)

Every point you listed is explicitly in scope. Here is the confirmation with implementation specifics:

## Database Layer (Migration)

- **Schema migration** adds real columns to `boq_files`: `facility_name`, `facility_type`, `city`, `remoteness_level`, `location_factor`, `pricing_mode`, `notes`, `package_code`, `discipline`, `special_remarks`
- All columns have defaults for backward compatibility with existing rows
- **Status constraint** updated in the database to include `draft`, `uploading`, `processing`, `ready`, `failed` alongside legacy values (`uploaded`, `parsed`, `error`)
- Migration runs against live database via the migration tool

## Record Creation Flow

- `CreateBoQDialog` calls `supabase.from("boq_files").insert(...)` to create a real database record with all metadata fields **before** any file upload
- The returned `boqFileId` (UUID from the database) is then used for file upload and parsing
- No mock state, no local-only objects — the record exists in the database immediately after step 1

## Parsing and Storage

- `uploadAndParseForBoQ(boqFileId, projectId, file)` uploads to `supabase.storage.from("boq-files")` and updates `boq_files.file_path` and `boq_files.status` in the database
- Parsed `boq_items` are inserted with `boq_file_id = boqFileId` linking them to the exact record
- Failure at upload phase: `UPDATE boq_files SET status = 'failed' WHERE id = boqFileId`
- Failure at parse phase: `DELETE FROM boq_items WHERE boq_file_id = boqFileId`, then `UPDATE boq_files SET status = 'failed'`

## Read Path

- `ProjectDetail` uses `useBoQFiles(projectId)` which queries `supabase.from("boq_files").select("*").eq("project_id", projectId)` — real database reads
- Facility grouping uses `facility_name` column from the database response, grouped client-side via `Object.groupBy` or equivalent
- `BoQTable` receives a `boqFileId` prop and uses `useBoQItems(boqFileId)` which queries `supabase.from("boq_items").select("*").eq("boq_file_id", boqFileId)` — real database reads
- No `boqFiles[0]` fallback; user must explicitly select a BoQ

## Backward Compatibility

- Old rows with `status = 'uploaded'`, `'parsed'`, `'error'` remain valid (constraint includes them)
- Old rows with empty `facility_name`, `city`, etc. display correctly (defaults applied by migration)
- New creation flow only writes `draft` → `uploading` → `processing` → `ready` | `failed`
- `BoQTable` renders items regardless of which status generation created the record

## Files Changed

| File | What happens |
|------|-------------|
| `supabase/migrations/new.sql` | Real schema migration: ALTER TABLE, constraint update |
| `src/components/CreateBoQDialog.tsx` | New — calls supabase insert, upload, parse |
| `src/lib/boqParser.ts` | Split into `createBoQFileRecord()` + `uploadAndParseForBoQ()`, both hit real DB |
| `src/hooks/useSupabase.ts` | Add `useCreateBoQFile` mutation (real supabase call) |
| `src/pages/ProjectDetail.tsx` | Uses `useBoQFiles` for DB reads, groups by DB `facility_name`, passes `boqFileId` |
| `src/components/BoQTable.tsx` | Accepts `boqFileId` prop, removes upload UI, reads from DB only |
| `src/lib/i18n.ts` | New translation keys |

No UI-only mock state. No local temporary flow. Every create, read, and update goes through the database.

