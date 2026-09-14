-- GS Team schema, generated from the live database by scripts/dump_schema.py
-- generated 2026-09-14 19:56:24.171600+00:00

set search_path = public, extensions;

-- extensions
create extension if not exists "pg_net" with schema public;
create extension if not exists "pg_stat_statements" with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "supabase_vault" with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;

-- types
create type public.adjustment_status as enum ('Pending', 'Paid', 'Rejected');
create type public.adjustment_type as enum ('Bonus', 'Correction', 'Penalty', 'Spiff');
create type public.app_role as enum ('owner', 'admin', 'ca', 'sales', 'integrator');
create type public.client_tier as enum ('standard', 'vip', 'reach', 'a_la_carte');
create type public.edit_status as enum ('pending', 'approved', 'rejected');
create type public.logging_cadence as enum ('weekly', 'monthly');
create type public.pending_source as enum ('manual', 'stripe', 'ghl');
create type public.pending_status as enum ('pending', 'approved', 'rejected');
create type public.review_source as enum ('google', 'facebook', 'yelp', 'trustpilot', 'internal');
create type public.review_status as enum ('unassigned', 'assigned', 'dismissed');
create type public.sales_role as enum ('AM', 'RDR');
create type public.stripe_truth_mode as enum ('stripe_wins', 'ca_wins', 'lower_of_both');

-- sequences
create sequence if not exists public.audit_log_id_seq as bigint start with 1 increment by 1 minvalue 1 maxvalue 9223372036854775807;

-- tables
create table public."adjustments" (
  "id" text not null,
  "rep_id" text not null,
  "role" public.sales_role not null,
  "type" public.adjustment_type not null,
  "amount" numeric not null,
  "reason" text not null,
  "linked_client" text,
  "period" text,
  "status" public.adjustment_status default 'Pending'::adjustment_status not null,
  "date" date not null,
  "approved_at" timestamptz,
  "approved_by" uuid,
  "rejected_at" timestamptz,
  "rejected_by" uuid,
  "created_at" timestamptz default now() not null,
  "created_by" uuid
);
create table public."audit_log" (
  "id" bigint default nextval('audit_log_id_seq'::regclass) not null,
  "at" timestamptz default now() not null,
  "actor_id" uuid,
  "actor_email" text,
  "action" text not null,
  "table_name" text not null,
  "row_id" text,
  "diff" jsonb
);
create table public."call_statuses" (
  "id" text not null,
  "status" text default 'none'::text not null,
  "updated_at" timestamptz default now(),
  "updated_by" uuid,
  "note" text
);
create table public."cancel_reasons" (
  "code" text not null,
  "label" text not null,
  "counts_against_ca" boolean default true not null,
  "sort_order" integer default 100 not null,
  "created_at" timestamptz default now() not null
);
create table public."cas" (
  "id" text not null,
  "profile_id" uuid,
  "name" text not null,
  "email" text not null,
  "start_date" date not null,
  "active" boolean default true not null,
  "notes" text
);
create table public."client_score_history" (
  "client_id" text not null,
  "computed_at" timestamptz default now() not null,
  "score" numeric,
  "bucket" text
);
create table public."clients" (
  "id" text not null,
  "stripe_customer_id" text,
  "ghl_contact_id" text,
  "name" text not null,
  "sign_date" date not null,
  "cancel_date" date,
  "monthly_retainer" numeric not null,
  "has_membership_addon" boolean default false not null,
  "membership_start_date" date,
  "term_months" integer default 12 not null,
  "ae" text,
  "sdr_booked_by" text,
  "upfront_pct" numeric,
  "mid_pct" numeric,
  "end_pct" numeric,
  "assigned_ca" text,
  "stripe_truth_mode" public.stripe_truth_mode default 'stripe_wins'::stripe_truth_mode not null,
  "notes" text,
  "created_at" timestamptz default now() not null,
  "created_by" uuid,
  "ghl_location_id" text,
  "ghl_lead_pipeline_id" text,
  "ghl_class_calendar_ids" jsonb default '[]'::jsonb,
  "ghl_calendars_resolved_at" timestamptz,
  "logging_cadence" public.logging_cadence default 'monthly'::logging_cadence not null,
  "tier" public.client_tier default 'standard'::client_tier not null,
  "cancel_reason" text,
  "meeting_time" text
);
create table public."config" (
  "id" integer default 1 not null,
  "values" jsonb not null,
  "updated_at" timestamptz default now() not null,
  "updated_by" uuid
);
create table public."edit_requests" (
  "id" uuid default uuid_generate_v4() not null,
  "table_name" text not null,
  "row_id" text not null,
  "field_changes" jsonb not null,
  "reason" text,
  "status" public.edit_status default 'pending'::edit_status not null,
  "requested_by" uuid not null,
  "requested_at" timestamptz default now() not null,
  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "review_notes" text
);
create table public."ghl_client_tokens" (
  "client_id" text not null,
  "access_token" text not null,
  "refresh_token" text,
  "expires_at" timestamptz,
  "installed_at" timestamptz default now() not null,
  "installed_by" uuid
);
create table public."ghl_config" (
  "id" integer default 1 not null,
  "agency_location_id" text,
  "auth_mode" text default 'agency_key'::text not null,
  "agency_api_key_set" boolean default false not null,
  "reviews_enabled" boolean default true not null,
  "surveys_enabled" boolean default true not null,
  "testimonials_enabled" boolean default true not null,
  "ad_spend_enabled" boolean default true not null,
  "showed_statuses" jsonb default '["showed"]'::jsonb not null,
  "updated_at" timestamptz default now() not null,
  "updated_by" uuid
);
create table public."growth_events" (
  "id" text not null,
  "ca_id" text not null,
  "client_id" text not null,
  "date" date not null,
  "event_type" text not null,
  "description" text,
  "attendees" integer,
  "sale_total" numeric,
  "notes" text,
  "created_at" timestamptz default now() not null,
  "created_by" uuid,
  "cost_to_us" numeric default 0,
  "logged_by" text
);
create table public."invites" (
  "email" text not null,
  "full_name" text,
  "role" public.app_role not null,
  "ca_id" text,
  "sales_id" text,
  "invited_by" uuid,
  "invited_at" timestamptz default now() not null,
  "consumed_at" timestamptz,
  "consumed_by_id" uuid
);
create table public."monthly_checkins" (
  "id" text not null,
  "ca_id" text not null,
  "client_id" text not null,
  "month" date not null,
  "concern" text,
  "win" text,
  "account_action" text,
  "agency_action" text,
  "notes" text,
  "created_at" timestamptz default now() not null,
  "created_by" uuid,
  "updated_at" timestamptz default now() not null,
  "flagged_inactive" boolean default false not null
);
create table public."monthly_metrics" (
  "id" text not null,
  "ca_id" text not null,
  "client_id" text not null,
  "month" date not null,
  "ad_spend" numeric default 0 not null,
  "leads_generated" integer default 0 not null,
  "appointments_booked" integer default 0 not null,
  "appointments_showed" integer default 0 not null,
  "appointments_closed" integer default 0 not null,
  "client_mrr" numeric default 0 not null,
  "ca_logged_mrr" numeric,
  "stripe_observed_mrr" numeric,
  "students_acquired" integer default 0 not null,
  "students_cancelled" integer default 0 not null,
  "notes" text,
  "created_at" timestamptz default now() not null,
  "created_by" uuid,
  "updated_at" timestamptz default now() not null,
  "source" text default 'manual'::text not null,
  "field_sources" jsonb default '{}'::jsonb,
  "ghl_synced_at" timestamptz,
  "client_gross_revenue" numeric default 0 not null,
  "total_students_start" integer default 0 not null,
  "lead_cost" numeric default 0 not null,
  "flagged_inactive" boolean default false not null
);
create table public."open_questions" (
  "id" text not null,
  "topic" text not null,
  "priority" text not null,
  "status" text default 'open'::text not null,
  "question" text not null,
  "context" text,
  "answer" text,
  "owner" text,
  "created_at" date default CURRENT_DATE not null,
  "answered_at" timestamptz,
  "answered_by" uuid
);
create table public."pending_clients" (
  "id" text not null,
  "stripe_customer_id" text,
  "ghl_contact_id" text,
  "name" text not null,
  "monthly_retainer" numeric,
  "sign_date" date,
  "source" public.pending_source default 'stripe'::pending_source not null,
  "status" public.pending_status default 'pending'::pending_status not null,
  "detected_at" timestamptz default now() not null,
  "raw_payload" jsonb,
  "approved_at" timestamptz,
  "approved_as" text,
  "approved_by" uuid,
  "rejected_at" timestamptz,
  "rejected_by" uuid,
  "rejection_reason" text
);
create table public."profiles" (
  "id" uuid not null,
  "email" text not null,
  "display_name" text,
  "role" public.app_role default 'ca'::app_role not null,
  "ca_id" text,
  "sales_id" text,
  "active" boolean default true not null,
  "start_date" date,
  "created_at" timestamptz default now() not null
);
create table public."push_subscriptions" (
  "id" uuid default uuid_generate_v4() not null,
  "user_id" uuid not null,
  "token" text not null,
  "platform" text not null,
  "app_version" text,
  "active" boolean default true not null,
  "last_seen_at" timestamptz default now() not null,
  "revoked_at" timestamptz,
  "created_at" timestamptz default now() not null
);
create table public."quarter_inputs" (
  "quarter_start" date not null,
  "agency_gross_last_month" numeric default 0 not null,
  "pot_pct" numeric default 0.005 not null,
  "notes" text,
  "updated_at" timestamptz default now() not null,
  "updated_by" uuid
);
create table public."reviews" (
  "id" uuid default uuid_generate_v4() not null,
  "source" public.review_source not null,
  "source_review_id" text not null,
  "source_business_name" text,
  "rating" numeric not null,
  "body" text,
  "reviewer_name" text,
  "reviewed_at" date not null,
  "client_id" text,
  "status" public.review_status default 'unassigned'::review_status not null,
  "assigned_at" timestamptz,
  "assigned_by" uuid,
  "raw_payload" jsonb,
  "ingested_at" timestamptz default now() not null,
  "agency_ingested" boolean default false not null
);
create table public."sales_team" (
  "id" text not null,
  "profile_id" uuid,
  "name" text not null,
  "email" text not null,
  "role" public.sales_role not null,
  "start_date" date not null,
  "active" boolean default true not null,
  "upfront_rate" numeric,
  "mid_rate" numeric,
  "end_rate" numeric
);
create table public."score_snapshots" (
  "id" text not null,
  "ca_id" text not null,
  "quarter_start" date not null,
  "quarter_end" date not null,
  "composite" numeric,
  "performance" numeric,
  "retention" numeric,
  "growth" numeric,
  "book_completeness" numeric,
  "final_payout" numeric,
  "client_count" integer,
  "taken_at" timestamptz default now(),
  "taken_by" uuid
);
create table public."survey_links" (
  "token" text default encode(gen_random_bytes(16), 'hex'::text) not null,
  "client_id" text not null,
  "active" boolean default true not null,
  "created_at" timestamptz default now() not null,
  "created_by" uuid
);
create table public."surveys" (
  "id" text not null,
  "client_id" text not null,
  "ca_id" text,
  "date" date not null,
  "score" integer not null,
  "responded" boolean default true not null,
  "comment" text,
  "source" text default 'internal'::text not null,
  "submitted_by" text,
  "created_at" timestamptz default now() not null
);
create table public."testimonials" (
  "id" text not null,
  "client_id" text,
  "source" text default 'ghl_form'::text not null,
  "submitted_by" text,
  "submitted_at" timestamptz default now() not null,
  "rating" numeric,
  "body" text not null,
  "consent" boolean default false not null,
  "raw_payload" jsonb,
  "status" text default 'new'::text not null
);
create table public."weekly_checkins" (
  "id" text not null,
  "ca_id" text not null,
  "client_id" text not null,
  "week_start" date not null,
  "concern" text,
  "win" text,
  "account_action" text,
  "agency_action" text,
  "notes" text,
  "created_at" timestamptz default now() not null,
  "created_by" uuid,
  "updated_at" timestamptz default now() not null,
  "flagged_inactive" boolean default false not null
);
create table public."weekly_metrics" (
  "id" text not null,
  "ca_id" text not null,
  "client_id" text not null,
  "week_start" date not null,
  "ad_spend" numeric default 0 not null,
  "lead_cost" numeric default 0 not null,
  "leads_generated" integer default 0 not null,
  "appointments_booked" integer default 0 not null,
  "appointments_showed" integer default 0 not null,
  "appointments_closed" integer default 0 not null,
  "client_mrr" numeric default 0 not null,
  "ca_logged_mrr" numeric,
  "stripe_observed_mrr" numeric,
  "client_gross_revenue" numeric default 0 not null,
  "students_acquired" integer default 0 not null,
  "students_cancelled" integer default 0 not null,
  "total_students_start" integer default 0 not null,
  "notes" text,
  "created_at" timestamptz default now() not null,
  "created_by" uuid,
  "updated_at" timestamptz default now() not null,
  "source" text default 'manual'::text not null,
  "field_sources" jsonb default '{}'::jsonb,
  "ghl_synced_at" timestamptz,
  "flagged_inactive" boolean default false not null
);

