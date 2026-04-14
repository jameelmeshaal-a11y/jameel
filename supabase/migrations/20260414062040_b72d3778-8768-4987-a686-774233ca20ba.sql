
CREATE OR REPLACE FUNCTION public.extract_sub_item(full_desc text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT btrim(
    CASE
      WHEN position('—' in full_desc) > 0
        THEN substring(full_desc from '—\s*([^—]+)$')
      WHEN position(' - ' in full_desc) > 0
        THEN substring(full_desc from ' - ([^-]+)$')
      ELSE full_desc
    END
  );
$$;
