-- Demo and reference data matching the frontend's built-in seed.
-- PostgreSQL. Run database/schema.sql first, connected to the target database.
-- Demo passwords: admin Drive@Admin1, staff Drive@Staff1, customer Drive@Guest1, driver Drive@Driver1

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

INSERT INTO locations (name, sort_order) VALUES
  ('Laguindingan Airport (CGY)', 1),
  ('Divisoria / Downtown CDO', 2),
  ('SM City CDO Downtown Premier', 3),
  ('Centrio Mall', 4),
  ('Limketkai Center', 5),
  ('Uptown Cagayan de Oro', 6),
  ('Pueblo de Oro', 7),
  ('Cogon Public Market', 8);

INSERT INTO addons (code, name, daily_rate) VALUES
  ('driver',    'Professional driver',     1500.00),
  ('gps',       'GPS navigation',           200.00),
  ('child',     'Child seat',               150.00),
  ('insurance', 'Full coverage insurance',  450.00);

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

INSERT INTO users
  (code, email, password_hash, role, first_name, last_name, phone, address, department,
   license_no, license_expiry, avatar, status, created_at)
VALUES
  ('usr_admin', 'admin@idrivecdo.ph',
   '$2y$12$s6sLp.c3Jgifgp3paq1L/OE.qPRJ5pTJGyH0ncNapg3QrQP5rcUJa',
   'admin', 'Mara', 'Villanueva', '09171234567', 'Limketkai Drive, CDO', 'Administration',
   'A01-11-100001', '2028-12-31', NULL, 'active', '2026-01-15 08:00:00'),
  ('usr_staff', 'staff@idrivecdo.ph',
   '$2y$12$fCbDezxqDXpL.dYlL4MiBODnv03..3AuRd.5q1Dsw7BE25on9J2ny',
   'staff', 'Ken', 'Sable', '09181234567', 'Divisoria, CDO', 'Rental-Incharge',
   'A01-11-100001', '2028-12-31', NULL, 'active', '2026-01-15 08:00:00'),
  ('usr_customer', 'guest@idrivecdo.ph',
   '$2y$12$Jzb0W5iww6bfo1T8cphj..57aqQe3eXvfuOlZ7C3RaF8AOl9NZ/gO',
   'customer', 'Paolo', 'Reyes', '09191234567', 'Uptown Cagayan de Oro', NULL,
   'N04-12-345678', '2028-12-31',
   'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=320&h=320&q=80',
   'active', '2026-01-15 08:00:00'),
  ('usr_driver', 'driver@idrivecdo.ph',
   '$2y$12$om0C83I0ieIWEsUukXmNAe.DzPqGxNdTo4kc0.L5Hq/z3eGVKopAa',
   'driver', 'Rico', 'Manalo', '09170001111', 'Carmen, Cagayan de Oro', 'Chauffeur',
   'N02-98-112233', '2028-06-30', NULL, 'active', '2026-01-15 08:00:00');

UPDATE users
SET age_confirmed_at = created_at, terms_accepted_at = created_at
WHERE role = 'customer';

-- ---------------------------------------------------------------------------
-- Fleet
-- ---------------------------------------------------------------------------

INSERT INTO vehicles
  (code, name, brand, model, year_model, year_purchased, type, transmission, fuel,
   capacity, luggage, mileage, daily_rate, plate_number, image, description, status)
