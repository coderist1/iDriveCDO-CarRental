-- Demo and reference data matching the frontend's built-in seed.
-- PostgreSQL. Run database/schema.sql first, connected to the target database.
-- Local demo data only. Never run this against the live database.
-- Admin password: Drive@Admin1
-- Staff: heidi.ares@idrivecdo.ph Desk@Heidi1, karen.echem@idrivecdo.ph Desk@Karen1, kharla.gigante@idrivecdo.ph Desk@Kharla1
-- Drivers: jason.hipiga@idrivecdo.ph Drive@Jason1, adrian.ares@idrivecdo.ph Drive@Adrian1, kenneth.mendoza@idrivecdo.ph Drive@Kenneth1

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

INSERT INTO locations (name, sort_order) VALUES
  ('Montalvan Burgos, Cagayan de Oro', 0),
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
   'admin', 'Aldrin', 'Maglangit', '+639171234567', 'Limketkai Drive, CDO', 'Administration',
   'A01-11-100001', '2028-12-31', NULL, 'active', '2026-01-15 08:00:00'),
  ('usr_heidi', 'heidi.ares@idrivecdo.ph',
   '$2y$12$rxkDtMSHJE3aUEJpGRboruQtxSRX9ozFZlAisoh5OPn..GSSMLnCG',
   'staff', 'Heidi Joyce', 'Ares', '+639171110001', 'Cagayan de Oro', 'Rental-Incharge',
   NULL, NULL, NULL, 'active', '2026-01-15 08:00:00'),
  ('usr_karen', 'karen.echem@idrivecdo.ph',
   '$2y$12$x4yc3AgsGztsV7xKSE.lleDgDgLch2LzJcTnTYqfKtDuQNUuNPuYW',
   'staff', 'Karen', 'Echem', '+639171110002', 'Cagayan de Oro', 'Rental-Incharge',
   NULL, NULL, NULL, 'active', '2026-01-15 08:00:00'),
  ('usr_kharla', 'kharla.gigante@idrivecdo.ph',
   '$2y$12$Fh1YEELJfqsf20wHxCsGB.Iil.sCEXYKww9FDd5yD1m17gnqJhl1C',
   'staff', 'Ma. Kharla', 'Gigante', '+639171110003', 'Cagayan de Oro', 'Rental-Incharge',
   NULL, NULL, NULL, 'active', '2026-01-15 08:00:00'),
  ('usr_jason', 'jason.hipiga@idrivecdo.ph',
   '$2y$12$9NR0n845aB4v03/Xhdsm0OkuZM6sLZ1ytBGYFcQytxTjaoMX4uuDe',
   'driver', 'Jason', 'Hipiga', '+639170001111', 'Cagayan de Oro', 'Chauffeur',
   'N02-98-112233', '2028-06-30', NULL, 'active', '2026-01-15 08:00:00'),
  ('usr_adrian', 'adrian.ares@idrivecdo.ph',
   '$2y$12$tZBb532DJsBYf2uvaN25fe0WNcU5/JDaGa.Oh/SgajZIqwb34R5WG',
   'driver', 'Adrian Zanro', 'Ares', '+639170003333', 'Cagayan de Oro', 'Chauffeur',
   'N03-04-778899', '2029-03-15', NULL, 'active', '2026-01-15 08:00:00'),
  ('usr_kenneth', 'kenneth.mendoza@idrivecdo.ph',
   '$2y$12$9edi3rB6zIbzSx.JKQzgQ.RAEy7ki8VFMlD3FJsSRVyu5wLYKiUDC',
   'driver', 'Kenneth', 'Mendoza', '+639170004444', 'Cagayan de Oro', 'Chauffeur',
   'N04-06-221144', '2028-11-30', NULL, 'active', '2026-01-15 08:00:00');

UPDATE users
SET email_verified_at = created_at, password_changed_at = created_at
WHERE code IN ('usr_admin', 'usr_heidi', 'usr_karen', 'usr_kharla', 'usr_jason', 'usr_adrian', 'usr_kenneth');

-- ---------------------------------------------------------------------------
-- Fleet
-- ---------------------------------------------------------------------------

INSERT INTO vehicles
  (code, name, brand, model, year_model, year_purchased, type, transmission, fuel,
   capacity, luggage, mileage, daily_rate, plate_number, image, description, status)
