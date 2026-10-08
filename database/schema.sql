-- iDrive CDO — PostgreSQL schema (Supabase / PostgreSQL 14+)
-- Matches the live database. Load this file, then database/seed.sql.
-- Connect to the target database first. This script does not CREATE DATABASE.
--
-- Re-running the reset block below drops every application table.

BEGIN;

DROP TABLE IF EXISTS
  failed_jobs,
  job_batches,
  jobs,
  cache_locks,
  cache,
  sessions,
  password_reset_tokens,
  migrations,
  audit_logs,
  fuel_records,
  maintenances,
  maintenance_predictions,
  telemetry_readings,
  vehicle_registrations,
  thread_messages,
  message_threads,
  ratings,
  payments,
  booking_renter_documents,
  booking_addons,
  bookings,
  drivers,
  vehicle_features,
  vehicles,
  addons,
  locations,
  login_lockouts,
  user_sessions,
  users
CASCADE;

-- ---------------------------------------------------------------------------
-- Accounts and security
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  user_id             bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code                varchar NOT NULL,
  email               varchar NOT NULL,
  password_hash       varchar NOT NULL,
  password_salt       varchar,
  role                varchar NOT NULL DEFAULT 'customer',
  first_name          varchar NOT NULL,
  last_name           varchar NOT NULL,
  phone               varchar NOT NULL,
  address             varchar,
  department          varchar,
  license_no          varchar,
  license_expiry      date,
  avatar              text,
  status              varchar NOT NULL DEFAULT 'active',
  age_confirmed_at    timestamptz,
  terms_accepted_at   timestamptz,
  password_changed_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  email_verified_at   timestamptz,
  remember_token      varchar,
  CONSTRAINT users_pkey PRIMARY KEY (user_id),
  CONSTRAINT users_code_key UNIQUE (code),
  CONSTRAINT users_email_key UNIQUE (email),
  CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT users_phone_check CHECK (phone ~ '^09[0-9]{9}$'),
  CONSTRAINT users_license_check CHECK (license_no IS NULL OR license_no ~* '^[A-Z0-9][A-Z0-9-]{5,19}$'),
  CONSTRAINT users_role_check CHECK (role IN ('customer', 'driver', 'staff', 'admin')),
  CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE user_sessions (
  session_id   char(32) NOT NULL,
  user_id      bigint NOT NULL,
  role         varchar NOT NULL,
  csrf_token   varchar,
  ip_address   varchar,
  user_agent   varchar,
  issued_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  CONSTRAINT user_sessions_pkey PRIMARY KEY (session_id),
  CONSTRAINT user_sessions_role_check CHECK (role IN ('customer', 'driver', 'staff', 'admin')),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (user_id)
);

CREATE TABLE login_lockouts (
  email_hash     char(64) NOT NULL,
  failed_count   smallint NOT NULL DEFAULT 0,
  last_failed_at timestamptz,
  locked_until   timestamptz,
  CONSTRAINT login_lockouts_pkey PRIMARY KEY (email_hash)
);

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

CREATE TABLE locations (
  location_id smallint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name        varchar NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  smallint NOT NULL DEFAULT 0,
  CONSTRAINT locations_pkey PRIMARY KEY (location_id),
  CONSTRAINT locations_name_key UNIQUE (name)
);

CREATE TABLE addons (
  addon_id   smallint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code       varchar NOT NULL,
  name       varchar NOT NULL,
  daily_rate numeric NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  CONSTRAINT addons_pkey PRIMARY KEY (addon_id),
  CONSTRAINT addons_code_key UNIQUE (code),
  CONSTRAINT addons_daily_rate_check CHECK (daily_rate >= 0)
);

-- ---------------------------------------------------------------------------
-- Fleet
-- ---------------------------------------------------------------------------