VALUES
  ('veh_vios', 'Toyota Vios 2024', 'Toyota', 'Vios', 2024, 2024, 'Sedan', 'Automatic', 'Gasoline',
   5, 2, 12000, 1800, 'CDO-1001',
   'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1400&q=80',
   'City-friendly sedan for downtown CDO, mall runs, and airport transfers.', 'available'),
  ('veh_city', 'Honda City 2023', 'Honda', 'City', 2023, 2023, 'Sedan', 'Automatic', 'Gasoline',
   5, 2, 13500, 1900, 'CDO-1002',
   'https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=1400&q=80',
   'Quiet cabin and strong air-conditioning for long CDO heat.', 'available'),
  ('veh_mirage', 'Mitsubishi Mirage G4', 'Mitsubishi', 'Mirage G4', 2023, 2023, 'Sedan', 'Automatic', 'Gasoline',
   5, 1, 15000, 1500, 'CDO-1003',
   'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1400&q=80',
   'Light on fuel. Ideal for solo travelers and couples.', 'available'),
  ('veh_fortuner', 'Toyota Fortuner', 'Toyota', 'Fortuner', 2024, 2024, 'SUV', 'Automatic', 'Diesel',
   7, 4, 16500, 4500, 'CDO-2001',
   'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1400&q=80',
   'Family SUV for Bukidnon roads, Camiguin trips, and group tours.', 'available'),
  ('veh_montero', 'Mitsubishi Montero Sport', 'Mitsubishi', 'Montero Sport', 2023, 2023, 'SUV', 'Automatic', 'Diesel',
   7, 4, 18000, 4300, 'CDO-2002',
   'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1400&q=80',
   'High clearance for CDO rain days and mountain weekends.', 'available'),
  ('veh_crv', 'Honda CR-V', 'Honda', 'CR-V', 2024, 2024, 'SUV', 'Automatic', 'Gasoline',
   5, 3, 19500, 3800, 'CDO-2003',
   'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1400&q=80',
   'Comfortable crossover for city hotels and uptown stays.', 'available'),
  ('veh_everest', 'Ford Everest', 'Ford', 'Everest', 2023, 2023, 'SUV', 'Automatic', 'Diesel',
   7, 4, 21000, 4200, 'CDO-2004',
   'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1400&q=80',
   'Strong towing and highway presence for northbound trips.', 'available'),
  ('veh_hiace', 'Toyota Hiace Commuter', 'Toyota', 'Hiace', 2023, 2023, 'Van', 'Manual', 'Diesel',
   15, 8, 22500, 5000, 'CDO-3001',
   'https://images.unsplash.com/photo-1527786356703-4b100091cd2c?auto=format&fit=crop&w=1400&q=80',
   'Group van for company outings, church trips, and airport batches.', 'available'),
  ('veh_alphard', 'Toyota Alphard', 'Toyota', 'Alphard', 2022, 2022, 'Van', 'Automatic', 'Gasoline',
   7, 4, 24000, 8500, 'CDO-3002',
   'https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=1400&q=80',
   'Executive van with captain seats for VIP airport arrivals.', 'available'),
  ('veh_hilux', 'Toyota Hilux Conquest', 'Toyota', 'Hilux', 2024, 2024, 'Pickup', 'Automatic', 'Diesel',
   5, 5, 25500, 3600, 'CDO-4001',
   'https://images.unsplash.com/photo-1559416523-140ddc3d238c?auto=format&fit=crop&w=1400&q=80',
   'Workhorse pickup for cargo, site visits, and rough farm roads.', 'available'),
  ('veh_ranger', 'Ford Ranger Wildtrak', 'Ford', 'Ranger', 2024, 2024, 'Pickup', 'Automatic', 'Diesel',
   5, 5, 27000, 3900, 'CDO-4002',
   'https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=1400&q=80',
   'Lifestyle pickup for beach gear and weekend camping.', 'available'),
  ('veh_landcruiser', 'Toyota Land Cruiser Prado', 'Toyota', 'Prado', 2022, 2022, 'SUV', 'Automatic', 'Diesel',
   7, 4, 28500, 7800, 'CDO-2005',
   'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?auto=format&fit=crop&w=1400&q=80',
   'Flagship SUV for long north Mindanao itineraries.', 'available');

