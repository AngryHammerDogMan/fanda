ALTER TABLE order_items
ADD COLUMN confirmed_amount DECIMAL(10,2);

UPDATE order_items
SET confirmed_amount = CASE
    WHEN unit_price IS NULL THEN NULL
    ELSE ROUND(unit_price * quantity, 2)
END;

UPDATE orders
SET total_amount = totals.total_amount
FROM (
    SELECT order_id, SUM(confirmed_amount) AS total_amount
    FROM order_items
    GROUP BY order_id
) AS totals
WHERE totals.order_id = orders.id;

UPDATE calendar_records
SET amount = orders.total_amount
FROM orders
WHERE orders.calendar_record_id = calendar_records.id;
