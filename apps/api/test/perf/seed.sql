SET client_min_messages = warning;

INSERT INTO users (id, email, password_hash, role, is_active, token_version, failed_logins, created_at, updated_at)
SELECT 'u-v-'||i, 'vendor'||i||'@perf.local', 'x', 'VENDOR', true, 0, 0, now(), now()
FROM generate_series(1,25) i;
INSERT INTO vendors (id, user_id, business_name, status, created_at, updated_at)
SELECT 'v-'||i, 'u-v-'||i, 'Vendor '||i, 'ACTIVE', now(), now() FROM generate_series(1,25) i;

INSERT INTO users (id, normalized_phone, password_hash, role, is_active, token_version, failed_logins, created_at, updated_at)
SELECT 'u-d-'||i, '+9617'||lpad(i::text,7,'0'), 'x', 'DRIVER', true, 0, 0, now(), now()
FROM generate_series(1,60) i;
INSERT INTO drivers (id, user_id, full_name, contact_phone, status, duty_status, created_at, updated_at)
SELECT 'd-'||i, 'u-d-'||i, 'Driver '||i, '+9617'||lpad(i::text,7,'0'), 'ACTIVE',
       (CASE WHEN i % 3 = 0 THEN 'ON_DUTY' ELSE 'OFF_DUTY' END)::"DutyStatus", now(), now()
FROM generate_series(1,60) i;

INSERT INTO customers (id, normalized_phone, name, created_by_vendor_id, created_at, updated_at)
SELECT 'c-'||i,
       '+9613'||lpad(i::text,7,'0'),
       (ARRAY['Ahmad','Rana','Georges','Nadia','Hassan','Maya','Karim','Lea','Fadi','Zeina'])[1+(i%10)]
         ||' '||(ARRAY['Khoury','Haddad','Saad','Nassar','Aoun','Chidiac','Rizk','Sfeir'])[1+(i%8)],
       CASE WHEN i % 5 < 2 THEN 'v-'||(1+(i%25)) ELSE NULL END,
       now() - (i || ' minutes')::interval, now()
FROM generate_series(1,120000) i;

-- status buckets chosen so driver/commission/timestamp CHECKs all hold:
--   0 -> PENDING (no driver, no snapshot, no timestamps)
--   1 -> CANCELLED (no driver)
--   2 -> DRIVER_ASSIGNED (assigned only)
--   3 -> PICKED_UP (assigned + picked)
--   4..6 -> DELIVERED (all three)
--   7 -> FAILED (assigned + picked)
INSERT INTO orders (id, order_number, vendor_id, customer_id, driver_id, status,
  delivery_address_text, delivery_charge, currency, commission_bps,
  platform_commission_amount, driver_earnings,
  assigned_at, picked_up_at, delivered_at, cancelled_at, created_at, updated_at)
SELECT 'o-'||i, 'ORD-P-'||i, 'v-'||(1+(i%25)), 'c-'||(1+((i*7)%120000)),
       CASE WHEN i%8 IN (0,1) THEN NULL ELSE 'd-'||(1+(i%60)) END,
       (ARRAY['PENDING','CANCELLED','DRIVER_ASSIGNED','PICKED_UP','DELIVERED','DELIVERED','DELIVERED','FAILED'])[1+(i%8)]::"OrderStatus",
       (ARRAY['Hamra, Bliss st','Badaro, Sami el Solh','Achrafieh, Sassine','Jounieh, Maameltein','Verdun, side st'])[1+(i%5)]||', Bldg '||(i%400),
       (50000+(i%20)*10000)::bigint, 'LBP',
       CASE WHEN i%8 IN (0,1) THEN NULL ELSE 3000 END,
       CASE WHEN i%8 IN (0,1) THEN NULL ELSE ((50000+(i%20)*10000)*3/10)::bigint END,
       CASE WHEN i%8 IN (0,1) THEN NULL ELSE ((50000+(i%20)*10000)-((50000+(i%20)*10000)*3/10))::bigint END,
       CASE WHEN i%8 IN (0,1) THEN NULL ELSE now() - (i || ' seconds')::interval END,
       CASE WHEN i%8 IN (3,4,5,6,7) THEN now() - (i || ' seconds')::interval END,
       CASE WHEN i%8 IN (4,5,6) THEN now() - (i || ' seconds')::interval END,
       CASE WHEN i%8 = 1 THEN now() - (i || ' seconds')::interval END,
       now() - (i || ' seconds')::interval, now()
FROM generate_series(1,400000) i;

INSERT INTO customer_addresses (id, customer_id, label, address_text, is_archived, created_by_vendor_id, created_at, updated_at)
SELECT 'a-'||i, 'c-'||i, 'HOME', 'Hamra, Bliss st, Bldg '||(i%400), false,
       CASE WHEN i % 3 = 0 THEN 'v-'||(1+(i%25)) ELSE NULL END, now(), now()
FROM generate_series(1,120000) i;

ANALYZE;