INSERT INTO vehicle_features (vehicle_id, feature, sort_order)
SELECT v.vehicle_id, f.feature, f.sort_order
FROM vehicles v
JOIN (
  SELECT 'veh_vios' AS code, 'Bluetooth' AS feature, 1 AS sort_order UNION ALL
  SELECT 'veh_vios', 'Backup camera', 2 UNION ALL
  SELECT 'veh_vios', 'USB charging', 3 UNION ALL
  SELECT 'veh_vios', 'Fuel efficient', 4 UNION ALL
  SELECT 'veh_city', 'Cruise control', 1 UNION ALL
  SELECT 'veh_city', 'Apple CarPlay', 2 UNION ALL
  SELECT 'veh_city', 'Keyless entry', 3 UNION ALL
  SELECT 'veh_mirage', 'Compact park', 1 UNION ALL
  SELECT 'veh_mirage', 'Touchscreen', 2 UNION ALL
  SELECT 'veh_mirage', 'Eco mode', 3 UNION ALL
  SELECT 'veh_fortuner', '4x2', 1 UNION ALL
  SELECT 'veh_fortuner', 'Third row', 2 UNION ALL
  SELECT 'veh_fortuner', 'Hill assist', 3 UNION ALL
  SELECT 'veh_fortuner', 'Rear AC', 4 UNION ALL
  SELECT 'veh_montero', 'Leather seats', 1 UNION ALL
  SELECT 'veh_montero', 'Paddle shift', 2 UNION ALL
  SELECT 'veh_montero', 'Camera 360', 3 UNION ALL
  SELECT 'veh_crv', 'Honda Sensing', 1 UNION ALL
  SELECT 'veh_crv', 'Sunroof', 2 UNION ALL
  SELECT 'veh_crv', 'Power tailgate', 3 UNION ALL
  SELECT 'veh_everest', 'Terrain modes', 1 UNION ALL
  SELECT 'veh_everest', 'SYNC infotainment', 2 UNION ALL
  SELECT 'veh_everest', 'LED lights', 3 UNION ALL
  SELECT 'veh_hiace', 'High roof', 1 UNION ALL
  SELECT 'veh_hiace', 'Dual AC', 2 UNION ALL
  SELECT 'veh_hiace', 'Wide sliding doors', 3 UNION ALL
  SELECT 'veh_alphard', 'Captain seats', 1 UNION ALL
  SELECT 'veh_alphard', 'Power sliding doors', 2 UNION ALL
  SELECT 'veh_alphard', 'Premium audio', 3 UNION ALL
  SELECT 'veh_hilux', '4x4', 1 UNION ALL
  SELECT 'veh_hilux', 'Bed liner', 2 UNION ALL
  SELECT 'veh_hilux', 'Tow hook', 3 UNION ALL
  SELECT 'veh_ranger', 'Sports bar', 1 UNION ALL
  SELECT 'veh_ranger', 'Leather-trimmed', 2 UNION ALL
  SELECT 'veh_ranger', 'Off-road tires', 3 UNION ALL
  SELECT 'veh_landcruiser', 'Crawl control', 1 UNION ALL
  SELECT 'veh_landcruiser', 'Cool box', 2 UNION ALL
  SELECT 'veh_landcruiser', 'Multi-terrain', 3
) f ON f.code = v.code;

INSERT INTO drivers
  (code, user_id, full_name, driver_license, type_driver_license, license_expiry, phone, status, duty_status, created_at)
VALUES
  ('drv_001', (SELECT user_id FROM users WHERE code = 'usr_driver'), 'Rico Manalo', 'N02-98-112233',
   'Professional', '2028-06-30', '09170001111', 'active', 'on_call', '2026-01-15 08:00:00'),
  ('drv_002', NULL, 'Ana Belmonte', 'N03-01-445566',
   'Professional', '2029-01-15', '09170002222', 'active', 'regular', '2026-01-15 08:00:00');

INSERT INTO vehicle_registrations (code, vehicle_id, plate_number, renewal_scheduled_day, next_reg_renewal, created_at)
SELECT 'reg_' || v.code, v.vehicle_id, v.plate_number, 15,
       make_date(2027, (((v.vehicle_id - (SELECT MIN(vehicle_id) FROM vehicles)) % 9) + 1)::int, 15),
       '2026-01-15 08:00:00+00'
FROM vehicles v;

