-- Backfill keywords and item_name_aliases for rate_library rows where they're empty/null.
-- Uses the same normalization rules as generateKeywords() in usePriceLibrary.ts:
--   strip diacritics, normalize hamza/ta-marbuta/alif-maksura, drop common Arabic prefixes,
--   keep tokens >= 2 chars.
UPDATE public.rate_library
SET
  keywords = COALESCE(
    (
      SELECT array_agg(DISTINCT token)
      FROM (
        SELECT regexp_replace(part, '^(ال|وال|بال|لل|و|ب|ل|ف|ك)', '') AS token
        FROM regexp_split_to_table(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(standard_name_ar, '[\u064B-\u065F\u0670]', '', 'g'),
                '[إأآٱ]', 'ا', 'g'
              ),
              'ة', 'ه', 'g'
            ),
            'ى', 'ي', 'g'
          ),
          E'[\\s,،.؛;/\\\\()\\-–—]+'
        ) AS part
      ) t
      WHERE token IS NOT NULL AND char_length(token) >= 2
    ),
    '{}'::text[]
  ),
  item_name_aliases = CASE
    WHEN item_name_aliases IS NULL OR array_length(item_name_aliases, 1) IS NULL
      THEN ARRAY[standard_name_ar]
    WHEN NOT (standard_name_ar = ANY(item_name_aliases))
      THEN array_append(item_name_aliases, standard_name_ar)
    ELSE item_name_aliases
  END
WHERE
  standard_name_ar IS NOT NULL
  AND btrim(standard_name_ar) <> ''
  AND (
    keywords IS NULL
    OR array_length(keywords, 1) IS NULL
    OR item_name_aliases IS NULL
    OR array_length(item_name_aliases, 1) IS NULL
  );