CREATE TABLE vehicles (
  vehicle_id     bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code           varchar NOT NULL,
  name           varchar NOT NULL,
  brand          varchar NOT NULL,
  model          varchar NOT NULL,
  year_model     smallint NOT NULL,
  year_purchased smallint,
  type           varchar NOT NULL,
  transmission   varchar NOT NULL,
  fuel           varchar NOT NULL,
  capacity       smallint NOT NULL DEFAULT 5,
  luggage        smallint NOT NULL DEFAULT 2,
  mileage        integer NOT NULL DEFAULT 0,
  daily_rate     numeric NOT NULL,
  plate_number   varchar NOT NULL,
  image          varchar,
  description    varchar,
  status         varchar NOT NULL DEFAULT 'available',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  CONSTRAINT vehicles_pkey PRIMARY KEY (vehicle_id),
  CONSTRAINT vehicles_code_key UNIQUE (code),
  CONSTRAINT vehicles_plate_number_key UNIQUE (plate_number),
  CONSTRAINT vehicles_year_model_check CHECK (year_model >= 1990 AND year_model <= 2100),
  CONSTRAINT vehicles_year_purchased_check CHECK (year_purchased IS NULL OR (year_purchased >= 1990 AND year_purchased <= 2100)),
  CONSTRAINT vehicles_type_check CHECK (type IN ('Sedan', 'SUV', 'Van', 'Pickup')),
  CONSTRAINT vehicles_transmission_check CHECK (transmission IN ('Automatic', 'Manual')),
  CONSTRAINT vehicles_fuel_check CHECK (fuel IN ('Gasoline', 'Diesel')),
  CONSTRAINT vehicles_capacity_check CHECK (capacity >= 1 AND capacity <= 30),
  CONSTRAINT vehicles_daily_rate_check CHECK (daily_rate >= 500),
  CONSTRAINT vehicles_plate_check CHECK (plate_number ~* '^[A-Z0-9]{2,4}-?[0-9]{3,4}$'),
  CONSTRAINT vehicles_status_check CHECK (status IN ('available', 'maintenance'))
);

CREATE TABLE vehicle_features (
  vehicle_feature_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  vehicle_id         bigint NOT NULL,
  feature            varchar NOT NULL,
  sort_order         smallint NOT NULL DEFAULT 0,
  CONSTRAINT vehicle_features_pkey PRIMARY KEY (vehicle_feature_id),
  CONSTRAINT fk_vehicle_features_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (vehicle_id)
);

CREATE TABLE drivers (
  driver_id           bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code                varchar NOT NULL,
  user_id             bigint,
  full_name           varchar NOT NULL,
  driver_license      varchar NOT NULL,
  type_driver_license varchar NOT NULL DEFAULT 'Professional',
  license_expiry      date NOT NULL,
  phone               varchar,
  status              varchar NOT NULL DEFAULT 'active',
  duty_status         varchar NOT NULL DEFAULT 'regular',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CONSTRAINT drivers_pkey PRIMARY KEY (driver_id),
  CONSTRAINT drivers_code_key UNIQUE (code),
  CONSTRAINT drivers_user_id_key UNIQUE (user_id),
  CONSTRAINT drivers_driver_license_key UNIQUE (driver_license),
  CONSTRAINT drivers_phone_check CHECK (phone IS NULL OR phone ~ '^09[0-9]{9}$'),
  CONSTRAINT drivers_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT drivers_duty_status_check CHECK (duty_status IN ('regular', 'on_call')),
  CONSTRAINT fk_drivers_user FOREIGN KEY (user_id) REFERENCES users (user_id)
);

-- ---------------------------------------------------------------------------
-- Bookings and payments
-- ---------------------------------------------------------------------------