-- constraints
alter table public."adjustments" add constraint "adjustments_pkey" PRIMARY KEY (id);
alter table public."audit_log" add constraint "audit_log_pkey" PRIMARY KEY (id);
alter table public."call_statuses" add constraint "call_statuses_pkey" PRIMARY KEY (id);
alter table public."cancel_reasons" add constraint "cancel_reasons_pkey" PRIMARY KEY (code);
alter table public."cas" add constraint "cas_pkey" PRIMARY KEY (id);
alter table public."client_score_history" add constraint "client_score_history_pkey" PRIMARY KEY (client_id, computed_at);
alter table public."clients" add constraint "clients_pkey" PRIMARY KEY (id);
alter table public."config" add constraint "config_pkey" PRIMARY KEY (id);
alter table public."edit_requests" add constraint "edit_requests_pkey" PRIMARY KEY (id);
alter table public."ghl_client_tokens" add constraint "ghl_client_tokens_pkey" PRIMARY KEY (client_id);
alter table public."ghl_config" add constraint "ghl_config_pkey" PRIMARY KEY (id);
alter table public."growth_events" add constraint "growth_events_pkey" PRIMARY KEY (id);
alter table public."invites" add constraint "invites_pkey" PRIMARY KEY (email);
alter table public."monthly_checkins" add constraint "monthly_checkins_pkey" PRIMARY KEY (id);
alter table public."monthly_metrics" add constraint "monthly_metrics_pkey" PRIMARY KEY (id);
alter table public."open_questions" add constraint "open_questions_pkey" PRIMARY KEY (id);
alter table public."pending_clients" add constraint "pending_clients_pkey" PRIMARY KEY (id);
alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);
alter table public."push_subscriptions" add constraint "push_subscriptions_pkey" PRIMARY KEY (id);
alter table public."quarter_inputs" add constraint "quarter_inputs_pkey" PRIMARY KEY (quarter_start);
alter table public."reviews" add constraint "reviews_pkey" PRIMARY KEY (id);
alter table public."sales_team" add constraint "sales_team_pkey" PRIMARY KEY (id);
alter table public."score_snapshots" add constraint "score_snapshots_pkey" PRIMARY KEY (id);
alter table public."survey_links" add constraint "survey_links_pkey" PRIMARY KEY (token);
alter table public."surveys" add constraint "surveys_pkey" PRIMARY KEY (id);
alter table public."testimonials" add constraint "testimonials_pkey" PRIMARY KEY (id);
alter table public."weekly_checkins" add constraint "weekly_checkins_pkey" PRIMARY KEY (id);
alter table public."weekly_metrics" add constraint "weekly_metrics_pkey" PRIMARY KEY (id);
alter table public."cas" add constraint "cas_profile_id_key" UNIQUE (profile_id);
alter table public."clients" add constraint "clients_ghl_contact_id_key" UNIQUE (ghl_contact_id);
alter table public."clients" add constraint "clients_stripe_customer_id_key" UNIQUE (stripe_customer_id);
alter table public."monthly_checkins" add constraint "monthly_checkins_client_id_month_key" UNIQUE (client_id, month);
alter table public."monthly_metrics" add constraint "monthly_metrics_client_id_month_key" UNIQUE (client_id, month);
alter table public."profiles" add constraint "profiles_email_key" UNIQUE (email);
alter table public."push_subscriptions" add constraint "push_subscriptions_token_key" UNIQUE (token);
alter table public."reviews" add constraint "reviews_source_source_review_id_key" UNIQUE (source, source_review_id);
alter table public."sales_team" add constraint "sales_team_profile_id_key" UNIQUE (profile_id);
alter table public."score_snapshots" add constraint "score_snapshots_ca_id_quarter_start_key" UNIQUE (ca_id, quarter_start);
alter table public."weekly_checkins" add constraint "weekly_checkins_client_id_week_start_key" UNIQUE (client_id, week_start);
alter table public."weekly_metrics" add constraint "weekly_metrics_client_id_week_start_key" UNIQUE (client_id, week_start);
alter table public."config" add constraint "config_id_check" CHECK ((id = 1));
alter table public."ghl_config" add constraint "ghl_config_id_check" CHECK ((id = 1));
alter table public."push_subscriptions" add constraint "push_subscriptions_platform_check" CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])));
alter table public."surveys" add constraint "surveys_score_check" CHECK (((score >= 1) AND (score <= 10)));
alter table public."adjustments" add constraint "adjustments_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES profiles(id);
alter table public."adjustments" add constraint "adjustments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public."adjustments" add constraint "adjustments_linked_client_fkey" FOREIGN KEY (linked_client) REFERENCES clients(id);
alter table public."adjustments" add constraint "adjustments_rejected_by_fkey" FOREIGN KEY (rejected_by) REFERENCES profiles(id);
alter table public."adjustments" add constraint "adjustments_rep_id_fkey" FOREIGN KEY (rep_id) REFERENCES sales_team(id);
alter table public."audit_log" add constraint "audit_log_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id);
alter table public."cas" add constraint "cas_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id);
alter table public."client_score_history" add constraint "client_score_history_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."clients" add constraint "clients_ae_fkey" FOREIGN KEY (ae) REFERENCES sales_team(id);
alter table public."clients" add constraint "clients_assigned_ca_fkey" FOREIGN KEY (assigned_ca) REFERENCES cas(id);
alter table public."clients" add constraint "clients_cancel_reason_fkey" FOREIGN KEY (cancel_reason) REFERENCES cancel_reasons(code);
alter table public."clients" add constraint "clients_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public."clients" add constraint "clients_sdr_booked_by_fkey" FOREIGN KEY (sdr_booked_by) REFERENCES sales_team(id);
alter table public."config" add constraint "config_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id);
alter table public."edit_requests" add constraint "edit_requests_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES profiles(id);
alter table public."edit_requests" add constraint "edit_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES profiles(id);
alter table public."ghl_client_tokens" add constraint "ghl_client_tokens_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."ghl_client_tokens" add constraint "ghl_client_tokens_installed_by_fkey" FOREIGN KEY (installed_by) REFERENCES profiles(id);
alter table public."ghl_config" add constraint "ghl_config_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id);
alter table public."growth_events" add constraint "growth_events_ca_id_fkey" FOREIGN KEY (ca_id) REFERENCES cas(id);
alter table public."growth_events" add constraint "growth_events_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public."growth_events" add constraint "growth_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public."invites" add constraint "invites_consumed_by_id_fkey" FOREIGN KEY (consumed_by_id) REFERENCES auth.users(id);
alter table public."invites" add constraint "invites_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES auth.users(id);
alter table public."monthly_checkins" add constraint "monthly_checkins_ca_id_fkey" FOREIGN KEY (ca_id) REFERENCES cas(id);
alter table public."monthly_checkins" add constraint "monthly_checkins_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public."monthly_checkins" add constraint "monthly_checkins_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public."monthly_metrics" add constraint "monthly_metrics_ca_id_fkey" FOREIGN KEY (ca_id) REFERENCES cas(id);
alter table public."monthly_metrics" add constraint "monthly_metrics_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public."monthly_metrics" add constraint "monthly_metrics_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public."open_questions" add constraint "open_questions_answered_by_fkey" FOREIGN KEY (answered_by) REFERENCES profiles(id);
alter table public."pending_clients" add constraint "pending_clients_approved_as_fkey" FOREIGN KEY (approved_as) REFERENCES clients(id);
alter table public."pending_clients" add constraint "pending_clients_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES profiles(id);
alter table public."pending_clients" add constraint "pending_clients_rejected_by_fkey" FOREIGN KEY (rejected_by) REFERENCES profiles(id);
alter table public."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."push_subscriptions" add constraint "push_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."quarter_inputs" add constraint "quarter_inputs_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id);
alter table public."reviews" add constraint "reviews_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES profiles(id);
alter table public."reviews" add constraint "reviews_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public."sales_team" add constraint "sales_team_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id);
alter table public."score_snapshots" add constraint "score_snapshots_ca_id_fkey" FOREIGN KEY (ca_id) REFERENCES cas(id);
alter table public."score_snapshots" add constraint "score_snapshots_taken_by_fkey" FOREIGN KEY (taken_by) REFERENCES profiles(id);
alter table public."survey_links" add constraint "survey_links_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public."survey_links" add constraint "survey_links_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public."surveys" add constraint "surveys_ca_id_fkey" FOREIGN KEY (ca_id) REFERENCES cas(id);
alter table public."surveys" add constraint "surveys_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public."testimonials" add constraint "testimonials_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public."weekly_checkins" add constraint "weekly_checkins_ca_id_fkey" FOREIGN KEY (ca_id) REFERENCES cas(id);
alter table public."weekly_checkins" add constraint "weekly_checkins_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public."weekly_checkins" add constraint "weekly_checkins_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public."weekly_metrics" add constraint "weekly_metrics_ca_id_fkey" FOREIGN KEY (ca_id) REFERENCES cas(id);
alter table public."weekly_metrics" add constraint "weekly_metrics_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public."weekly_metrics" add constraint "weekly_metrics_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);

