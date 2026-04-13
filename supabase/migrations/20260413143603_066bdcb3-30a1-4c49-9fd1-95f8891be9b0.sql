
-- Backfill keywords for rate_library items that have empty keywords
-- Uses regexp_split_to_array to tokenize the Arabic name
UPDATE rate_library
SET keywords = (
  SELECT array_agg(DISTINCT token)
  FROM unnest(
    regexp_split_to_array(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(standard_name_ar, '[\u0610-\u061A\u064B-\u065F\u0670]', '', 'g'),
            '[إأآٱ]', 'ا', 'g'),
          'ة', 'ه', 'g'),
        'ى', 'ي', 'g'),
      '[\s,،.؛;/\\()\-–—]+'
    )
  ) AS token
  WHERE length(token) >= 2
),
item_name_aliases = ARRAY[standard_name_ar]
WHERE keywords = '{}' OR keywords IS NULL;