CREATE TABLE bookings (
  booking_id           bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code                 varchar NOT NULL,
  ref                  varchar NOT NULL,
  user_id              bigint NOT NULL,
  vehicle_id           bigint NOT NULL,
  driver_id            bigint,
  created_by           bigint,
  start_date           date NOT NULL,
  end_date             date NOT NULL,
  pickup_time          time NOT NULL DEFAULT '09:00:00',
  return_time          time NOT NULL DEFAULT '09:00:00',
  days                 smallint NOT NULL,
  pickup_location_id   smallint NOT NULL,
  dropoff_location_id  smallint NOT NULL,
  number_of_passengers smallint NOT NULL DEFAULT 1,
  drive_mode           varchar NOT NULL DEFAULT 'self',
  driver_option        varchar GENERATED ALWAYS AS (
                         CASE WHEN drive_mode = 'chauffeur' THEN 'Chauffeur' ELSE 'Self-drive' END
                       ) STORED,
  fuel_before_rent     varchar NOT NULL DEFAULT 'Full',
  fuel_upon_return     varchar,
  subtotal             numeric NOT NULL,
  extras               numeric NOT NULL DEFAULT 0,
  total                numeric NOT NULL,
  status               varchar NOT NULL DEFAULT 'pending',
  payment_status       varchar NOT NULL DEFAULT 'unpaid',
  payment_method       varchar,
  notes                varchar,
  return_notes         varchar,
  date_reserve         timestamptz NOT NULL DEFAULT now(),
  started_at           timestamptz,
  started_by           bigint,
  return_requested_at  timestamptz,
  return_requested_by  bigint,
  returned_at          timestamptz,
  returned_by          bigint,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_pkey PRIMARY KEY (booking_id),
  CONSTRAINT bookings_code_key UNIQUE (code),
  CONSTRAINT bookings_ref_key UNIQUE (ref),
  CONSTRAINT bookings_ref_check CHECK (ref ~* '^IDR-[0-9]{8}-[0-9A-F]{3,6}$'),
  CONSTRAINT bookings_passengers_check CHECK (number_of_passengers >= 1 AND number_of_passengers <= 30),
  CONSTRAINT bookings_drive_mode_check CHECK (drive_mode IN ('self', 'chauffeur')),
  CONSTRAINT bookings_fuel_before_check CHECK (fuel_before_rent IN ('Full', '3/4', '1/2', '1/4', 'Reserve', 'Empty')),
  CONSTRAINT bookings_fuel_return_check CHECK (fuel_upon_return IS NULL OR fuel_upon_return IN ('Full', '3/4', '1/2', '1/4', 'Reserve', 'Empty')),
  CONSTRAINT bookings_status_check CHECK (status IN ('pending', 'confirmed', 'ongoing', 'return_requested', 'completed', 'rejected', 'cancelled')),
  CONSTRAINT bookings_payment_status_check CHECK (payment_status IN ('unpaid', 'paid')),
  CONSTRAINT bookings_payment_method_check CHECK (payment_method IS NULL OR payment_method IN ('cash', 'cashless', 'card')),
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users (user_id),
  CONSTRAINT fk_bookings_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (vehicle_id),
  CONSTRAINT fk_bookings_driver FOREIGN KEY (driver_id) REFERENCES drivers (driver_id),
  CONSTRAINT fk_bookings_created_by FOREIGN KEY (created_by) REFERENCES users (user_id),
  CONSTRAINT fk_bookings_pickup FOREIGN KEY (pickup_location_id) REFERENCES locations (location_id),
  CONSTRAINT fk_bookings_dropoff FOREIGN KEY (dropoff_location_id) REFERENCES locations (location_id),
  CONSTRAINT fk_bookings_started_by FOREIGN KEY (started_by) REFERENCES users (user_id),
  CONSTRAINT fk_bookings_return_requested_by FOREIGN KEY (return_requested_by) REFERENCES users (user_id),
  CONSTRAINT fk_bookings_returned_by FOREIGN KEY (returned_by) REFERENCES users (user_id)
);

CREATE TABLE booking_addons (
  booking_id bigint NOT NULL,
  addon_id   smallint NOT NULL,
  daily_rate numeric NOT NULL,
  days       smallint NOT NULL,
  line_total numeric GENERATED ALWAYS AS (daily_rate * days) STORED,
  CONSTRAINT booking_addons_pkey PRIMARY KEY (booking_id, addon_id),
  CONSTRAINT booking_addons_days_check CHECK (days >= 1 AND days <= 30),
  CONSTRAINT fk_booking_addons_booking FOREIGN KEY (booking_id) REFERENCES bookings (booking_id),
  CONSTRAINT fk_booking_addons_addon FOREIGN KEY (addon_id) REFERENCES addons (addon_id)
);

CREATE TABLE booking_renter_documents (
  booking_id      bigint NOT NULL,
  license_name    varchar,
  license_no      varchar,
  license_expiry  date,
  license_address varchar,
  emergency_phone varchar,
  license_photo   text,
  id_type         varchar,
  id_number       varchar,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_renter_documents_pkey PRIMARY KEY (booking_id),
  CONSTRAINT booking_renter_documents_license_check CHECK (license_no IS NULL OR license_no ~* '^[A-Z0-9][A-Z0-9-]{5,19}$'),
  CONSTRAINT booking_renter_documents_phone_check CHECK (emergency_phone IS NULL OR emergency_phone ~ '^09[0-9]{9}$'),
  CONSTRAINT booking_renter_documents_photo_check CHECK (license_photo IS NULL OR license_photo ~* '^data:image/(jpeg|jpg|png|webp);base64,'),
  CONSTRAINT booking_renter_documents_id_type_check CHECK (id_type IS NULL OR id_type IN ('National ID', 'Passport', 'UMID', 'Postal ID', 'Company ID', 'Student ID')),
  CONSTRAINT booking_renter_documents_id_number_check CHECK (id_number IS NULL OR id_number ~* '^[A-Z0-9-]{5,30}$'),
  CONSTRAINT fk_renter_docs_booking FOREIGN KEY (booking_id) REFERENCES bookings (booking_id)
);

