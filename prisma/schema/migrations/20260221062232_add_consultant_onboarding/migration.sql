-- CreateTable
CREATE TABLE "consultant_onboarding_sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultant_onboarding_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultant_firm_identities" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "business_structure" TEXT NOT NULL,
    "firm_name" TEXT NOT NULL,
    "registration_type" TEXT NOT NULL,
    "rc_number" TEXT,
    "year_of_incorporation" INTEGER,
    "country_of_registration" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultant_firm_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultant_partners" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "years_of_experience" INTEGER,
    "is_principal" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultant_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultant_certifications" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "qualification_name" TEXT NOT NULL,
    "issuing_body" TEXT NOT NULL,
    "year" INTEGER,
    "national" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultant_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultant_scopes" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "primary_state" TEXT NOT NULL,
    "additional_states" JSONB NOT NULL,
    "tax_types_specializations" JSONB NOT NULL,
    "business_size_served" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultant_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultant_subscriptions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "billing_option" TEXT NOT NULL,
    "enable_reminders" BOOLEAN NOT NULL DEFAULT false,
    "reminder_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultant_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultant_payment_setups" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "bank_account_number" TEXT,
    "warrant_approval" TEXT,
    "self_remittance" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultant_payment_setups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultant_compliances" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "cac_document_url" TEXT,
    "principal_partner_id_url" TEXT,
    "professional_certificate_url" TEXT,
    "aml_document_url" TEXT,
    "firm_profile_url" TEXT,
    "declaration_accuracy" BOOLEAN NOT NULL DEFAULT false,
    "declaration_firs_compliance" BOOLEAN NOT NULL DEFAULT false,
    "declaration_suspension_policy" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultant_compliances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consultant_onboarding_sessions_session_token_key" ON "consultant_onboarding_sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "consultant_firm_identities_session_id_key" ON "consultant_firm_identities"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "consultant_scopes_session_id_key" ON "consultant_scopes"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "consultant_subscriptions_session_id_key" ON "consultant_subscriptions"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "consultant_payment_setups_session_id_key" ON "consultant_payment_setups"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "consultant_compliances_session_id_key" ON "consultant_compliances"("session_id");

-- AddForeignKey
ALTER TABLE "consultant_firm_identities" ADD CONSTRAINT "consultant_firm_identities_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "consultant_onboarding_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_partners" ADD CONSTRAINT "consultant_partners_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "consultant_onboarding_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_certifications" ADD CONSTRAINT "consultant_certifications_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "consultant_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_scopes" ADD CONSTRAINT "consultant_scopes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "consultant_onboarding_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_subscriptions" ADD CONSTRAINT "consultant_subscriptions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "consultant_onboarding_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_payment_setups" ADD CONSTRAINT "consultant_payment_setups_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "consultant_onboarding_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_compliances" ADD CONSTRAINT "consultant_compliances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "consultant_onboarding_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
