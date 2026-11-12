-- Enterprise v2 feature-spec tables + session metadata on tokens

ALTER TABLE "Token" ADD COLUMN IF NOT EXISTS "device" TEXT;
ALTER TABLE "Token" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "Token" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;
ALTER TABLE "Token" ADD COLUMN IF NOT EXISTS "ip_address" TEXT;
ALTER TABLE "Token" ADD COLUMN IF NOT EXISTS "last_active_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "enterprise_pipeline_stages" (
    "id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "pipeline_stage" TEXT NOT NULL DEFAULT 'IMPORTED',
    "evidence_matched" BOOLEAN NOT NULL DEFAULT false,
    "ledger_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_pipeline_stages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "enterprise_pipeline_stages_record_type_record_id_key"
  ON "enterprise_pipeline_stages"("record_type", "record_id");
CREATE INDEX IF NOT EXISTS "enterprise_pipeline_stages_client_user_id_idx"
  ON "enterprise_pipeline_stages"("client_user_id");

CREATE TABLE IF NOT EXISTS "enterprise_sync_states" (
    "id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "last_sync_at" TIMESTAMP(3),
    "sync_status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_sync_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "enterprise_sync_states_client_user_id_key"
  ON "enterprise_sync_states"("client_user_id");

CREATE TABLE IF NOT EXISTS "enterprise_sync_activities" (
    "id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "has_conflict" BOOLEAN NOT NULL DEFAULT false,
    "badge" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "enterprise_sync_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "enterprise_sync_activities_client_user_id_created_at_idx"
  ON "enterprise_sync_activities"("client_user_id", "created_at");

CREATE TABLE IF NOT EXISTS "enterprise_sync_conflicts" (
    "id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mobile_value" TEXT NOT NULL,
    "enterprise_value" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unresolved',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    CONSTRAINT "enterprise_sync_conflicts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "enterprise_sync_conflicts_client_user_id_status_idx"
  ON "enterprise_sync_conflicts"("client_user_id", "status");

CREATE TABLE IF NOT EXISTS "enterprise_audit_trail_events" (
    "id" TEXT NOT NULL,
    "tx_id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "actor" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "high_risk" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "category" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by" TEXT,
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "enterprise_audit_trail_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "enterprise_audit_trail_events_client_user_id_created_at_idx"
  ON "enterprise_audit_trail_events"("client_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "enterprise_audit_trail_events_type_idx"
  ON "enterprise_audit_trail_events"("type");
CREATE INDEX IF NOT EXISTS "enterprise_audit_trail_events_high_risk_idx"
  ON "enterprise_audit_trail_events"("high_risk");

CREATE TABLE IF NOT EXISTS "client_tax_assumptions" (
    "id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "vat_registration_status" TEXT NOT NULL DEFAULT 'not-registered',
    "application_cit_rate" INTEGER NOT NULL DEFAULT 30,
    "msme_exemption_eligible" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "client_tax_assumptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_tax_assumptions_client_user_id_key"
  ON "client_tax_assumptions"("client_user_id");

CREATE TABLE IF NOT EXISTS "enterprise_ledger_integrity_checks" (
    "id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidence_gaps" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "enterprise_ledger_integrity_checks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "enterprise_ledger_integrity_checks_client_user_id_year_month_key"
  ON "enterprise_ledger_integrity_checks"("client_user_id", "year", "month");