CREATE TABLE payments (
  payment_id       bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code             varchar NOT NULL,
  booking_id       bigint NOT NULL,
  amount           numeric NOT NULL,
  payment_method   varchar NOT NULL,
  brand            varchar NOT NULL,
  account_last4    varchar,
  holder           varchar,
  reference_number varchar NOT NULL,
  payment_status   varchar NOT NULL DEFAULT 'paid',
  payment_date     timestamptz NOT NULL DEFAULT now(),
  recorded_by      bigint,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_pkey PRIMARY KEY (payment_id),
  CONSTRAINT payments_code_key UNIQUE (code),
  CONSTRAINT payments_reference_number_key UNIQUE (reference_number),
  CONSTRAINT payments_amount_check CHECK (amount > 0),
  CONSTRAINT payments_method_check CHECK (payment_method IN ('cash', 'cashless', 'card')),
  CONSTRAINT payments_status_check CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings (booking_id),
  CONSTRAINT fk_payments_recorded_by FOREIGN KEY (recorded_by) REFERENCES users (user_id)
);

CREATE TABLE ratings (
  rating_id  bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code       varchar NOT NULL,
  booking_id bigint NOT NULL,
  vehicle_id bigint NOT NULL,
  user_id    bigint NOT NULL,
  stars      smallint NOT NULL,
  comment    varchar,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ratings_pkey PRIMARY KEY (rating_id),
  CONSTRAINT ratings_code_key UNIQUE (code),
  CONSTRAINT ratings_booking_id_key UNIQUE (booking_id),
  CONSTRAINT ratings_stars_check CHECK (stars >= 1 AND stars <= 5),
  CONSTRAINT fk_ratings_booking FOREIGN KEY (booking_id) REFERENCES bookings (booking_id),
  CONSTRAINT fk_ratings_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (vehicle_id),
  CONSTRAINT fk_ratings_user FOREIGN KEY (user_id) REFERENCES users (user_id)
);

-- ---------------------------------------------------------------------------
-- Desk inbox
-- ---------------------------------------------------------------------------

CREATE TABLE message_threads (
  thread_id       bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code            varchar NOT NULL,
  kind            varchar NOT NULL,
  topic           varchar NOT NULL,
  booking_id      bigint,
  customer_id     bigint,
  customer_name   varchar NOT NULL,
  customer_email  varchar,
  customer_phone  varchar,
  status          varchar NOT NULL DEFAULT 'open',
  unread_staff    boolean NOT NULL DEFAULT true,
  unread_customer boolean NOT NULL DEFAULT false,
  legacy_id       varchar,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_threads_pkey PRIMARY KEY (thread_id),
  CONSTRAINT message_threads_code_key UNIQUE (code),
  CONSTRAINT message_threads_booking_id_key UNIQUE (booking_id),
  CONSTRAINT message_threads_legacy_id_key UNIQUE (legacy_id),
  CONSTRAINT message_threads_kind_check CHECK (kind IN ('booking', 'contact', 'return')),
  CONSTRAINT message_threads_status_check CHECK (status IN ('open', 'closed')),
  CONSTRAINT fk_threads_booking FOREIGN KEY (booking_id) REFERENCES bookings (booking_id),
  CONSTRAINT fk_threads_customer FOREIGN KEY (customer_id) REFERENCES users (user_id)
);

CREATE TABLE thread_messages (
  message_id   bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code         varchar NOT NULL,
  thread_id    bigint NOT NULL,
  from_role    varchar NOT NULL,
  from_user_id bigint,
  from_name    varchar NOT NULL,
  body         varchar NOT NULL,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT thread_messages_pkey PRIMARY KEY (message_id),
  CONSTRAINT thread_messages_code_key UNIQUE (code),
  CONSTRAINT thread_messages_from_role_check CHECK (from_role IN ('customer', 'staff')),
  CONSTRAINT fk_messages_thread FOREIGN KEY (thread_id) REFERENCES message_threads (thread_id),
  CONSTRAINT fk_messages_user FOREIGN KEY (from_user_id) REFERENCES users (user_id)
);

-- ---------------------------------------------------------------------------
-- Fleet operations
-- ---------------------------------------------------------------------------

