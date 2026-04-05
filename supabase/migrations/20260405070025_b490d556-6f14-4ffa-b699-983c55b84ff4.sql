UPDATE boq_items
SET status = 'descriptive',
    unit_rate = NULL,
    total_price = NULL,
    materials = NULL,
    labor = NULL,
    equipment = NULL,
    logistics = NULL,
    risk = NULL,
    profit = NULL,
    confidence = NULL,
    source = NULL,
    linked_rate_id = NULL
WHERE id = '7078baf0-764b-405b-a7fb-3d9e13c426f0'
  AND unit = ''
  AND LENGTH(item_no) > 30;