-- views
create or replace view public.v_monthly_metrics_effective as
 WITH weekly_rolled AS (
         SELECT wm.client_id,
            (array_agg(wm.ca_id ORDER BY wm.week_start))[1] AS ca_id,
            date_trunc('month'::text, wm.week_start::timestamp with time zone)::date AS month,
            sum(wm.ad_spend) AS ad_spend,
            sum(wm.leads_generated)::integer AS leads_generated,
            sum(wm.appointments_booked)::integer AS appointments_booked,
            sum(wm.appointments_showed)::integer AS appointments_showed,
            sum(wm.appointments_closed)::integer AS appointments_closed,
            sum(wm.students_acquired)::integer AS students_acquired,
            sum(wm.students_cancelled)::integer AS students_cancelled,
            (array_agg(wm.client_mrr ORDER BY wm.week_start DESC))[1] AS client_mrr,
            (array_agg(wm.ca_logged_mrr ORDER BY wm.week_start DESC))[1] AS ca_logged_mrr,
            (array_agg(wm.stripe_observed_mrr ORDER BY wm.week_start DESC))[1] AS stripe_observed_mrr,
            (array_agg(wm.client_gross_revenue ORDER BY wm.week_start DESC))[1] AS client_gross_revenue,
            (array_agg(wm.total_students_start ORDER BY wm.week_start DESC))[1] AS total_students_start,
                CASE
                    WHEN sum(wm.leads_generated) > 0 THEN sum(wm.ad_spend) / sum(wm.leads_generated)::numeric
                    ELSE 0::numeric
                END AS lead_cost,
            'weekly_rolled'::text AS source_kind,
            count(*)::integer AS week_count
           FROM weekly_metrics wm
          GROUP BY wm.client_id, (date_trunc('month'::text, wm.week_start::timestamp with time zone))
        )
 SELECT (('WMR-'::text || wr.client_id) || '-'::text) || to_char(wr.month::timestamp with time zone, 'YYYY-MM'::text) AS id,
    wr.ca_id,
    wr.client_id,
    wr.month,
    wr.ad_spend,
    wr.lead_cost,
    wr.leads_generated,
    wr.appointments_booked,
    wr.appointments_showed,
    wr.appointments_closed,
    wr.client_mrr,
    wr.ca_logged_mrr,
    wr.stripe_observed_mrr,
    wr.client_gross_revenue,
    wr.students_acquired,
    wr.students_cancelled,
    wr.total_students_start,
    NULL::text AS notes,
    wr.source_kind AS source,
    jsonb_build_object('_kind', 'weekly_rolled', 'week_count', wr.week_count) AS field_sources,
    NULL::timestamp with time zone AS ghl_synced_at,
    wr.week_count
   FROM weekly_rolled wr
UNION ALL
 SELECT mm.id,
    mm.ca_id,
    mm.client_id,
    mm.month,
    mm.ad_spend,
    mm.lead_cost,
    mm.leads_generated,
    mm.appointments_booked,
    mm.appointments_showed,
    mm.appointments_closed,
    mm.client_mrr,
    mm.ca_logged_mrr,
    mm.stripe_observed_mrr,
    mm.client_gross_revenue,
    mm.students_acquired,
    mm.students_cancelled,
    mm.total_students_start,
    mm.notes,
    mm.source,
    COALESCE(mm.field_sources, '{}'::jsonb) AS field_sources,
    mm.ghl_synced_at,
    0 AS week_count
   FROM monthly_metrics mm
  WHERE NOT (EXISTS ( SELECT 1
           FROM weekly_metrics wm2
          WHERE wm2.client_id = mm.client_id AND date_trunc('month'::text, wm2.week_start::timestamp with time zone)::date = mm.month));

-- materialized views
create materialized view public.v_client_sub_scores as
 SELECT c.id AS client_id,
    c.assigned_ca,
    c.tier,
    (sub.s).mrr_growth AS mrr_growth,
    (sub.s).lead_cost AS lead_cost,
    (sub.s).ad_spend AS ad_spend,
    (sub.s).funnel AS funnel,
    (sub.s).attrition AS attrition,
    (sub.s).performance AS performance
   FROM clients c,
    LATERAL ( SELECT fn_client_sub_scores(c.id) AS s) sub
  WHERE c.cancel_date IS NULL;

-- indexes
CREATE INDEX adjustments_rep_id_idx ON public.adjustments USING btree (rep_id);
CREATE INDEX adjustments_status_idx ON public.adjustments USING btree (status);
CREATE INDEX audit_log_actor_id_idx ON public.audit_log USING btree (actor_id);
CREATE INDEX audit_log_at_idx ON public.audit_log USING btree (at DESC);
CREATE INDEX audit_log_table_name_row_id_idx ON public.audit_log USING btree (table_name, row_id);
CREATE INDEX clients_ae_idx ON public.clients USING btree (ae);
CREATE INDEX clients_assigned_ca_idx ON public.clients USING btree (assigned_ca);
CREATE INDEX clients_cancel_date_idx ON public.clients USING btree (cancel_date) WHERE (cancel_date IS NULL);
CREATE INDEX idx_clients_ghl_location ON public.clients USING btree (ghl_location_id);
CREATE INDEX edit_requests_status_idx ON public.edit_requests USING btree (status);
CREATE INDEX edit_requests_table_name_row_id_idx ON public.edit_requests USING btree (table_name, row_id);
CREATE INDEX growth_events_ca_id_idx ON public.growth_events USING btree (ca_id);
CREATE INDEX growth_events_client_id_idx ON public.growth_events USING btree (client_id);
CREATE INDEX invites_consumed_idx ON public.invites USING btree (consumed_at);
CREATE INDEX monthly_checkins_ca_id_month_idx ON public.monthly_checkins USING btree (ca_id, month);
CREATE INDEX monthly_checkins_flagged_idx ON public.monthly_checkins USING btree (client_id) WHERE flagged_inactive;
CREATE INDEX monthly_checkins_month_idx ON public.monthly_checkins USING btree (month);
CREATE INDEX monthly_metrics_ca_id_month_idx ON public.monthly_metrics USING btree (ca_id, month);
CREATE INDEX monthly_metrics_flagged_idx ON public.monthly_metrics USING btree (client_id) WHERE flagged_inactive;
CREATE INDEX monthly_metrics_month_idx ON public.monthly_metrics USING btree (month);
CREATE INDEX pending_clients_status_idx ON public.pending_clients USING btree (status);
CREATE INDEX push_subscriptions_user_active ON public.push_subscriptions USING btree (user_id) WHERE active;
CREATE INDEX reviews_client_id_idx ON public.reviews USING btree (client_id);
CREATE INDEX reviews_status_idx ON public.reviews USING btree (status);
CREATE INDEX survey_links_client_id_idx ON public.survey_links USING btree (client_id);
CREATE INDEX surveys_client_id_date_idx ON public.surveys USING btree (client_id, date DESC);
CREATE INDEX idx_testimonials_client ON public.testimonials USING btree (client_id);
CREATE INDEX idx_testimonials_status ON public.testimonials USING btree (status);
CREATE UNIQUE INDEX v_client_sub_scores_pk ON public.v_client_sub_scores USING btree (client_id);
CREATE INDEX weekly_checkins_ca_id_week_idx ON public.weekly_checkins USING btree (ca_id, week_start);
CREATE INDEX weekly_checkins_flagged_idx ON public.weekly_checkins USING btree (client_id) WHERE flagged_inactive;
CREATE INDEX weekly_checkins_week_idx ON public.weekly_checkins USING btree (week_start);
CREATE INDEX weekly_metrics_ca_id_week_idx ON public.weekly_metrics USING btree (ca_id, week_start);
CREATE INDEX weekly_metrics_client_idx ON public.weekly_metrics USING btree (client_id, week_start);
CREATE INDEX weekly_metrics_flagged_idx ON public.weekly_metrics USING btree (client_id) WHERE flagged_inactive;
CREATE INDEX weekly_metrics_week_idx ON public.weekly_metrics USING btree (week_start);