CREATE TABLE vehicle_registrations (
  registration_id       bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code                  varchar NOT NULL,
  vehicle_id            bigint NOT NULL,
  plate_number          varchar NOT NULL,
  renewal_scheduled_day smallint,
  next_reg_renewal      date NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_registrations_pkey PRIMARY KEY (registration_id),
  CONSTRAINT vehicle_registrations_code_key UNIQUE (code),
  CONSTRAINT vehicle_registrations_vehicle_id_key UNIQUE (vehicle_id),
  CONSTRAINT vehicle_registrations_day_check CHECK (renewal_scheduled_day IS NULL OR (renewal_scheduled_day >= 1 AND renewal_scheduled_day <= 31)),
  CONSTRAINT fk_registrations_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (vehicle_id)
);

CREATE TABLE telemetry_readings (
  telemetry_id            bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  vehicle_id              bigint NOT NULL,
  brand                   varchar NOT NULL,
  reading_time            timestamp NOT NULL,
  reading_hour            smallint GENERATED ALWAYS AS (EXTRACT(HOUR FROM reading_time)::smallint) STORED,
  reading_day_of_week     smallint GENERATED ALWAYS AS ((EXTRACT(ISODOW FROM reading_time) - 1)::smallint) STORED,
  odometer_reading        numeric NOT NULL,
  engine_temp_c           numeric NOT NULL,
  engine_rpm              numeric NOT NULL,
  oil_pressure_psi        numeric NOT NULL,
  coolant_temp_c          numeric NOT NULL,
  fuel_level_percent      numeric NOT NULL,
  fuel_consumption_lph    numeric NOT NULL,
  engine_load_percent     numeric NOT NULL,
  throttle_pos_percent    numeric NOT NULL,
  air_flow_rate_gps       numeric NOT NULL,
  exhaust_gas_temp_c      numeric NOT NULL,
  vibration_level         numeric NOT NULL,
  engine_hours            numeric NOT NULL,
  brake_fluid_level_psi   numeric NOT NULL,
  brake_pad_wear_mm       numeric NOT NULL,
  brake_temp_c            numeric NOT NULL,
  abs_fault_indicator     smallint NOT NULL DEFAULT 0,
  brake_pedal_pos_percent numeric NOT NULL,
  wheel_speed_fl_kph      numeric NOT NULL,
  wheel_speed_fr_kph      numeric NOT NULL,
  wheel_speed_rl_kph      numeric NOT NULL,
  wheel_speed_rr_kph      numeric NOT NULL,
  battery_voltage_v       numeric NOT NULL,
  battery_current_a       numeric NOT NULL,
  battery_temp_c          numeric NOT NULL,
  alternator_output_v     numeric NOT NULL,
  battery_charge_percent  numeric NOT NULL,
  battery_health_percent  numeric NOT NULL,
  vehicle_speed_kph       numeric NOT NULL,
  ambient_temp_c          numeric NOT NULL,
  humidity_percent        numeric NOT NULL,
  extra_attributes        jsonb,
  recorded_by             bigint,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telemetry_readings_pkey PRIMARY KEY (telemetry_id),
  CONSTRAINT telemetry_abs_check CHECK (abs_fault_indicator IN (0, 1)),
  CONSTRAINT fk_telemetry_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (vehicle_id),
  CONSTRAINT fk_telemetry_user FOREIGN KEY (recorded_by) REFERENCES users (user_id)
);

CREATE TABLE maintenance_predictions (
  prediction_id     bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  vehicle_id        bigint NOT NULL,
  telemetry_id      bigint,
  target            varchar NOT NULL DEFAULT 'failure_imminent',
  prediction        smallint NOT NULL,
  needs_maintenance boolean NOT NULL,
  probability       numeric,
  model_name        varchar NOT NULL DEFAULT 'failure_imminent_rf',
  predicted_by      bigint,
  predicted_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_predictions_pkey PRIMARY KEY (prediction_id),
  CONSTRAINT maintenance_predictions_target_check CHECK (target IN ('failure_imminent', 'engine_failure_imminent', 'brake_issue_imminent', 'battery_issue_imminent')),
  CONSTRAINT maintenance_predictions_value_check CHECK (prediction IN (0, 1)),
  CONSTRAINT maintenance_predictions_probability_check CHECK (probability IS NULL OR (probability >= 0 AND probability <= 1)),
  CONSTRAINT fk_predictions_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (vehicle_id),
  CONSTRAINT fk_predictions_telemetry FOREIGN KEY (telemetry_id) REFERENCES telemetry_readings (telemetry_id),
  CONSTRAINT fk_predictions_user FOREIGN KEY (predicted_by) REFERENCES users (user_id)
);