VALUES
  ('veh_mirage_g4', 'Mirage G4 GLX 2023', 'Mitsubishi', 'Mirage G4 GLX', 2023, 2023, 'Sedan', 'Automatic', 'Gasoline',
   5, 2, 12000, 1500, 'CDO-1001',
   '/shared/img/fleet/mirage-g4.jpg',
   'Compact white sedan for downtown CDO, mall runs, and airport transfers.', 'available'),
  ('veh_strada', 'Strada GLS 2.4D 2WD AT 2024', 'Mitsubishi', 'Strada GLS 2.4D', 2024, 2024, 'Pickup', 'Automatic', 'Diesel',
   5, 5, 13500, 2800, 'CDO-4001',
   '/shared/img/fleet/strada.jpg',
   'White diesel pickup for cargo, site visits, and rough provincial roads.', 'available'),
  ('veh_soluto_mt', 'Soluto 1.4 LX MT 2019', 'Kia', 'Soluto 1.4 LX', 2019, 2019, 'Sedan', 'Manual', 'Gasoline',
   5, 2, 15000, 1200, 'CDO-1002',
   '/shared/img/fleet/soluto-mt.jpg',
   'Budget-friendly gray sedan for everyday city errands.', 'available'),
  ('veh_stargazer', 'Stargazer 1.5 GLS IVT 2024', 'Hyundai', 'Stargazer 1.5 GLS', 2024, 2024, 'Van', 'Automatic', 'Gasoline',
   7, 3, 16500, 2200, 'CDO-3001',
   '/shared/img/fleet/stargazer.jpg',
   'Family MPV with third-row seating for group trips around CDO.', 'available'),
  ('veh_l300_i', 'L300-I FB MT 2023', 'Mitsubishi', 'L300 FB', 2023, 2023, 'Van', 'Manual', 'Diesel',
   3, 8, 18000, 2500, 'CDO-3002',
   '/shared/img/fleet/l300-i.jpg',
   'White FB van for deliveries, bulk cargo, and commercial hauls.', 'available'),
  ('veh_l300_ii', 'L300-II FB MT 2024', 'Mitsubishi', 'L300 FB', 2024, 2024, 'Van', 'Manual', 'Diesel',
   3, 8, 19500, 2500, 'CDO-3003',
   '/shared/img/fleet/l300-ii.jpg',
   'Second L300 unit — white FB van for cargo and market runs.', 'available'),
  ('veh_l300_iii', 'L300-III FB MT 2025', 'Mitsubishi', 'L300 FB', 2025, 2025, 'Van', 'Manual', 'Diesel',
   3, 8, 21000, 2600, 'CDO-3004',
   '/shared/img/fleet/l300-iii.jpg',
   'Newer L300 FB van for heavier commercial bookings.', 'available'),
  ('veh_l300_iv', 'L300-IV FB MT', 'Mitsubishi', 'L300 FB', 2024, 2024, 'Van', 'Manual', 'Diesel',
   3, 8, 22500, 2500, 'CDO-3005',
   '/shared/img/fleet/l300-iv.jpg',
   'Gray-tone L300 FB van ready for warehouse and provincial cargo.', 'available'),
  ('veh_l300_v', 'L300-V FB MT 2025', 'Mitsubishi', 'L300 FB', 2025, 2025, 'Van', 'Manual', 'Diesel',
   3, 8, 24000, 2600, 'CDO-3006',
   '/shared/img/fleet/l300-v.jpg',
   'Fifth L300 unit — white FB van for fleet overflow bookings.', 'available'),
  ('veh_ertiga', 'Suzuki Ertiga MT 2020', 'Suzuki', 'Ertiga', 2020, 2020, 'Van', 'Manual', 'Gasoline',
   7, 3, 25500, 1800, 'CDO-3007',
   '/shared/img/fleet/ertiga.jpg',
   'Seven-seat MPV for family rides and hotel transfers.', 'available'),
  ('veh_soluto_at', 'Kia Soluto AT 2019', 'Kia', 'Soluto', 2019, 2019, 'Sedan', 'Automatic', 'Gasoline',
   5, 2, 27000, 1300, 'CDO-1003',
   '/shared/img/fleet/soluto-at.jpg',
   'Automatic Soluto sedan for easy city driving.', 'available'),
  ('veh_mirage_hatch', 'Mirage Hatchback', 'Mitsubishi', 'Mirage Hatchback', 2022, 2022, 'Sedan', 'Automatic', 'Gasoline',
   5, 1, 28500, 1400, 'CDO-1004',
   '/shared/img/fleet/mirage-hatch.jpg',
   'White hatchback for light travel and tight CDO parking.', 'available');

