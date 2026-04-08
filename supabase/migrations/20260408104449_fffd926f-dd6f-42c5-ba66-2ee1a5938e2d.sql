DELETE FROM price_change_log;
DELETE FROM pricing_audit_log;
DELETE FROM boq_items;
DELETE FROM boq_files;
UPDATE projects SET boq_count = 0, total_value = 0;