CREATE TABLE maintenances (
  maintenance_id   bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code             varchar NOT NULL,
  vehicle_id       bigint NOT NULL,
  maintenance_type varchar NOT NULL,
  scheduled_date   date NOT NULL,
  performed_at     date,
  finished         boolean NOT NULL DEFAULT false,
  notes            varchar,
  prediction_id    bigint,
  created_by       bigint,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenances_pkey PRIMARY KEY (maintenance_id),
  CONSTRAINT maintenances_code_key UNIQUE (code),
  CONSTRAINT fk_maintenances_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (vehicle_id),
  CONSTRAINT fk_maintenances_created_by FOREIGN KEY (created_by) REFERENCES users (user_id),
  CONSTRAINT fk_maintenances_prediction FOREIGN KEY (prediction_id) REFERENCES maintenance_predictions (prediction_id)
);

CREATE TABLE fuel_records (
  fuel_record_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code           varchar NOT NULL,
  vehicle_id     bigint NOT NULL,
  fuel_type      varchar NOT NULL,
  notes          varchar,
  recorded_by    bigint,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fuel_records_pkey PRIMARY KEY (fuel_record_id),
  CONSTRAINT fuel_records_code_key UNIQUE (code),
  CONSTRAINT fuel_records_fuel_type_check CHECK (fuel_type IN ('Gasoline', 'Diesel')),
  CONSTRAINT fk_fuel_records_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (vehicle_id),
  CONSTRAINT fk_fuel_records_user FOREIGN KEY (recorded_by) REFERENCES users (user_id)
);

-- ---------------------------------------------------------------------------
-- Security log
-- ---------------------------------------------------------------------------

CREATE TABLE audit_logs (
  audit_id    bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code        varchar NOT NULL,
  action      varchar NOT NULL,
  user_id     bigint,
  actor_label varchar,
  detail      varchar,
  ip_address  varchar,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (audit_id),
  CONSTRAINT audit_logs_code_key UNIQUE (code),
  CONSTRAINT audit_logs_actor_check CHECK (actor_label IS NULL OR actor_label IN ('system', 'guest')),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (user_id)
);

-- ---------------------------------------------------------------------------
-- Laravel framework tables
-- ---------------------------------------------------------------------------

CREATE TABLE migrations (
  id        integer GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  migration varchar NOT NULL,
  batch     integer NOT NULL,
  CONSTRAINT migrations_pkey PRIMARY KEY (id)
);

CREATE TABLE password_reset_tokens (
  email      varchar NOT NULL,
  token      varchar NOT NULL,
  created_at timestamp,
  CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (email)
);

CREATE TABLE sessions (
  id            varchar NOT NULL,
  user_id       bigint,
  ip_address    varchar,
  user_agent    text,
  payload       text NOT NULL,
  last_activity integer NOT NULL,
  CONSTRAINT sessions_pkey PRIMARY KEY (id)
);

CREATE TABLE cache (
  key        varchar NOT NULL,
  value      text NOT NULL,
  expiration integer NOT NULL,
  CONSTRAINT cache_pkey PRIMARY KEY (key)
);

CREATE TABLE cache_locks (
  key        varchar NOT NULL,
  owner      varchar NOT NULL,
  expiration integer NOT NULL,
  CONSTRAINT cache_locks_pkey PRIMARY KEY (key)
);

CREATE TABLE jobs (
  id           bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  queue        varchar NOT NULL,
  payload      text NOT NULL,
  attempts     smallint NOT NULL,
  reserved_at  integer,
  available_at integer NOT NULL,
  created_at   integer NOT NULL,
  CONSTRAINT jobs_pkey PRIMARY KEY (id)
);

CREATE TABLE job_batches (
  id             varchar NOT NULL,
  name           varchar NOT NULL,
  total_jobs     integer NOT NULL,
  pending_jobs   integer NOT NULL,
  failed_jobs    integer NOT NULL,
  failed_job_ids text NOT NULL,
  options        text,
  cancelled_at   integer,
  created_at     integer NOT NULL,
  finished_at    integer,
  CONSTRAINT job_batches_pkey PRIMARY KEY (id)
);

CREATE TABLE failed_jobs (
  id         bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  uuid       varchar NOT NULL,
  connection text NOT NULL,
  queue      text NOT NULL,
  payload    text NOT NULL,
  exception  text NOT NULL,
  failed_at  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT failed_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT failed_jobs_uuid_key UNIQUE (uuid)
);

COMMIT;