-- functions
CREATE OR REPLACE FUNCTION public._push_fanout(p_event text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_url text := _push_fanout_url();
begin
  if v_url is null then return; end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := jsonb_build_object('event', p_event, 'payload', p_payload)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public._push_fanout_url()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select values->>'push_fanout_url' from config where id = 1;
$function$
;

CREATE OR REPLACE FUNCTION public.caller_ca_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select ca_id from profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.caller_role()
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select role from profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.caller_sales_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select sales_id from profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.current_profile()
 RETURNS profiles
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select * from profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.fn_active_tokens_for(p_user_id uuid)
 RETURNS TABLE(token text, platform text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select token, platform from push_subscriptions
  where user_id = p_user_id and active and revoked_at is null;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_apply_edit_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  k text;
  v jsonb;
  db_k text;
  sql text;
  set_clauses text[] := '{}';
begin
  -- Only fire when status flips to approved.
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  -- Delete-request branch (Bobby 2026-05-12). When the CA's submission
  -- carried _action=delete, drop the row instead of updating it.
  if (new.field_changes ? '_action') and (new.field_changes ->> '_action' = 'delete') then
    execute format('delete from %I where id = %L', new.table_name, new.row_id);
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
    return new;
  end if;

  for k, v in select * from jsonb_each(new.field_changes) loop
    -- Skip metadata keys that aren't real columns (e.g. _action handled above).
    if k like '\_%' escape '\' then
      continue;
    end if;
    -- Normalize keys: accept both camelCase (frontend pre-2026-05-12) and
    -- snake_case (canonical column names).
    db_k := case k
      when 'clientMRR'           then 'client_mrr'
      when 'clientGrossRevenue'  then 'client_gross_revenue'
      when 'caLoggedMRR'         then 'ca_logged_mrr'
      when 'stripeObservedMRR'   then 'stripe_observed_mrr'
      when 'adSpend'             then 'ad_spend'
      when 'leadCost'            then 'lead_cost'
      when 'leadsGenerated'      then 'leads_generated'
      when 'apptsBooked'         then 'appointments_booked'
      when 'leadsShowed'         then 'appointments_showed'
      when 'leadsSigned'         then 'appointments_closed'
      when 'appointmentsBooked'  then 'appointments_booked'
      when 'appointmentsShowed'  then 'appointments_showed'
      when 'appointmentsClosed'  then 'appointments_closed'
      when 'studentsAcquired'    then 'students_acquired'
      when 'studentsCancelled'   then 'students_cancelled'
      when 'totalStudentsStart'  then 'total_students_start'
      when 'flaggedInactive'     then 'flagged_inactive'
      when 'weekStart'           then 'week_start'
      when 'eventType'           then 'event_type'
      when 'saleTotal'           then 'sale_total'
      when 'accountAction'       then 'account_action'
      when 'agencyAction'        then 'agency_action'
      when 'fieldSources'        then 'field_sources'
      when 'signDate'            then 'sign_date'
      when 'cancelDate'          then 'cancel_date'
      when 'cancelReason'        then 'cancel_reason'
      when 'monthlyRetainer'     then 'monthly_retainer'
      when 'termMonths'          then 'term_months'
      when 'hasMembershipAddon'  then 'has_membership_addon'
      when 'membershipStartDate' then 'membership_start_date'
      when 'loggingCadence'      then 'logging_cadence'
      when 'assignedCA'          then 'assigned_ca'
      when 'sdrBookedBy'         then 'sdr_booked_by'
      when 'stripeCustomerId'    then 'stripe_customer_id'
      when 'stripeTruthMode'     then 'stripe_truth_mode'
      when 'upfrontPct'          then 'upfront_pct'
      when 'midPct'              then 'mid_pct'
      when 'endPct'              then 'end_pct'
      else k
    end;
    set_clauses := set_clauses || format('%I = %L', db_k, v->>'new');
  end loop;

  -- If after stripping the _action key there are no fields to set, skip
  -- the UPDATE (otherwise the dynamic SQL would error on empty SET list).
  if array_length(set_clauses, 1) is null then
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
    return new;
  end if;

  sql := format('update %I set %s where id = %L',
                new.table_name, array_to_string(set_clauses, ', '), new.row_id);
  execute sql;

  new.reviewed_at := now();
  new.reviewed_by := auth.uid();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  diff jsonb;
  rid  text;
begin
  if tg_op = 'INSERT' then
    diff := to_jsonb(new);
    rid  := coalesce(new.id::text, '');
  elsif tg_op = 'UPDATE' then
    select jsonb_object_agg(key, jsonb_build_object('old', o.value, 'new', n.value))
      into diff
      from jsonb_each(to_jsonb(old)) o
      join jsonb_each(to_jsonb(new)) n using (key)
     where o.value is distinct from n.value;
    rid := coalesce(new.id::text, '');
  else
    diff := to_jsonb(old);
    rid  := coalesce(old.id::text, '');
  end if;

  insert into audit_log (actor_id, actor_email, action, table_name, row_id, diff)
  values (auth.uid(),
          (select email from profiles where id = auth.uid()),
          lower(tg_op),
          tg_table_name,
          rid,
          diff);

  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_auto_link_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  match_id text;
begin
  if new.client_id is not null then return new; end if;

  select id into match_id from clients
   where lower(regexp_replace(name, '[^a-z0-9]', '', 'g')) =
         lower(regexp_replace(new.source_business_name, '[^a-z0-9]', '', 'g'))
   limit 1;

  if match_id is not null then
    new.client_id := match_id;
    new.status    := 'assigned';
    new.assigned_at := now();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_ca_scorecard(p_ca_id text, p_quarter_start date DEFAULT NULL::date, p_quarter_end date DEFAULT NULL::date)
 RETURNS TABLE(composite numeric, performance numeric, retention numeric, growth numeric, book_completeness numeric, final_payout numeric, max_payout numeric, client_count integer, mrr_share numeric, total_pot numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
#variable_conflict use_column
declare
  v_qstart        date := coalesce(p_quarter_start, fn_cfg_text('quarterStart')::date);
  v_qend          date := coalesce(p_quarter_end,   fn_cfg_text('quarterEnd')::date);
  v_grace_days    int  := coalesce(fn_cfg('gracePeriodDays')::int, 90);
  v_cliff         numeric := coalesce(fn_cfg('retentionCliff'), 0.97);
  v_count         int;
  v_perf          numeric;
  v_perf_gated    numeric;
  v_ret           numeric;
  v_grow          numeric;
  v_filled        int;
  v_expected      int;
  v_book          numeric;
  v_comp          numeric;
  v_months        int;
  v_eligible_at_start int;
  v_cancelled     int;
  v_retain_rate   numeric;
  v_ca_mrr        numeric;
  v_all_mrr       numeric;
  v_share         numeric;
  v_pot           numeric;
  v_qi            record;
  v_total_pts     numeric := 0;
  v_max_pts       numeric := 0;
begin
  select count(*) into v_count from public.clients
  where assigned_ca = p_ca_id
    and cancel_date is null
    and tier in ('standard', 'vip');

  if v_count = 0 then
    return query select 0::numeric, 0::numeric, 0::numeric, 0::numeric,
                        0::numeric, 0::numeric, 0::numeric, 0,
                        0::numeric, 0::numeric;
    return;
  end if;

  select avg(performance) into v_perf
    from public.v_client_sub_scores
   where assigned_ca = p_ca_id
     and tier in ('standard', 'vip')
     and performance is not null;

  v_months := (extract(year from v_qend)::int - extract(year from v_qstart)::int) * 12
            + (extract(month from v_qend)::int - extract(month from v_qstart)::int) + 1;
  v_expected := v_count * greatest(v_months, 1);

  select count(*)
    into v_filled
  from public.v_monthly_metrics_effective v
  join public.clients c on c.id = v.client_id
  where c.assigned_ca = p_ca_id
    and c.cancel_date is null
    and c.tier in ('standard', 'vip')
    and v.month between v_qstart and v_qend;

  v_book := case when v_expected > 0
                 then fn_clamp(v_filled::numeric / v_expected, 0, 1)
                 else 0 end;

  v_perf_gated := case when v_perf is not null then v_perf * v_book else null end;

  -- Retention: eligible at quarter start
  select count(*) into v_eligible_at_start from public.clients
   where assigned_ca = p_ca_id
     and tier in ('standard', 'vip')
     and sign_date < v_qstart;

  -- "Cancelled or flagged inactive" — the union counts each client once.
  -- Cancellation requires cancel_reason.counts_against_ca; flagged_inactive
  -- is unconditional (CA explicitly marked the period inactive).
  with at_risk as (
    -- Real cancellations that count against the CA
    select c.id
      from public.clients c
      left join public.cancel_reasons cr on cr.code = c.cancel_reason
     where c.assigned_ca = p_ca_id
       and c.tier in ('standard', 'vip')
       and c.sign_date < v_qstart
       and c.cancel_date between v_qstart and v_qend
       and (cr.counts_against_ca is null or cr.counts_against_ca = true)
    union
    -- Flagged-inactive in the quarter (any of the 4 log tables)
    select c.id
      from public.clients c
     where c.assigned_ca = p_ca_id
       and c.tier in ('standard', 'vip')
       and c.sign_date < v_qstart
       and (
         exists (select 1 from public.monthly_metrics  m where m.client_id = c.id and m.flagged_inactive and m.month       between v_qstart and v_qend) or
         exists (select 1 from public.weekly_metrics   w where w.client_id = c.id and w.flagged_inactive and w.week_start  between v_qstart and v_qend) or
         exists (select 1 from public.monthly_checkins m where m.client_id = c.id and m.flagged_inactive and m.month       between v_qstart and v_qend) or
         exists (select 1 from public.weekly_checkins  w where w.client_id = c.id and w.flagged_inactive and w.week_start  between v_qstart and v_qend)
       )
  )
  select count(*) into v_cancelled from at_risk;

  if v_eligible_at_start > 0 then
    v_retain_rate := (v_eligible_at_start - v_cancelled)::numeric / v_eligible_at_start;
    v_ret := case
      when v_retain_rate >= 1     then 1
      when v_retain_rate <= v_cliff then 0
      else (v_retain_rate - v_cliff) / nullif(1 - v_cliff, 0)
    end;
  else
    v_ret := null;
  end if;

  -- Growth (unchanged)
  with eligible as (
    select c.id, c.tier, c.has_membership_addon
      from public.clients c
     where c.assigned_ca = p_ca_id
       and c.cancel_date is null
       and c.tier in ('standard', 'vip')
       and (now()::date - c.sign_date) >= v_grace_days
  ),
  per_client as (
    select e.id, e.tier, e.has_membership_addon,
      (select count(*) from public.growth_events ge
        where ge.client_id = e.id
          and ge.date between v_qstart and v_qend
          and lower(ge.event_type) like '%review%') as reviews,
      (select count(*) from public.growth_events ge
        where ge.client_id = e.id
          and ge.date between v_qstart and v_qend
          and lower(ge.event_type) like '%testimonial%') as testimonials,
      (select count(*) from public.growth_events ge
        where ge.client_id = e.id
          and ge.date between v_qstart and v_qend
          and lower(ge.event_type) like '%case%') as cases,
      (select count(*) from public.growth_events ge
        where ge.client_id = e.id
          and ge.date between v_qstart and v_qend
          and lower(ge.event_type) like '%referral%') as referrals,
      (select count(*) from public.growth_events ge
        where ge.client_id = e.id
          and ge.date between v_qstart and v_qend
          and lower(ge.event_type) like '%gear%') as gear
    from eligible e
  )
  select
    coalesce(sum(
      case when reviews      > 0 then 1 else 0 end +
      case when testimonials > 0 then 1 else 0 end +
      case when cases        > 0 then 1 else 0 end +
      case when referrals    > 0 then 1 else 0 end +
      case when tier = 'vip' then 1 else 0 end +
      case when has_membership_addon then 1 else 0 end +
      case when gear         > 0 then 1 else 0 end +
      least(1, greatest(0, (referrals - 1) * 0.25))
    ), 0),
    coalesce(count(*) * 8, 0)
  into v_total_pts, v_max_pts
  from per_client;

  v_grow := case when v_max_pts > 0 then fn_clamp(v_total_pts / v_max_pts, 0, 1) else null end;

  with bs(b) as (values (v_perf_gated), (v_ret), (v_grow))
  select coalesce(avg(b), 0) into v_comp from bs where b is not null;

  -- Bonus pot
  select * into v_qi from public.quarter_inputs where quarter_start = v_qstart limit 1;
  if v_qi.quarter_start is not null then
    v_pot := v_qi.agency_gross_last_month * v_qi.pot_pct;
  else
    v_pot := coalesce(fn_cfg('agencyGrossLastMonth'), 0) * coalesce(fn_cfg('potPercentage'), 0.005);
  end if;

  select coalesce(sum(
    coalesce(
      (select client_mrr from public.v_monthly_metrics_effective
        where client_id = c.id and month <= v_qstart
        order by month desc limit 1),
      c.monthly_retainer
    )
  ), 0) into v_ca_mrr
  from public.clients c
  where c.assigned_ca = p_ca_id
    and c.cancel_date is null
    and c.tier in ('standard', 'vip');

  select coalesce(sum(
    coalesce(
      (select client_mrr from public.v_monthly_metrics_effective
        where client_id = c.id and month <= v_qstart
        order by month desc limit 1),
      c.monthly_retainer
    )
  ), 0) into v_all_mrr
  from public.clients c
  join public.cas a on a.id = c.assigned_ca and a.active = true
  where c.cancel_date is null
    and c.tier in ('standard', 'vip');

  v_share := case when v_all_mrr > 0 then v_ca_mrr / v_all_mrr else 0 end;

  return query select
    coalesce(v_comp, 0)                                  as composite,
    coalesce(v_perf_gated, 0)                            as performance,
    coalesce(v_ret, 0)                                   as retention,
    coalesce(v_grow, 0)                                  as growth,
    coalesce(v_book, 0)                                  as book_completeness,
    round(v_pot * v_share * coalesce(v_comp, 0))         as final_payout,
    round(v_pot * v_share)                               as max_payout,
    v_count                                              as client_count,
    v_share                                              as mrr_share,
    v_pot                                                as total_pot;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_cfg(key text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  select (values->>key)::numeric from config where id = 1;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_cfg_text(key text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select values->>key from config where id = 1;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_check_score_drops()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare r record;
begin
  for r in
    select c.id as client_id, c.assigned_ca, p.id as ca_user_id,
           v.composite_score as new_score
    from clients c
    left join cas ca on ca.id = c.assigned_ca
    left join profiles p on p.ca_id = ca.id and p.role = 'ca'
    join v_client_sub_scores v on v.client_id = c.id
    where c.cancel_date is null
  loop
    declare
      v_prev numeric;
      v_prev_bucket text;
      v_new_bucket  text := fn_score_bucket(r.new_score);
    begin
      select score, bucket into v_prev, v_prev_bucket
      from client_score_history
      where client_id = r.client_id
      order by computed_at desc limit 1;

      -- Always log the new sample.
      insert into client_score_history (client_id, score, bucket)
      values (r.client_id, r.new_score, v_new_bucket);

      if v_prev_bucket is not null
         and v_new_bucket <> v_prev_bucket
         and array_position(array['healthy','watch','at_risk','churning'], v_new_bucket)
           > array_position(array['healthy','watch','at_risk','churning'], v_prev_bucket)
         and r.ca_user_id is not null
      then
        perform _push_fanout('score_bucket_drop', jsonb_build_object(
          'client_id',   r.client_id,
          'ca_user_id',  r.ca_user_id,
          'prev_bucket', v_prev_bucket,
          'new_bucket',  v_new_bucket,
          'score',       r.new_score
        ));
      end if;
    end;
  end loop;
end; $function$
;

CREATE OR REPLACE FUNCTION public.fn_clamp(n numeric, lo numeric, hi numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select greatest(lo, least(hi, n));
$function$
;

CREATE OR REPLACE FUNCTION public.fn_client_sub_scores(p_client_id text)
 RETURNS TABLE(mrr_growth numeric, lead_cost numeric, ad_spend numeric, funnel numeric, attrition numeric, performance numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
#variable_conflict use_column
declare
  c               record;
  v_grace_days    int     := coalesce(fn_cfg('gracePeriodDays')::int, 90);
  v_age_days      int;
  v_in_grace      boolean;

  -- Quarter window from config (fall back to current calendar quarter)
  v_qstart        date := coalesce(
    nullif(fn_cfg_text('quarterStart'), '')::date,
    date_trunc('quarter', current_date)::date
  );
  v_qend          date := coalesce(
    nullif(fn_cfg_text('quarterEnd'), '')::date,
    (date_trunc('quarter', current_date) + interval '3 months - 1 day')::date
  );

  -- Quarter-aggregated rollups from v_monthly_metrics_effective
  -- (which itself folds weekly_metrics into synthetic monthly rows)
  v_q_count        int;
  v_q_ad_spend     numeric;
  v_q_leads        int;
  v_q_booked       int;
  v_q_showed       int;
  v_q_closed       int;
  v_q_cancelled    int;
  v_q_first_mrr    numeric;
  v_q_last_mrr     numeric;
  v_q_first_start  int;
  v_q_target       numeric;

  -- thresholds (config defaults)
  v_full_credit_growth numeric := coalesce(fn_cfg('fullCreditMrrGrowth'), 750);
  v_lc_best       numeric := coalesce(fn_cfg('leadCostBest'),       5);
  v_lc_great      numeric := coalesce(fn_cfg('leadCostGreat'),      10);
  v_lc_ok         numeric := coalesce(fn_cfg('leadCostAcceptable'), 20);
  v_ad_pct        numeric := coalesce(fn_cfg('adSpendPctOfGross'),  0.10);
  v_ad_floor      numeric := coalesce(fn_cfg('adSpendFloor'),       1000);
  v_book_floor    numeric := coalesce(fn_cfg('bookingFloor'),       0.30);
  v_show_floor    numeric := coalesce(fn_cfg('showFloor'),          0.50);
  v_close_floor   numeric := coalesce(fn_cfg('closeFloor'),         0.70);
  v_att_green     numeric := coalesce(fn_cfg('attritionGreenFloor'), 0.03);
  v_att_crit      numeric := coalesce(fn_cfg('attritionCriticalCeiling'), 0.05);

  -- Output
  o_mrr_growth    numeric;
  o_lead_cost     numeric;
  o_ad_spend      numeric;
  o_funnel        numeric;
  o_attrition     numeric;
  o_perf          numeric;
  parts numeric[] := array[]::numeric[];
begin
  select * into c from public.clients where id = p_client_id;
  if not found then return; end if;

  v_age_days := extract(day from (now() - c.sign_date::timestamptz))::int;
  v_in_grace := v_age_days < v_grace_days;

  -- Quarter aggregates from the effective view (weekly → monthly already handled)
  select
    count(*),
    coalesce(sum(v.ad_spend), 0),
    coalesce(sum(v.leads_generated), 0)::int,
    coalesce(sum(v.appointments_booked), 0)::int,
    coalesce(sum(v.appointments_showed), 0)::int,
    coalesce(sum(v.appointments_closed), 0)::int,
    coalesce(sum(v.students_cancelled), 0)::int,
    (array_agg(v.client_mrr           order by v.month asc))[1],
    (array_agg(v.client_mrr           order by v.month desc))[1],
    (array_agg(v.total_students_start order by v.month asc))[1]
  into v_q_count, v_q_ad_spend, v_q_leads, v_q_booked, v_q_showed,
       v_q_closed, v_q_cancelled,
       v_q_first_mrr, v_q_last_mrr, v_q_first_start
  from public.v_monthly_metrics_effective v
  where v.client_id = p_client_id
    and v.month between v_qstart and v_qend;

  -- Quarterly ad-spend target = SUM over quarter of MAX(floor, MRR × pct)
  select coalesce(sum(greatest(v_ad_floor, coalesce(v.client_mrr, 0) * v_ad_pct)), 0)
    into v_q_target
    from public.v_monthly_metrics_effective v
   where v.client_id = p_client_id
     and v.month between v_qstart and v_qend;

  -- ── MRR Growth: linear $0 → fullCreditMrrGrowth (need 2+ months in quarter) ──
  if coalesce(v_q_count, 0) >= 2 and v_q_first_mrr is not null and v_q_last_mrr is not null then
    o_mrr_growth := fn_clamp(
      (v_q_last_mrr - v_q_first_mrr) / nullif(v_full_credit_growth, 0), 0, 1
    );
  else
    o_mrr_growth := null;
  end if;

  -- ── Lead Cost: stepped on quarterly aggregate ────────────────────────────
  if v_q_leads > 0 and v_q_ad_spend > 0 then
    declare v_q_lc numeric := v_q_ad_spend / v_q_leads;
    begin
      o_lead_cost := case
        when v_q_lc <= v_lc_best  then 1.0
        when v_q_lc <= v_lc_great then 0.75
        when v_q_lc <= v_lc_ok    then 0.50
        else 0
      end;
    end;
  else
    o_lead_cost := null;
  end if;

  -- ── Ad Spend: hit-rate against quarterly target ──────────────────────────
  if v_q_ad_spend > 0 and v_q_target > 0 then
    if v_q_ad_spend >= v_q_target then o_ad_spend := 1;
    else o_ad_spend := fn_clamp(v_q_ad_spend / v_q_target, 0, 1);
    end if;
  else
    o_ad_spend := null;
  end if;

  -- ── Funnel: book/show/close rates over quarterly totals ──────────────────
  if (v_q_leads > 0 or v_q_booked > 0 or v_q_showed > 0) then
    declare
      r_book  numeric := case when v_q_leads  > 0 then v_q_booked::numeric  / v_q_leads  else 0 end;
      r_show  numeric := case when v_q_booked > 0 then v_q_showed::numeric  / v_q_booked else 0 end;
      r_close numeric := case when v_q_showed > 0 then v_q_closed::numeric  / v_q_showed else 0 end;
    begin
      o_funnel := (
        fn_clamp(r_book  / nullif(v_book_floor,  0), 0, 1) +
        fn_clamp(r_show  / nullif(v_show_floor,  0), 0, 1) +
        fn_clamp(r_close / nullif(v_close_floor, 0), 0, 1)
      ) / 3.0;
    end;
  else
    o_funnel := null;
  end if;

  -- ── Attrition: quarterly cancels / starting students ─────────────────────
  if coalesce(v_q_first_start, 0) > 0 then
    declare v_rate numeric := v_q_cancelled::numeric / v_q_first_start;
    begin
      o_attrition := case
        when v_rate <= v_att_green then 1
        when v_rate >= v_att_crit  then 0
        else 1 - (v_rate - v_att_green) / nullif(v_att_crit - v_att_green, 0)
      end;
    end;
  else
    o_attrition := null;
  end if;

  -- 90-day grace: leave nulls as nulls (skip from average), per Bobby's "no data = not green".
  if v_in_grace then null; end if;

  -- Performance composite = avg of non-null sub-scores
  if o_mrr_growth is not null then parts := parts || o_mrr_growth; end if;
  if o_lead_cost  is not null then parts := parts || o_lead_cost;  end if;
  if o_ad_spend   is not null then parts := parts || o_ad_spend;   end if;
  if o_funnel     is not null then parts := parts || o_funnel;     end if;
  if o_attrition  is not null then parts := parts || o_attrition;  end if;
  if array_length(parts, 1) is not null then
    o_perf := (select avg(p) from unnest(parts) p);
  else
    o_perf := null;
  end if;

  return query select o_mrr_growth, o_lead_cost, o_ad_spend, o_funnel, o_attrition, o_perf;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_consume_invite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  inv invites%rowtype;
begin
  select * into inv from invites
   where lower(email) = lower(new.email)
     and consumed_at is null
   limit 1;

  if not found then
    return new;  -- BEFORE trigger should have blocked, but bail gracefully
  end if;

  -- Create profile from invite metadata
  insert into profiles (id, email, display_name, role, ca_id, sales_id)
  values (
    new.id,
    new.email,
    coalesce(inv.full_name, new.raw_user_meta_data->>'full_name'),
    inv.role,
    inv.ca_id,
    inv.sales_id
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    role         = excluded.role,
    ca_id        = excluded.ca_id,
    sales_id     = excluded.sales_id;

  -- Mark invite consumed
  update invites
     set consumed_at    = now(),
         consumed_by_id = new.id
   where email = inv.email;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_edit_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  cfg               jsonb;
  grace_days        int;
  approval_fields   jsonb;
  age_days          int;
  caller            profiles;
  changed           jsonb;
begin
  select values into cfg from config where id = 1;
  grace_days      := coalesce((cfg->>'edit_grace_days')::int, 7);
  approval_fields := coalesce(cfg->'edit_fields_requiring_approval', '[]'::jsonb);

  caller := current_profile();
  if caller.role = 'owner' and coalesce((cfg->>'owner_skips_approval')::bool, true) then
    return new;  -- owner bypass
  end if;

  -- compute row age (use created_at if present, else fall back to now)
  age_days := extract(day from now() - coalesce(new.created_at, now()))::int;
  if age_days <= grace_days then
    return new;  -- inside grace window, allow direct edit
  end if;

  -- diff
  select jsonb_object_agg(key, jsonb_build_object('old', o.value, 'new', n.value))
    into changed
    from jsonb_each(to_jsonb(old)) o
    join jsonb_each(to_jsonb(new)) n using (key)
   where o.value is distinct from n.value
     and approval_fields ? key;

  if changed is null or changed = '{}'::jsonb then
    return new;  -- no gated fields touched
  end if;

  insert into edit_requests (table_name, row_id, field_changes, requested_by, reason)
  values (tg_table_name, new.id::text, changed, auth.uid(), 'auto-captured');

  -- block the actual update
  return old;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_enforce_invite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if not exists (
    select 1 from invites
     where lower(email) = lower(new.email)
       and consumed_at is null
  ) then
    raise exception 'You have not been invited. Ask Bobby to add your email.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_notify_adjustment_pending()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if NEW.status = 'Pending' and (OLD.status is distinct from 'Pending') then
    perform _push_fanout('adjustment_pending', to_jsonb(NEW));
  end if;
  return NEW;
end; $function$
;

CREATE OR REPLACE FUNCTION public.fn_notify_edit_request()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  perform _push_fanout('edit_request_created', to_jsonb(NEW));
  return NEW;
end; $function$
;

CREATE OR REPLACE FUNCTION public.fn_notify_pending_client()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  perform _push_fanout('pending_client_created', to_jsonb(NEW));
  return NEW;
end; $function$
;

CREATE OR REPLACE FUNCTION public.fn_notify_retention_flag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  was_flagged boolean := false;
  v_period    text;
begin
  if tg_op = 'UPDATE' then
    was_flagged := coalesce(old.flagged_inactive, false);
  end if;

  if coalesce(new.flagged_inactive, false) = true and was_flagged = false then
    -- monthly_* use 'month'; weekly_* use 'week_start'. Introspect via jsonb
    -- so we never touch a column that doesn't exist on the row.
    v_period := coalesce((to_jsonb(new) ->> 'month'), (to_jsonb(new) ->> 'week_start'));

    insert into audit_log (actor_id, actor_email, action, table_name, row_id, diff)
    values (
      auth.uid(),
      coalesce((select email from profiles where id = auth.uid()), '(unknown)'),
      'retention_flag', tg_table_name, new.id::text,
      jsonb_build_object('client_id', new.client_id, 'period', v_period)
    );

    perform _push_fanout('retention_flag', jsonb_build_object(
      'table', tg_table_name, 'row_id', new.id::text,
      'client_id', new.client_id, 'ca_id', new.ca_id, 'period', v_period
    ));
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_notify_survey()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  perform _push_fanout('survey_submitted', to_jsonb(NEW));
  return NEW;
end; $function$
;

CREATE OR REPLACE FUNCTION public.fn_score_bucket(p_score numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_score is null then 'unknown'
    when p_score >= 80 then 'healthy'
    when p_score >= 60 then 'watch'
    when p_score >= 40 then 'at_risk'
    else 'churning'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_take_snapshot(p_quarter_start date DEFAULT NULL::date, p_quarter_end date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_qstart date := coalesce(p_quarter_start, fn_cfg_text('quarterStart')::date);
  v_qend   date := coalesce(p_quarter_end,   fn_cfg_text('quarterEnd')::date);
  v_count  int  := 0;
  r        record;
  s        record;
begin
  for r in select id from cas where active loop
    select * into s from fn_ca_scorecard(r.id, v_qstart, v_qend) limit 1;
    insert into score_snapshots
      (id, ca_id, quarter_start, quarter_end, composite, performance, retention,
       growth, book_completeness, final_payout, client_count, taken_by)
    values
      ('SS-' || to_char(v_qstart, 'YYYYMM') || '-' || r.id, r.id, v_qstart, v_qend,
       s.composite, s.performance, s.retention, s.growth, s.book_completeness,
       s.final_payout, s.client_count, auth.uid())
    on conflict (ca_id, quarter_start) do update set
      composite = excluded.composite, performance = excluded.performance,
      retention = excluded.retention, growth = excluded.growth,
      book_completeness = excluded.book_completeness,
      final_payout = excluded.final_payout, client_count = excluded.client_count,
      taken_at = now(), taken_by = auth.uid();
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.invite_user(p_email text, p_full_name text, p_role app_role, p_ca_id text DEFAULT NULL::text, p_sales_id text DEFAULT NULL::text)
 RETURNS invites
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare result invites;
begin
  insert into invites (email, full_name, role, ca_id, sales_id, invited_by)
  values (lower(p_email), p_full_name, p_role, p_ca_id, p_sales_id, auth.uid())
  on conflict (email) do update set
    full_name = excluded.full_name,
    role      = excluded.role,
    ca_id     = excluded.ca_id,
    sales_id  = excluded.sales_id,
    consumed_at    = null,
    consumed_by_id = null
  returning * into result;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_owner_or_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT caller_role() IN ('owner', 'admin', 'integrator');
$function$
;

CREATE OR REPLACE FUNCTION public.next_client_id()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  n int;
begin
  select coalesce(max(substring(id from 4)::int), 0) + 1 into n from clients;
  return 'CL-' || lpad(n::text, 3, '0');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.next_pending_client_id()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  n int;
begin
  select coalesce(max(substring(id from 4)::int), 0) + 1 into n from pending_clients;
  return 'PC-' || lpad(n::text, 3, '0');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revoke_invite(p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  delete from invites
   where lower(email) = lower(p_email)
     and consumed_at is null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

-- triggers
CREATE TRIGGER trg_audit_adjustments AFTER INSERT OR DELETE OR UPDATE ON public.adjustments FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_notify_adj_pending AFTER INSERT OR UPDATE OF status ON public.adjustments FOR EACH ROW EXECUTE FUNCTION fn_notify_adjustment_pending();
CREATE TRIGGER trg_audit_clients AFTER INSERT OR DELETE OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_config AFTER INSERT OR DELETE OR UPDATE ON public.config FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_apply_edit_request BEFORE UPDATE ON public.edit_requests FOR EACH ROW EXECUTE FUNCTION fn_apply_edit_request();
CREATE TRIGGER trg_audit_edit_requests AFTER INSERT OR DELETE OR UPDATE ON public.edit_requests FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_notify_edit_req AFTER INSERT ON public.edit_requests FOR EACH ROW EXECUTE FUNCTION fn_notify_edit_request();
CREATE TRIGGER trg_audit_growth_events AFTER INSERT OR DELETE OR UPDATE ON public.growth_events FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_monthly_checkins AFTER INSERT OR DELETE OR UPDATE ON public.monthly_checkins FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_edit_gate_monthly_checkin BEFORE UPDATE ON public.monthly_checkins FOR EACH ROW EXECUTE FUNCTION fn_edit_gate();
CREATE TRIGGER trg_retention_flag_mc AFTER INSERT OR UPDATE OF flagged_inactive ON public.monthly_checkins FOR EACH ROW EXECUTE FUNCTION fn_notify_retention_flag();
CREATE TRIGGER trg_audit_monthly_metrics AFTER INSERT OR DELETE OR UPDATE ON public.monthly_metrics FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_retention_flag_mm AFTER INSERT OR UPDATE OF flagged_inactive ON public.monthly_metrics FOR EACH ROW EXECUTE FUNCTION fn_notify_retention_flag();
CREATE TRIGGER trg_audit_open_questions AFTER INSERT OR DELETE OR UPDATE ON public.open_questions FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_pending_clients AFTER INSERT OR DELETE OR UPDATE ON public.pending_clients FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_notify_pending AFTER INSERT ON public.pending_clients FOR EACH ROW EXECUTE FUNCTION fn_notify_pending_client();
CREATE TRIGGER trg_audit_reviews AFTER INSERT OR DELETE OR UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_auto_link_review BEFORE INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION fn_auto_link_review();
CREATE TRIGGER trg_audit_surveys AFTER INSERT OR DELETE OR UPDATE ON public.surveys FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_notify_survey AFTER INSERT ON public.surveys FOR EACH ROW EXECUTE FUNCTION fn_notify_survey();
CREATE TRIGGER trg_audit_weekly_checkins AFTER INSERT OR DELETE OR UPDATE ON public.weekly_checkins FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_edit_gate_weekly_checkin BEFORE UPDATE ON public.weekly_checkins FOR EACH ROW EXECUTE FUNCTION fn_edit_gate();
CREATE TRIGGER trg_retention_flag_wc AFTER INSERT OR UPDATE OF flagged_inactive ON public.weekly_checkins FOR EACH ROW EXECUTE FUNCTION fn_notify_retention_flag();
CREATE TRIGGER trg_audit_weekly_metrics AFTER INSERT OR DELETE OR UPDATE ON public.weekly_metrics FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_edit_gate_weekly_metrics BEFORE UPDATE ON public.weekly_metrics FOR EACH ROW EXECUTE FUNCTION fn_edit_gate();
CREATE TRIGGER trg_retention_flag_wm AFTER INSERT OR UPDATE OF flagged_inactive ON public.weekly_metrics FOR EACH ROW EXECUTE FUNCTION fn_notify_retention_flag();

-- row level security
alter table public."adjustments" enable row level security;
alter table public."audit_log" enable row level security;
alter table public."call_statuses" enable row level security;
alter table public."cancel_reasons" enable row level security;
alter table public."cas" enable row level security;
alter table public."client_score_history" enable row level security;
alter table public."clients" enable row level security;
alter table public."config" enable row level security;
alter table public."edit_requests" enable row level security;
alter table public."ghl_client_tokens" enable row level security;
alter table public."ghl_config" enable row level security;
alter table public."growth_events" enable row level security;
alter table public."invites" enable row level security;
alter table public."monthly_checkins" enable row level security;
alter table public."monthly_metrics" enable row level security;
alter table public."open_questions" enable row level security;
alter table public."pending_clients" enable row level security;
alter table public."profiles" enable row level security;
alter table public."push_subscriptions" enable row level security;
alter table public."quarter_inputs" enable row level security;
alter table public."reviews" enable row level security;
alter table public."sales_team" enable row level security;
alter table public."score_snapshots" enable row level security;
alter table public."survey_links" enable row level security;
alter table public."surveys" enable row level security;
alter table public."testimonials" enable row level security;
alter table public."weekly_checkins" enable row level security;
alter table public."weekly_metrics" enable row level security;

-- policies
create policy "adj_insert" on public."adjustments" for insert to public with check ((is_owner_or_admin() OR (rep_id = caller_sales_id())));
create policy "adj_read" on public."adjustments" for select to public using ((is_owner_or_admin() OR (rep_id = caller_sales_id())));
create policy "adj_update" on public."adjustments" for update to public using (is_owner_or_admin());
create policy "adjustments_admin_delete" on public."adjustments" for delete to authenticated using (is_owner_or_admin());
create policy "al_read" on public."audit_log" for select to public using (is_owner_or_admin());
create policy "call_statuses_ins" on public."call_statuses" for insert to public with check ((auth.uid() IS NOT NULL));
create policy "call_statuses_sel" on public."call_statuses" for select to public using ((auth.uid() IS NOT NULL));
create policy "call_statuses_upd" on public."call_statuses" for update to public using ((auth.uid() IS NOT NULL)) with check ((auth.uid() IS NOT NULL));
create policy "cancel_reasons_read" on public."cancel_reasons" for select to public using ((auth.uid() IS NOT NULL));
create policy "cancel_reasons_write" on public."cancel_reasons" for all to public using (is_owner_or_admin()) with check (is_owner_or_admin());
create policy "cas_admin_delete" on public."cas" for delete to authenticated using (is_owner_or_admin());
create policy "cas_read" on public."cas" for select to public using ((auth.uid() IS NOT NULL));
create policy "cas_write" on public."cas" for all to public using (is_owner_or_admin()) with check (is_owner_or_admin());
create policy "clients_admin_delete" on public."clients" for delete to authenticated using (is_owner_or_admin());
create policy "clients_read" on public."clients" for select to public using ((is_owner_or_admin() OR ((caller_role() = 'ca'::app_role) AND (assigned_ca = caller_ca_id())) OR ((caller_role() = 'sales'::app_role) AND ((ae = caller_sales_id()) OR (sdr_booked_by = caller_sales_id())))));
create policy "clients_write" on public."clients" for all to public using (is_owner_or_admin()) with check (is_owner_or_admin());
create policy "cfg_read" on public."config" for select to public using ((auth.uid() IS NOT NULL));
create policy "cfg_write" on public."config" for all to public using ((caller_role() = 'owner'::app_role)) with check ((caller_role() = 'owner'::app_role));
create policy "edit_requests_admin_delete" on public."edit_requests" for delete to authenticated using (is_owner_or_admin());
create policy "er_insert" on public."edit_requests" for insert to public with check (((requested_by = auth.uid()) OR is_owner_or_admin()));
create policy "er_read" on public."edit_requests" for select to public using ((is_owner_or_admin() OR (requested_by = auth.uid())));
create policy "er_update" on public."edit_requests" for update to public using (is_owner_or_admin());
create policy "ghl_tok_admin" on public."ghl_client_tokens" for all to public using (is_owner_or_admin()) with check (is_owner_or_admin());
create policy "events_self_delete" on public."growth_events" for delete to authenticated using (((created_by = auth.uid()) OR is_owner_or_admin()));
create policy "events_self_update" on public."growth_events" for update to authenticated using (((created_by = auth.uid()) OR is_owner_or_admin())) with check (((created_by = auth.uid()) OR is_owner_or_admin()));
create policy "ge_insert" on public."growth_events" for insert to public with check ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "ge_read" on public."growth_events" for select to public using ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "ge_update" on public."growth_events" for update to public using ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "growth_events_admin_delete" on public."growth_events" for delete to authenticated using (is_owner_or_admin());
create policy "invites_select" on public."invites" for select to authenticated using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::app_role, 'admin'::app_role]))))));
create policy "invites_write" on public."invites" for all to authenticated using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::app_role, 'admin'::app_role])))))) with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::app_role, 'admin'::app_role]))))));
create policy "mc_delete" on public."monthly_checkins" for delete to public using (is_owner_or_admin());
create policy "mc_insert" on public."monthly_checkins" for insert to public with check ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "mc_read" on public."monthly_checkins" for select to public using ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "mc_update" on public."monthly_checkins" for update to public using ((is_owner_or_admin() OR (ca_id = caller_ca_id()))) with check ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "metrics_self_delete" on public."monthly_metrics" for delete to authenticated using (((created_by = auth.uid()) OR is_owner_or_admin()));
create policy "metrics_self_update" on public."monthly_metrics" for update to authenticated using (((created_by = auth.uid()) OR is_owner_or_admin())) with check (((created_by = auth.uid()) OR is_owner_or_admin()));
create policy "mm_insert" on public."monthly_metrics" for insert to public with check ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "mm_read" on public."monthly_metrics" for select to public using ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "mm_update" on public."monthly_metrics" for update to public using ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "monthly_metrics_admin_delete" on public."monthly_metrics" for delete to authenticated using (is_owner_or_admin());
create policy "oq_read" on public."open_questions" for select to public using ((auth.uid() IS NOT NULL));
create policy "oq_write" on public."open_questions" for all to public using (is_owner_or_admin()) with check (is_owner_or_admin());
create policy "pending_clients_admin" on public."pending_clients" for all to public using (is_owner_or_admin()) with check (is_owner_or_admin());
create policy "pending_clients_admin_delete" on public."pending_clients" for delete to authenticated using (is_owner_or_admin());
create policy "profiles_admin_delete" on public."profiles" for delete to authenticated using (is_owner_or_admin());
create policy "profiles_admin_write" on public."profiles" for all to public using (is_owner_or_admin()) with check (is_owner_or_admin());
create policy "profiles_self_read" on public."profiles" for select to public using (((id = auth.uid()) OR is_owner_or_admin()));
create policy "push_admin_read" on public."push_subscriptions" for select to public using (is_owner_or_admin());
create policy "push_self_read" on public."push_subscriptions" for select to public using (((user_id = auth.uid()) OR is_owner_or_admin()));
create policy "push_self_write" on public."push_subscriptions" for all to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "qi_read" on public."quarter_inputs" for select to public using ((auth.uid() IS NOT NULL));
create policy "qi_write" on public."quarter_inputs" for all to public using (is_owner_or_admin()) with check (is_owner_or_admin());
create policy "reviews_admin_delete" on public."reviews" for delete to authenticated using (is_owner_or_admin());
create policy "rv_admin" on public."reviews" for all to public using (is_owner_or_admin()) with check (is_owner_or_admin());
create policy "sales_read" on public."sales_team" for select to public using ((auth.uid() IS NOT NULL));
create policy "sales_team_admin_delete" on public."sales_team" for delete to authenticated using (is_owner_or_admin());
create policy "sales_write" on public."sales_team" for all to public using (is_owner_or_admin()) with check (is_owner_or_admin());
create policy "ss_admin" on public."score_snapshots" for all to public using (is_owner_or_admin()) with check (is_owner_or_admin());
create policy "ss_self_read" on public."score_snapshots" for select to public using ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "sl_admin" on public."survey_links" for all to public using (is_owner_or_admin()) with check (is_owner_or_admin());
create policy "survey_links_admin_delete" on public."survey_links" for delete to authenticated using (is_owner_or_admin());
create policy "surveys_admin_delete" on public."surveys" for delete to authenticated using (is_owner_or_admin());
create policy "surveys_self_delete" on public."surveys" for delete to authenticated using (((ca_id IN ( SELECT profiles.ca_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) OR is_owner_or_admin()));
create policy "surveys_self_update" on public."surveys" for update to authenticated using (((ca_id IN ( SELECT profiles.ca_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) OR is_owner_or_admin()));
create policy "sv_insert" on public."surveys" for insert to public with check ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "sv_read" on public."surveys" for select to public using ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "sv_update" on public."surveys" for update to public using ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "tm_read_admin" on public."testimonials" for select to public using (is_owner_or_admin());
create policy "tm_write_admin" on public."testimonials" for all to public using (is_owner_or_admin()) with check (is_owner_or_admin());
create policy "wc_delete" on public."weekly_checkins" for delete to public using (is_owner_or_admin());
create policy "wc_insert" on public."weekly_checkins" for insert to public with check ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "wc_read" on public."weekly_checkins" for select to public using ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "wc_update" on public."weekly_checkins" for update to public using ((is_owner_or_admin() OR (ca_id = caller_ca_id()))) with check ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "wm_delete" on public."weekly_metrics" for delete to public using (is_owner_or_admin());
create policy "wm_insert" on public."weekly_metrics" for insert to public with check ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "wm_read" on public."weekly_metrics" for select to public using ((is_owner_or_admin() OR (ca_id = caller_ca_id())));
create policy "wm_update" on public."weekly_metrics" for update to public using ((is_owner_or_admin() OR (ca_id = caller_ca_id()))) with check ((is_owner_or_admin() OR (ca_id = caller_ca_id())));

-- grants
grant delete, insert, references, select, trigger, truncate, update on public."adjustments" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."adjustments" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."adjustments" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."audit_log" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."audit_log" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."audit_log" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."call_statuses" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."call_statuses" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."call_statuses" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."cancel_reasons" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."cancel_reasons" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."cancel_reasons" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."cas" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."cas" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."cas" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."client_score_history" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."client_score_history" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."client_score_history" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."clients" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."clients" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."clients" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."config" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."config" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."config" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."edit_requests" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."edit_requests" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."edit_requests" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."ghl_client_tokens" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."ghl_client_tokens" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."ghl_client_tokens" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."ghl_config" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."ghl_config" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."ghl_config" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."growth_events" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."growth_events" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."growth_events" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."invites" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."invites" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."invites" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."monthly_checkins" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."monthly_checkins" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."monthly_checkins" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."monthly_metrics" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."monthly_metrics" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."monthly_metrics" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."open_questions" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."open_questions" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."open_questions" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."pending_clients" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."pending_clients" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."pending_clients" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."profiles" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."profiles" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."profiles" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."push_subscriptions" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."push_subscriptions" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."push_subscriptions" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."quarter_inputs" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."quarter_inputs" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."quarter_inputs" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."reviews" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."reviews" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."reviews" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."sales_team" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."sales_team" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."sales_team" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."score_snapshots" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."score_snapshots" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."score_snapshots" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."survey_links" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."survey_links" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."survey_links" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."surveys" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."surveys" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."surveys" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."testimonials" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."testimonials" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."testimonials" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."v_monthly_metrics_effective" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."v_monthly_metrics_effective" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."v_monthly_metrics_effective" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."weekly_checkins" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."weekly_checkins" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."weekly_checkins" to service_role;
grant delete, insert, references, select, trigger, truncate, update on public."weekly_metrics" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."weekly_metrics" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."weekly_metrics" to service_role;