INSERT INTO maintenances (code, vehicle_id, maintenance_type, scheduled_date, finished, notes, created_by, created_at)
VALUES
  ('mnt_001', (SELECT vehicle_id FROM vehicles WHERE code = 'veh_vios'), 'Oil change', '2026-09-20', FALSE,
   'Routine service', (SELECT user_id FROM users WHERE code = 'usr_admin'), '2026-09-01 08:00:00');

INSERT INTO fuel_records (code, vehicle_id, fuel_type, notes, recorded_at)
SELECT 'fuel_' || code, vehicle_id, fuel, 'Initial fuel type from registration', '2026-01-15 08:00:00+00'
FROM vehicles;

-- ---------------------------------------------------------------------------
-- Demo bookings and payments
-- ---------------------------------------------------------------------------

INSERT INTO bookings
  (code, ref, user_id, vehicle_id, driver_id, created_by, start_date, end_date, pickup_time, return_time, days,
   pickup_location_id, dropoff_location_id, number_of_passengers, drive_mode, fuel_before_rent,
   subtotal, extras, total, status, payment_status, payment_method, notes, date_reserve, created_at, updated_at)
VALUES
  ('bkg_demo1', 'IDR-20260901-A1B',
   (SELECT user_id FROM users WHERE code = 'usr_customer'),
   (SELECT vehicle_id FROM vehicles WHERE code = 'veh_vios'),
   NULL,
   (SELECT user_id FROM users WHERE code = 'usr_customer'),
   '2026-09-12', '2026-09-15', '09:00:00', '09:00:00', 3,
   (SELECT location_id FROM locations WHERE name = 'Laguindingan Airport (CGY)'),
   (SELECT location_id FROM locations WHERE name = 'Centrio Mall'),
   1, 'self', 'Full', 5400, 600, 6000, 'confirmed', 'paid', 'card',
   'Flight 3P 221, arriving 1:10 PM.',
   '2026-09-01 10:00:00', '2026-09-01 10:00:00', '2026-09-01 10:12:00'),
  ('bkg_driver1', 'IDR-20260918-C7D',
   (SELECT user_id FROM users WHERE code = 'usr_customer'),
   (SELECT vehicle_id FROM vehicles WHERE code = 'veh_fortuner'),
   (SELECT driver_id FROM drivers WHERE code = 'drv_001'),
   (SELECT user_id FROM users WHERE code = 'usr_customer'),
   '2026-09-18', '2026-09-20', '13:00:00', '10:00:00', 2,
   (SELECT location_id FROM locations WHERE name = 'Laguindingan Airport (CGY)'),
   (SELECT location_id FROM locations WHERE name = 'Uptown Cagayan de Oro'),
   4, 'chauffeur', 'Full', 9000, 3000, 12000, 'confirmed', 'paid', 'card',
   'VIP airport pickup, 4 passengers.',
   '2026-09-10 08:30:00', '2026-09-10 08:30:00', '2026-09-10 09:00:00');

INSERT INTO booking_addons (booking_id, addon_id, daily_rate, days)
SELECT b.booking_id, a.addon_id, a.daily_rate, b.days
FROM bookings b
JOIN addons a ON (b.code = 'bkg_demo1' AND a.code = 'gps') OR (b.code = 'bkg_driver1' AND a.code = 'driver');

INSERT INTO payments
  (code, booking_id, amount, payment_method, brand, account_last4, holder, reference_number,
   payment_status, payment_date, created_at)
VALUES
  ('pay_demo1', (SELECT booking_id FROM bookings WHERE code = 'bkg_demo1'), 6000, 'card', 'Visa', '4242',
   'Paolo Reyes', 'AUTH9C2', 'paid', '2026-09-01 10:12:00', '2026-09-01 10:12:00'),
  ('pay_driver1', (SELECT booking_id FROM bookings WHERE code = 'bkg_driver1'), 12000, 'card', 'Visa', '4242',
   'Paolo Reyes', 'AUTHC7D', 'paid', '2026-09-10 09:00:00', '2026-09-10 09:00:00');

INSERT INTO audit_logs (code, action, user_id, actor_label, detail)
VALUES ('aud_seed', 'seed', NULL, 'system', 'Initial fleet and demo accounts loaded.');
