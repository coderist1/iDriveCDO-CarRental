-- Run this once in the Supabase SQL editor after schema.sql and seed.sql.
-- The rental site signs people in inside the browser, so the anon key
-- needs to read and write these tables. Do not use the service_role key
-- in frontend code.

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'user_sessions', 'login_lockouts', 'locations', 'addons',
    'vehicles', 'vehicle_features', 'drivers', 'bookings', 'booking_addons',
    'booking_renter_documents', 'payments', 'ratings', 'message_threads',
    'thread_messages', 'vehicle_registrations', 'maintenances', 'fuel_records',
    'telemetry_readings', 'maintenance_predictions', 'audit_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS app_frontend_all ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY app_frontend_all ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