INSERT INTO vehicle_features (vehicle_id, feature, sort_order)
SELECT v.vehicle_id, f.feature, f.sort_order
FROM vehicles v
JOIN (
  SELECT 'veh_mirage_g4' AS code, 'Bluetooth' AS feature, 1 AS sort_order UNION ALL
  SELECT 'veh_mirage_g4', 'Touchscreen', 2 UNION ALL
  SELECT 'veh_mirage_g4', 'Eco mode', 3 UNION ALL
  SELECT 'veh_mirage_g4', 'Fuel efficient', 4 UNION ALL
  SELECT 'veh_strada', '2WD', 1 UNION ALL
  SELECT 'veh_strada', 'Bed liner', 2 UNION ALL
  SELECT 'veh_strada', 'Tow hook', 3 UNION ALL
  SELECT 'veh_strada', 'Diesel torque', 4 UNION ALL
  SELECT 'veh_soluto_mt', 'Manual gearbox', 1 UNION ALL
  SELECT 'veh_soluto_mt', 'Compact park', 2 UNION ALL
  SELECT 'veh_soluto_mt', 'USB charging', 3 UNION ALL
  SELECT 'veh_stargazer', 'IVT automatic', 1 UNION ALL
  SELECT 'veh_stargazer', 'Third row', 2 UNION ALL
  SELECT 'veh_stargazer', 'Rear AC', 3 UNION ALL
  SELECT 'veh_stargazer', 'Sliding doors', 4 UNION ALL
  SELECT 'veh_l300_i', 'Flatbed body', 1 UNION ALL
  SELECT 'veh_l300_i', 'Diesel', 2 UNION ALL
  SELECT 'veh_l300_i', 'High payload', 3 UNION ALL
  SELECT 'veh_l300_ii', 'Flatbed body', 1 UNION ALL
  SELECT 'veh_l300_ii', 'Diesel', 2 UNION ALL
  SELECT 'veh_l300_ii', 'High payload', 3 UNION ALL
  SELECT 'veh_l300_iii', 'Flatbed body', 1 UNION ALL
  SELECT 'veh_l300_iii', 'Diesel', 2 UNION ALL
  SELECT 'veh_l300_iii', 'High payload', 3 UNION ALL
  SELECT 'veh_l300_iv', 'Flatbed body', 1 UNION ALL
  SELECT 'veh_l300_iv', 'Diesel', 2 UNION ALL
  SELECT 'veh_l300_iv', 'High payload', 3 UNION ALL
  SELECT 'veh_l300_v', 'Flatbed body', 1 UNION ALL
  SELECT 'veh_l300_v', 'Diesel', 2 UNION ALL
  SELECT 'veh_l300_v', 'High payload', 3 UNION ALL
  SELECT 'veh_ertiga', 'Third row', 1 UNION ALL
  SELECT 'veh_ertiga', 'Manual gearbox', 2 UNION ALL
  SELECT 'veh_ertiga', 'Fuel efficient', 3 UNION ALL
  SELECT 'veh_soluto_at', 'Automatic', 1 UNION ALL
  SELECT 'veh_soluto_at', 'Compact park', 2 UNION ALL
  SELECT 'veh_soluto_at', 'Air-conditioning', 3 UNION ALL
  SELECT 'veh_mirage_hatch', 'Hatch access', 1 UNION ALL
  SELECT 'veh_mirage_hatch', 'Eco mode', 2 UNION ALL
  SELECT 'veh_mirage_hatch', 'Compact park', 3
) f ON f.code = v.code;

INSERT INTO drivers
  (code, user_id, full_name, driver_license, type_driver_license, license_expiry, phone, status, duty_status, created_at)
VALUES
  ('drv_001', (SELECT user_id FROM users WHERE code = 'usr_jason'), 'Jason Hipiga', 'N02-98-112233',
   'Professional', '2028-06-30', '09170001111', 'active', 'on_call', '2026-01-15 08:00:00'),
  ('drv_002', (SELECT user_id FROM users WHERE code = 'usr_adrian'), 'Adrian Zanro Ares', 'N03-04-778899',
   'Professional', '2029-03-15', '09170003333', 'active', 'regular', '2026-01-15 08:00:00'),
  ('drv_003', (SELECT user_id FROM users WHERE code = 'usr_kenneth'), 'Kenneth Mendoza', 'N04-06-221144',
   'Professional', '2028-11-30', '09170004444', 'active', 'regular', '2026-01-15 08:00:00');

INSERT INTO vehicle_registrations (code, vehicle_id, plate_number, renewal_scheduled_day, next_reg_renewal, created_at)
SELECT 'reg_' || v.code, v.vehicle_id, v.plate_number, 15,
       make_date(2027, (((v.vehicle_id - (SELECT MIN(vehicle_id) FROM vehicles)) % 9) + 1)::int, 15),
       '2026-01-15 08:00:00+00'
FROM vehicles v;

INSERT INTO maintenances (code, vehicle_id, maintenance_type, scheduled_date, finished, notes, created_by, created_at)
VALUES
  ('mnt_001', (SELECT vehicle_id FROM vehicles WHERE code = 'veh_mirage_g4'), 'Oil change', '2026-09-20', FALSE,
   'Routine service', (SELECT user_id FROM users WHERE code = 'usr_admin'), '2026-09-01 08:00:00');

INSERT INTO fuel_records (code, vehicle_id, fuel_type, notes, recorded_at)
SELECT 'fuel_' || code, vehicle_id, fuel, 'Initial fuel type from registration', '2026-01-15 08:00:00+00'
FROM vehicles;

INSERT INTO audit_logs (code, action, user_id, actor_label, detail)
VALUES ('aud_seed', 'seed', NULL, 'system', 'Initial fleet and staff accounts loaded.');
