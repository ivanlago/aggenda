import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const organizationRoleEnum = pgEnum("organization_role", [
  "owner",
  "admin",
  "manager",
  "receptionist",
  "professional",
  "staff",
  "viewer",
  "member",
]);
export const platformRoleEnum = pgEnum("platform_role", [
  "super_admin",
  "support",
  "billing",
  "operations",
  "auditor",
]);
export const supportAccessLevelEnum = pgEnum("support_access_level", [
  "read_only",
  "operational",
]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
]);
export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "trial",
  "essential",
]);
export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
]);
export const appointmentSourceEnum = pgEnum("appointment_source", [
  "dashboard",
  "booking_page",
  "whatsapp",
  "integration",
]);
export const availabilityExceptionTypeEnum = pgEnum(
  "availability_exception_type",
  ["blocked", "available"]
);
export const outboxStatusEnum = pgEnum("outbox_status", [
  "pending",
  "processing",
  "processed",
  "failed",
]);
export const chatMessageDirectionEnum = pgEnum("chat_message_direction", [
  "inbound",
  "outbound",
]);
export const chatMessageStatusEnum = pgEnum("chat_message_status", [
  "received",
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
]);
export const crmLeadStatusEnum = pgEnum("crm_lead_status", ["open", "converted", "archived"]);
export const crmOpportunityStatusEnum = pgEnum("crm_opportunity_status", ["open", "won", "lost"]);
export const crmTaskTypeEnum = pgEnum("crm_task_type", ["follow_up", "call", "message", "meeting", "proposal", "other"]);
export const crmProposalStatusEnum = pgEnum("crm_proposal_status", ["draft", "sent", "accepted", "rejected", "expired"]);
export const crmAiInsightStatusEnum = pgEnum("crm_ai_insight_status", ["draft", "approved", "dismissed"]);
export const electronicDocumentStatusEnum = pgEnum("electronic_document_status", [
  "pending",
  "viewed",
  "signed",
  "issued",
  "refused",
  "expired",
  "cancelled",
]);

export const professions = pgTable("professions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

export const specialties = pgTable(
  "specialties",
  {
    id: text("id").primaryKey(),
    professionId: text("profession_id")
      .notNull()
      .references(() => professions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [index("specialties_profession_idx").on(table.professionId)]
);

export const honorifics = pgTable("honorifics", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const platformMembers = pgTable(
  "platform_members",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    role: platformRoleEnum("role").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("platform_members_role_idx").on(table.role)]
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)]
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)]
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  businessType: text("business_type"),
  phone: text("phone"),
  timezone: text("timezone").default("America/Bahia").notNull(),
  clientLabel: text("client_label").default("Cliente").notNull(),
  clientLabelPlural: text("client_label_plural").default("Clientes").notNull(),
  professionalLabel: text("professional_label").default("Profissional").notNull(),
  professionalLabelPlural: text("professional_label_plural")
    .default("Profissionais")
    .notNull(),
  serviceLabel: text("service_label").default("Serviço").notNull(),
  serviceLabelPlural: text("service_label_plural").default("Serviços").notNull(),
  appointmentLabel: text("appointment_label").default("Agendamento").notNull(),
  appointmentLabelPlural: text("appointment_label_plural")
    .default("Agendamentos")
    .notNull(),
  bookingEnabled: boolean("booking_enabled").default(false).notNull(),
  bookingNoticeHours: integer("booking_notice_hours").default(2).notNull(),
  bookingHorizonDays: integer("booking_horizon_days").default(60).notNull(),
  slotIntervalMinutes: integer("slot_interval_minutes").default(30).notNull(),
  publicDescription: text("public_description"),
  publicAddress: text("public_address"),
  publicLogoUrl: text("public_logo_url"),
  publicCoverUrl: text("public_cover_url"),
  legalName: text("legal_name"),
  taxId: text("tax_id"),
  publicEmail: text("public_email"),
  publicWebsite: text("public_website"),
  publicWhatsapp: text("public_whatsapp"),
  documentFooter: text("document_footer"),
  brandColor: text("brand_color").default("#37664f").notNull(),
  customDomain: text("custom_domain").unique(),
  customDomainVerifiedAt: timestamp("custom_domain_verified_at"),
  reminderOffsetsHours: jsonb("reminder_offsets_hours").$type<number[]>().default([24]).notNull(),
  reminderConfirmationEnabled: boolean("reminder_confirmation_enabled").default(true).notNull(),
  patientRecoveryDays: integer("patient_recovery_days").default(90).notNull(),
  cancellationPolicy: text("cancellation_policy"),
  depositRefundPolicy: text("deposit_refund_policy"),
  latenessPolicy: text("lateness_policy"),
  publicPrivacyPolicy: text("public_privacy_policy"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: organizationRoleEnum("role").default("member").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    index("organization_members_user_idx").on(table.userId),
  ]
);

export const organizationSubscriptions = pgTable(
  "organization_subscriptions",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    plan: subscriptionPlanEnum("plan").default("trial").notNull(),
    status: subscriptionStatusEnum("status").default("trialing").notNull(),
    stripeCustomerId: text("stripe_customer_id").unique(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    stripePriceId: text("stripe_price_id"),
    billingProvider: text("billing_provider"),
    billingCustomerId: text("billing_customer_id").unique(),
    billingSubscriptionId: text("billing_subscription_id").unique(),
    billingCheckoutId: text("billing_checkout_id"),
    lastPaymentId: text("last_payment_id"),
    billingPlanCode: text("billing_plan_code"),
    billingIntervalMonths: integer("billing_interval_months"),
    billingPaymentMethod: text("billing_payment_method"),
    pendingPeriodMonths: integer("pending_period_months"),
    trialEndsAt: timestamp("trial_ends_at"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("organization_subscriptions_customer_idx").on(table.stripeCustomerId),
    index("organization_subscriptions_subscription_idx").on(
      table.stripeSubscriptionId
    ),
    index("organization_subscriptions_billing_customer_idx").on(
      table.billingCustomerId
    ),
    index("organization_subscriptions_billing_subscription_idx").on(
      table.billingSubscriptionId
    ),
  ]
);

export const organizationServicePlans = pgTable(
  "organization_service_plans",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    corePlanCode: text("core_plan_code").default("core").notNull(),
    whatsappServiceCode: text("whatsapp_service_code")
      .default("assisted")
      .notNull(),
    whatsappMonthlyLimit: integer("whatsapp_monthly_limit")
      .default(0)
      .notNull(),
    aiMonthlyLimit: integer("ai_monthly_limit").default(0).notNull(),
    nfseServiceCode: text("nfse_service_code").default("none").notNull(),
    nfseMonthlyLimit: integer("nfse_monthly_limit").default(0).notNull(),
    nfseOverageInCents: integer("nfse_overage_in_cents").default(49).notNull(),
    nfseMonthlyPriceInCents: integer("nfse_monthly_price_in_cents").default(4990).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("organization_service_plans_core_idx").on(table.corePlanCode)]
);

export const organizationImplementationPreferences = pgTable(
  "organization_implementation_preferences",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    implementationMode: text("implementation_mode").default("guided_free").notNull(),
    implementationStatus: text("implementation_status").default("not_required").notNull(),
    fiscalSetupMode: text("fiscal_setup_mode").default("none").notNull(),
    fiscalSetupStatus: text("fiscal_setup_status").default("not_required").notNull(),
    requestedAt: timestamp("requested_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("organization_implementation_preferences_status_idx").on(
      table.implementationStatus,
      table.fiscalSetupStatus
    ),
  ]
);

export const organizationUsageCounters = pgTable(
  "organization_usage_counters",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    metric: text("metric").notNull(),
    quantity: integer("quantity").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.periodStart, table.metric] }),
    index("organization_usage_counters_period_idx").on(table.periodStart, table.metric),
  ]
);

export const billingPayments = pgTable(
  "billing_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id").notNull(),
    planCode: text("plan_code"),
    paymentMethod: text("payment_method"),
    amountInCents: integer("amount_in_cents"),
    status: text("status").notNull(),
    dueDate: timestamp("due_date"),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("billing_payments_provider_id_unique").on(table.provider, table.providerPaymentId),
    index("billing_payments_org_idx").on(table.organizationId),
  ]
);

export const dataImports = pgTable(
  "data_imports",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    entityType: text("entity_type").notNull(),
    fileName: text("file_name").notNull(),
    strategy: text("strategy").notNull(),
    status: text("status").default("processing").notNull(),
    totalRows: integer("total_rows").default(0).notNull(),
    createdRows: integer("created_rows").default(0).notNull(),
    updatedRows: integer("updated_rows").default(0).notNull(),
    skippedRows: integer("skipped_rows").default(0).notNull(),
    errorRows: integer("error_rows").default(0).notNull(),
    completedAt: timestamp("completed_at"),
    undoneAt: timestamp("undone_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("data_imports_org_idx").on(table.organizationId)]
);

export const dataImportRows = pgTable(
  "data_import_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importId: uuid("import_id").notNull().references(() => dataImports.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    entityId: uuid("entity_id"),
    action: text("action").notNull(),
    error: text("error"),
    previousData: jsonb("previous_data"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("data_import_rows_import_row_unique").on(table.importId, table.rowNumber),
    index("data_import_rows_import_idx").on(table.importId),
  ]
);

export const supportSessions = pgTable(
  "support_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    platformUserId: text("platform_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    accessLevel: supportAccessLevelEnum("access_level")
      .default("read_only")
      .notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("support_sessions_platform_user_idx").on(table.platformUserId),
    index("support_sessions_organization_idx").on(table.organizationId),
    index("support_sessions_expires_idx").on(table.expiresAt),
  ]
);

export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: organizationRoleEnum("role").default("member").notNull(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("organization_invitations_org_idx").on(table.organizationId),
    index("organization_invitations_email_idx").on(table.email),
    uniqueIndex("organization_invitations_pending_unique").on(
      table.organizationId,
      table.email
    ),
  ]
);

export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});

export const billingWebhookEvents = pgTable("billing_webhook_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});

export const legalAcceptances = pgTable(
  "legal_acceptances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    document: text("document").notNull(),
    version: text("version").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("legal_acceptances_unique").on(table.organizationId, table.userId, table.document, table.version),
    index("legal_acceptances_org_idx").on(table.organizationId),
  ]
);

export const professionals = pgTable(
  "professionals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    professionId: text("profession_id").references(() => professions.id, {
      onDelete: "set null",
    }),
    honorificId: text("honorific_id").references(() => honorifics.id, {
      onDelete: "set null",
    }),
    customProfession: text("custom_profession"),
    customHonorific: text("custom_honorific"),
    title: text("title"),
    bio: text("bio"),
    color: text("color").default("#18664a").notNull(),
    isBookable: boolean("is_bookable").default(true).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("professionals_organization_idx").on(table.organizationId),
    index("professionals_profession_idx").on(table.professionId),
  ]
);

export const professionalGoogleCalendarAccounts = pgTable(
  "professional_google_calendar_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id")
      .notNull()
      .unique()
      .references(() => professionals.id, { onDelete: "cascade" }),
    googleEmail: text("google_email").notNull(),
    calendarId: text("calendar_id").default("primary").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    scope: text("scope"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("professional_google_calendar_org_idx").on(table.organizationId),
    index("professional_google_calendar_professional_idx").on(
      table.professionalId
    ),
  ]
);

export const professionalSpecialties = pgTable(
  "professional_specialties",
  {
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "cascade" }),
    specialtyId: text("specialty_id")
      .notNull()
      .references(() => specialties.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.professionalId, table.specialtyId] }),
    index("professional_specialties_organization_idx").on(table.organizationId),
  ]
);

export const professionalRegistrations = pgTable(
  "professional_registrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    council: text("council").notNull(),
    registrationNumber: text("registration_number").notNull(),
    state: text("state"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("professional_registrations_professional_idx").on(
      table.professionalId
    ),
    index("professional_registrations_organization_idx").on(
      table.organizationId
    ),
  ]
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    birthDate: date("birth_date", { mode: "string" }),
    gender: text("gender"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("clients_organization_idx").on(table.organizationId),
    uniqueIndex("clients_organization_phone_unique").on(
      table.organizationId,
      table.phone
    ),
  ]
);

export const clientHistoryEntries = pgTable(
  "client_history_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    entryType: text("entry_type").default("note").notNull(),
    title: text("title"),
    content: text("content").notNull(),
    electronicDocumentId: uuid("electronic_document_id"),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("client_history_entries_client_idx").on(table.clientId, table.occurredAt),
    index("client_history_entries_org_idx").on(table.organizationId),
    index("client_history_entries_document_idx").on(table.electronicDocumentId),
  ]
);

export const clientClinicalMedia = pgTable("client_clinical_media", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
  authorUserId: text("author_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  mediaType: text("media_type").default("photo").notNull(),
  phase: text("phase").default("clinical").notNull(),
  title: text("title"),
  url: text("url").notNull(),
  storageProvider: text("storage_provider").default("external").notNull(),
  storageAssetId: text("storage_asset_id"),
  storagePublicId: text("storage_public_id"),
  originalFilename: text("original_filename"),
  mimeType: text("mime_type"),
  width: integer("width"),
  height: integer("height"),
  bytes: integer("bytes"),
  annotations: jsonb("annotations").default([]).notNull(),
  parentMediaId: uuid("parent_media_id"),
  consentConfirmed: boolean("consent_confirmed").default(false).notNull(),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("client_clinical_media_client_idx").on(table.clientId, table.capturedAt), index("client_clinical_media_org_idx").on(table.organizationId)]);

export const documentTemplates = pgTable("document_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  documentType: text("document_type").default("consent").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  workflowType: text("workflow_type").default("patient_signature").notNull(),
  responseSchema: jsonb("response_schema").$type<Array<Record<string, unknown>>>(),
  schemaVersion: integer("schema_version").default(1).notNull(),
  serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
  isSystemPreset: boolean("is_system_preset").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [index("document_templates_org_idx").on(table.organizationId, table.isActive)]);

export const electronicDocuments = pgTable("electronic_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
  templateId: uuid("template_id").references(() => documentTemplates.id, { onDelete: "set null" }),
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  issuerProfessionalId: uuid("issuer_professional_id").references(() => professionals.id, { onDelete: "set null" }),
  workflowType: text("workflow_type").default("patient_signature").notNull(),
  documentType: text("document_type").notNull(),
  title: text("title").notNull(),
  contentSnapshot: text("content_snapshot").notNull(),
  contentHash: text("content_hash").notNull(),
  structuredData: jsonb("structured_data").$type<Record<string, unknown>>(),
  status: electronicDocumentStatusEnum("status").default("pending").notNull(),
  signerName: text("signer_name").notNull(),
  signerEmail: text("signer_email").notNull(),
  accessTokenHash: text("access_token_hash").notNull().unique(),
  verificationCodeHash: text("verification_code_hash").notNull(),
  verificationExpiresAt: timestamp("verification_expires_at").notNull(),
  tokenExpiresAt: timestamp("token_expires_at").notNull(),
  verificationAttempts: integer("verification_attempts").default(0).notNull(),
  viewedAt: timestamp("viewed_at"),
  signedAt: timestamp("signed_at"),
  issuedAt: timestamp("issued_at"),
  refusedAt: timestamp("refused_at"),
  cancelledAt: timestamp("cancelled_at"),
  signatureData: text("signature_data"),
  signerResponses: text("signer_responses"),
  acceptanceText: text("acceptance_text"),
  signerIpAddress: text("signer_ip_address"),
  signerUserAgent: text("signer_user_agent"),
  evidenceHash: text("evidence_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("electronic_documents_org_idx").on(table.organizationId, table.createdAt),
  index("electronic_documents_client_idx").on(table.clientId, table.createdAt),
  index("electronic_documents_status_idx").on(table.organizationId, table.status),
]);

export const electronicDocumentEvents = pgTable("electronic_document_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").notNull().references(() => electronicDocuments.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  details: jsonb("details").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("electronic_document_events_document_idx").on(table.documentId, table.createdAt)]);

export const crmPipelines = pgTable(
  "crm_pipelines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("crm_pipelines_org_idx").on(table.organizationId)]
);

export const crmStages = pgTable(
  "crm_stages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    pipelineId: uuid("pipeline_id").notNull().references(() => crmPipelines.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    probability: integer("probability").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("crm_stages_pipeline_position_unique").on(table.pipelineId, table.position),
    index("crm_stages_org_idx").on(table.organizationId),
  ]
);

export const crmLeads = pgTable(
  "crm_leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    assignedUserId: text("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    company: text("company"),
    source: text("source").default("manual").notNull(),
    status: crmLeadStatusEnum("status").default("open").notNull(),
    notes: text("notes"),
    convertedAt: timestamp("converted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("crm_leads_org_status_idx").on(table.organizationId, table.status),
    index("crm_leads_assigned_idx").on(table.assignedUserId),
    index("crm_leads_phone_idx").on(table.organizationId, table.phone),
  ]
);

export const crmOpportunities = pgTable(
  "crm_opportunities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => crmLeads.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    pipelineId: uuid("pipeline_id").notNull().references(() => crmPipelines.id, { onDelete: "restrict" }),
    stageId: uuid("stage_id").notNull().references(() => crmStages.id, { onDelete: "restrict" }),
    assignedUserId: text("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    valueInCents: integer("value_in_cents"),
    source: text("source").default("manual").notNull(),
    status: crmOpportunityStatusEnum("status").default("open").notNull(),
    expectedCloseDate: date("expected_close_date", { mode: "string" }),
    nextActionAt: timestamp("next_action_at"),
    lostReason: text("lost_reason"),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("crm_opportunities_org_stage_idx").on(table.organizationId, table.stageId),
    index("crm_opportunities_org_status_idx").on(table.organizationId, table.status),
    index("crm_opportunities_assigned_idx").on(table.assignedUserId),
  ]
);

export const crmTasks = pgTable(
  "crm_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => crmLeads.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").references(() => crmOpportunities.id, { onDelete: "cascade" }),
    assignedUserId: text("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    type: crmTaskTypeEnum("type").default("follow_up").notNull(),
    title: text("title").notNull(),
    notes: text("notes"),
    dueAt: timestamp("due_at").notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("crm_tasks_org_due_idx").on(table.organizationId, table.dueAt),
    index("crm_tasks_opportunity_idx").on(table.opportunityId),
  ]
);

export const crmProposals = pgTable(
  "crm_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").notNull().references(() => crmOpportunities.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    number: text("number").notNull(),
    title: text("title").notNull(),
    status: crmProposalStatusEnum("status").default("draft").notNull(),
    notes: text("notes"),
    validUntil: date("valid_until", { mode: "string" }),
    subtotalInCents: integer("subtotal_in_cents").notNull(),
    discountInCents: integer("discount_in_cents").default(0).notNull(),
    totalInCents: integer("total_in_cents").notNull(),
    sentAt: timestamp("sent_at"),
    acceptedAt: timestamp("accepted_at"),
    rejectedAt: timestamp("rejected_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("crm_proposals_org_number_unique").on(table.organizationId, table.number),
    index("crm_proposals_opportunity_idx").on(table.opportunityId),
    index("crm_proposals_org_status_idx").on(table.organizationId, table.status),
  ]
);

export const crmProposalItems = pgTable(
  "crm_proposal_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    proposalId: uuid("proposal_id").notNull().references(() => crmProposals.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    unitPriceInCents: integer("unit_price_in_cents").notNull(),
    totalInCents: integer("total_in_cents").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("crm_proposal_items_proposal_idx").on(table.proposalId)]
);

export const crmTags = pgTable(
  "crm_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").default("#37664f").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("crm_tags_org_name_unique").on(table.organizationId, table.name)]
);

export const crmLeadTags = pgTable(
  "crm_lead_tags",
  {
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").notNull().references(() => crmLeads.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id").notNull().references(() => crmTags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.leadId, table.tagId] }), index("crm_lead_tags_org_idx").on(table.organizationId)]
);

export const crmCustomFields = pgTable(
  "crm_custom_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    fieldType: text("field_type").default("text").notNull(),
    options: jsonb("options").$type<string[]>().default([]),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("crm_custom_fields_org_name_unique").on(table.organizationId, table.name)]
);

export const crmCustomFieldValues = pgTable(
  "crm_custom_field_values",
  {
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").notNull().references(() => crmLeads.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id").notNull().references(() => crmCustomFields.id, { onDelete: "cascade" }),
    value: text("value"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.leadId, table.fieldId] }), index("crm_custom_values_org_idx").on(table.organizationId)]
);

export const clientAccounts = pgTable(
  "client_accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    verificationMethod: text("verification_method"),
    verifiedAt: timestamp("verified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.clientId] }),
    uniqueIndex("client_accounts_client_unique").on(table.clientId),
    index("client_accounts_organization_idx").on(table.organizationId),
  ]
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    tussCode: text("tuss_code"),
    tussTable: text("tuss_table"),
    tussName: text("tuss_name"),
    shortName: text("short_name"),
    preparation: text("preparation"),
    durationMinutes: integer("duration_minutes").notNull(),
    priceInCents: integer("price_in_cents"),
    estimatedCostInCents: integer("estimated_cost_in_cents").default(0).notNull(),
    depositType: text("deposit_type").default("none").notNull(),
    depositValue: integer("deposit_value").default(0).notNull(),
    depositExpirationMinutes: integer("deposit_expiration_minutes").default(30).notNull(),
    requiresProfessional: boolean("requires_professional").default(true).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("services_organization_idx").on(table.organizationId)]
);

export const inventoryProducts = pgTable("inventory_products", {
  id: uuid("id").defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), name: text("name").notNull(), sku: text("sku"), unit: text("unit").default("unit").notNull(), currentQuantityMillis: integer("current_quantity_millis").default(0).notNull(), minimumQuantityMillis: integer("minimum_quantity_millis").default(0).notNull(), costInCents: integer("cost_in_cents"), isActive: boolean("is_active").default(true).notNull(), createdAt: timestamp("created_at").defaultNow().notNull(), updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("inventory_products_org_sku_unique").on(table.organizationId, table.sku), index("inventory_products_org_idx").on(table.organizationId)]);

export const retailProducts = pgTable("retail_products", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  brand: text("brand"),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [index("retail_products_org_idx").on(table.organizationId, table.name)]);

export const retailProductVariants = pgTable("retail_product_variants", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => retailProducts.id, { onDelete: "cascade" }),
  inventoryProductId: uuid("inventory_product_id").notNull().references(() => inventoryProducts.id, { onDelete: "restrict" }),
  name: text("name").default("Padrão").notNull(),
  barcode: text("barcode"),
  salePriceInCents: integer("sale_price_in_cents").notNull(),
  commissionRateBasisPoints: integer("commission_rate_basis_points").default(0).notNull(),
  isForSale: boolean("is_for_sale").default(true).notNull(),
  isForProcedures: boolean("is_for_procedures").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("retail_variants_inventory_unique").on(table.inventoryProductId),
  uniqueIndex("retail_variants_org_barcode_unique").on(table.organizationId, table.barcode),
  index("retail_variants_product_idx").on(table.productId),
]);

export const retailSales = pgTable("retail_sales", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  financialEntryId: uuid("financial_entry_id").references(() => financialEntries.id, { onDelete: "set null" }),
  status: text("status").default("completed").notNull(),
  paymentMethod: text("payment_method"),
  receiptToken: uuid("receipt_token").defaultRandom().notNull(),
  receiptEmail: text("receipt_email"),
  receiptPhone: text("receipt_phone"),
  subtotalInCents: integer("subtotal_in_cents").notNull(),
  discountInCents: integer("discount_in_cents").default(0).notNull(),
  totalInCents: integer("total_in_cents").notNull(),
  notes: text("notes"),
  cancelledAt: timestamp("cancelled_at"),
  cancelledByUserId: text("cancelled_by_user_id").references(() => users.id, { onDelete: "set null" }),
  cancellationReason: text("cancellation_reason"),
  soldAt: timestamp("sold_at").defaultNow().notNull(),
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("retail_sales_receipt_token_unique").on(table.receiptToken), index("retail_sales_org_sold_idx").on(table.organizationId, table.soldAt)]);

export const retailSaleItems = pgTable("retail_sale_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  saleId: uuid("sale_id").notNull().references(() => retailSales.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").notNull().references(() => retailProductVariants.id, { onDelete: "restrict" }),
  inventoryProductId: uuid("inventory_product_id").notNull().references(() => inventoryProducts.id, { onDelete: "restrict" }),
  productName: text("product_name").notNull(),
  variantName: text("variant_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceInCents: integer("unit_price_in_cents").notNull(),
  discountInCents: integer("discount_in_cents").default(0).notNull(),
  unitCostInCents: integer("unit_cost_in_cents").default(0).notNull(),
  commissionInCents: integer("commission_in_cents").default(0).notNull(),
  totalInCents: integer("total_in_cents").notNull(),
}, (table) => [index("retail_sale_items_sale_idx").on(table.saleId)]);

export const retailSalePayments = pgTable("retail_sale_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  saleId: uuid("sale_id").notNull().references(() => retailSales.id, { onDelete: "cascade" }),
  method: text("method").notNull(),
  amountInCents: integer("amount_in_cents").notNull(),
  status: text("status").default("received").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("retail_sale_payments_sale_idx").on(table.saleId), index("retail_sale_payments_org_created_idx").on(table.organizationId, table.createdAt)]);

export const serviceInventoryItems = pgTable("service_inventory_items", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }), productId: uuid("product_id").notNull().references(() => inventoryProducts.id, { onDelete: "cascade" }), quantityMillis: integer("quantity_millis").notNull(),
}, (table) => [primaryKey({ columns: [table.serviceId, table.productId] }), index("service_inventory_items_org_idx").on(table.organizationId)]);

export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), productId: uuid("product_id").notNull().references(() => inventoryProducts.id, { onDelete: "restrict" }), appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "set null" }), retailSaleId: uuid("retail_sale_id").references(() => retailSales.id, { onDelete: "set null" }), type: text("type").notNull(), quantityMillis: integer("quantity_millis").notNull(), balanceAfterMillis: integer("balance_after_millis").notNull(), notes: text("notes"), createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }), createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("inventory_movements_product_idx").on(table.productId, table.createdAt), index("inventory_movements_org_idx").on(table.organizationId)]);

export const appointmentInventoryConsumptions = pgTable("appointment_inventory_consumptions", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }), productId: uuid("product_id").notNull().references(() => inventoryProducts.id, { onDelete: "restrict" }), quantityMillis: integer("quantity_millis").notNull(), consumedAt: timestamp("consumed_at").defaultNow().notNull(), reversedAt: timestamp("reversed_at"),
}, (table) => [primaryKey({ columns: [table.appointmentId, table.productId] }), index("appointment_inventory_org_idx").on(table.organizationId)]);

export const servicesToProfessionals = pgTable(
  "services_to_professionals",
  {
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.serviceId, table.professionalId] }),
    index("services_professionals_organization_idx").on(table.organizationId),
  ]
);

export const servicePackages = pgTable(
  "service_packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priceInCents: integer("price_in_cents").notNull(),
    validityDays: integer("validity_days"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("service_packages_organization_idx").on(table.organizationId)]
);

export const servicePackageItems = pgTable(
  "service_package_items",
  {
    packageId: uuid("package_id")
      .notNull()
      .references(() => servicePackages.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.packageId, table.serviceId] }),
    index("service_package_items_org_idx").on(table.organizationId),
  ]
);

export const clientPackages = pgTable(
  "client_packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    packageId: uuid("package_id")
      .notNull()
      .references(() => servicePackages.id, { onDelete: "restrict" }),
    priceInCents: integer("price_in_cents").notNull(),
    status: text("status").default("active").notNull(),
    purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("client_packages_org_idx").on(table.organizationId),
    index("client_packages_client_idx").on(table.clientId),
  ]
);

export const clientMemberships = pgTable("client_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
  packageId: uuid("package_id").notNull().references(() => servicePackages.id, { onDelete: "restrict" }),
  status: text("status").default("active").notNull(),
  monthlyPriceInCents: integer("monthly_price_in_cents").notNull(),
  billingDay: integer("billing_day").default(1).notNull(),
  providerSubscriptionId: text("provider_subscription_id"),
  startsAt: timestamp("starts_at").defaultNow().notNull(),
  nextRenewalAt: timestamp("next_renewal_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [index("client_memberships_org_status_idx").on(table.organizationId, table.status), index("client_memberships_client_idx").on(table.clientId)]);

export const vouchers = pgTable("vouchers", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  description: text("description"),
  discountType: text("discount_type").default("fixed").notNull(),
  discountValue: integer("discount_value").notNull(),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0).notNull(),
  validFrom: timestamp("valid_from").defaultNow().notNull(),
  validUntil: timestamp("valid_until"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("vouchers_org_code_unique").on(table.organizationId, table.code), index("vouchers_org_active_idx").on(table.organizationId, table.isActive)]);

export const clientPackageBalances = pgTable(
  "client_package_balances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientPackageId: uuid("client_package_id")
      .notNull()
      .references(() => clientPackages.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    totalQuantity: integer("total_quantity").notNull(),
    usedQuantity: integer("used_quantity").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("client_package_balances_package_service_unique").on(
      table.clientPackageId,
      table.serviceId
    ),
    index("client_package_balances_org_idx").on(table.organizationId),
  ]
);

export const weeklyAvailability = pgTable(
  "weekly_availability",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id").references(() => professionals.id, {
      onDelete: "cascade",
    }),
    dayOfWeek: integer("day_of_week").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
  },
  (table) => [
    index("weekly_availability_organization_idx").on(table.organizationId),
    index("weekly_availability_professional_idx").on(table.professionalId),
  ]
);

export const availabilityExceptions = pgTable(
  "availability_exceptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id").references(() => professionals.id, {
      onDelete: "cascade",
    }),
    type: availabilityExceptionTypeEnum("type").default("blocked").notNull(),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("availability_exceptions_organization_idx").on(table.organizationId),
    index("availability_exceptions_professional_idx").on(table.professionalId),
    index("availability_exceptions_start_idx").on(table.startsAt),
  ]
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    professionalId: uuid("professional_id").references(() => professionals.id, {
      onDelete: "set null",
    }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    status: appointmentStatusEnum("status").default("scheduled").notNull(),
    source: appointmentSourceEnum("source").default("dashboard").notNull(),
    priceInCents: integer("price_in_cents"),
    notes: text("notes"),
    cancellationReason: text("cancellation_reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    googleCalendarEventId: text("google_calendar_event_id"),
    googleCalendarId: text("google_calendar_id"),
    googleCalendarSyncStatus: text("google_calendar_sync_status"),
    googleCalendarSyncError: text("google_calendar_sync_error"),
    confirmedAt: timestamp("confirmed_at"),
    reminderClaimedAt: timestamp("reminder_claimed_at"),
    reminderSentAt: timestamp("reminder_sent_at"),
    depositStatus: text("deposit_status").default("not_required").notNull(),
    depositAmountInCents: integer("deposit_amount_in_cents").default(0).notNull(),
    reservationExpiresAt: timestamp("reservation_expires_at"),
    publicManageToken: text("public_manage_token").unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("appointments_organization_start_idx").on(
      table.organizationId,
      table.startsAt
    ),
    index("appointments_professional_start_idx").on(
      table.professionalId,
      table.startsAt
    ),
    index("appointments_client_idx").on(table.clientId),
  ]
);

export const packageUsages = pgTable(
  "package_usages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientPackageId: uuid("client_package_id")
      .notNull()
      .references(() => clientPackages.id, { onDelete: "restrict" }),
    balanceId: uuid("balance_id")
      .notNull()
      .references(() => clientPackageBalances.id, { onDelete: "restrict" }),
    appointmentId: uuid("appointment_id")
      .notNull()
      .unique()
      .references(() => appointments.id, { onDelete: "cascade" }),
    quantity: integer("quantity").default(1).notNull(),
    status: text("status").default("reserved").notNull(),
    reservedAt: timestamp("reserved_at").defaultNow().notNull(),
    consumedAt: timestamp("consumed_at"),
    reversedAt: timestamp("reversed_at"),
  },
  (table) => [
    index("package_usages_org_idx").on(table.organizationId),
    index("package_usages_client_package_idx").on(table.clientPackageId),
  ]
);

export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    accountType: text("account_type").default("bank").notNull(),
    openingBalanceInCents: integer("opening_balance_in_cents").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("financial_accounts_org_name_unique").on(table.organizationId, table.name)]
);

export const financialCategories = pgTable(
  "financial_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("financial_categories_org_type_name_unique").on(table.organizationId, table.type, table.name)]
);

export const financialCostCenters = pgTable(
  "financial_cost_centers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("financial_cost_centers_org_name_unique").on(table.organizationId, table.name)]
);

export const financialBudgets = pgTable(
  "financial_budgets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => financialCategories.id, { onDelete: "cascade" }),
    costCenterId: uuid("cost_center_id").references(() => financialCostCenters.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    amountInCents: integer("amount_in_cents").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("financial_budgets_scope_unique").on(table.organizationId, table.categoryId, table.costCenterId, table.month),
    index("financial_budgets_org_month_idx").on(table.organizationId, table.month),
  ]
);

export const commissionRules = pgTable("commission_rules", {
  id: uuid("id").defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), professionalId: uuid("professional_id").references(() => professionals.id, { onDelete: "cascade" }), serviceId: uuid("service_id").references(() => services.id, { onDelete: "cascade" }), trigger: text("trigger").default("completed_appointment").notNull(), calculationType: text("calculation_type").default("percentage").notNull(), value: integer("value").notNull(), isActive: boolean("is_active").default(true).notNull(), createdAt: timestamp("created_at").defaultNow().notNull(), updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [index("commission_rules_org_idx").on(table.organizationId), index("commission_rules_professional_idx").on(table.professionalId)]);

export const commissionEntries = pgTable("commission_entries", {
  id: uuid("id").defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), ruleId: uuid("rule_id").references(() => commissionRules.id, { onDelete: "set null" }), professionalId: uuid("professional_id").notNull().references(() => professionals.id, { onDelete: "restrict" }), appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "set null" }), baseAmountInCents: integer("base_amount_in_cents").notNull(), amountInCents: integer("amount_in_cents").notNull(), status: text("status").default("pending").notNull(), competence: text("competence").notNull(), paidAt: timestamp("paid_at"), createdAt: timestamp("created_at").defaultNow().notNull(), updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("commission_entries_appointment_unique").on(table.appointmentId), index("commission_entries_org_competence_idx").on(table.organizationId, table.competence)]);

export const cashClosings = pgTable("cash_closings", {
  id: uuid("id").defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), accountId: uuid("account_id").notNull().references(() => financialAccounts.id, { onDelete: "restrict" }), openedByUserId: text("opened_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), closedByUserId: text("closed_by_user_id").references(() => users.id, { onDelete: "restrict" }), openedAt: timestamp("opened_at").defaultNow().notNull(), closedAt: timestamp("closed_at"), openingBalanceInCents: integer("opening_balance_in_cents").notNull(), expectedBalanceInCents: integer("expected_balance_in_cents"), countedBalanceInCents: integer("counted_balance_in_cents"), differenceInCents: integer("difference_in_cents"), notes: text("notes"),
}, (table) => [index("cash_closings_org_open_idx").on(table.organizationId, table.openedAt)]);

export const bankImportTransactions = pgTable("bank_import_transactions", {
  id: uuid("id").defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), accountId: uuid("account_id").notNull().references(() => financialAccounts.id, { onDelete: "cascade" }), externalId: text("external_id").notNull(), occurredOn: date("occurred_on", { mode: "string" }).notNull(), description: text("description").notNull(), amountInCents: integer("amount_in_cents").notNull(), financialEntryId: uuid("financial_entry_id").references(() => financialEntries.id, { onDelete: "set null" }), status: text("status").default("unmatched").notNull(), importedAt: timestamp("imported_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("bank_import_org_external_unique").on(table.organizationId, table.accountId, table.externalId), index("bank_import_status_idx").on(table.organizationId, table.status)]);

export const organizationFinancialIntegrations = pgTable("organization_financial_integrations", {
  id: uuid("id").defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), provider: text("provider").notNull(), environment: text("environment").default("sandbox").notNull(), encryptedCredential: text("encrypted_credential").notNull(), status: text("status").default("configured").notNull(), metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}), createdAt: timestamp("created_at").defaultNow().notNull(), updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("organization_financial_integrations_unique").on(table.organizationId, table.provider)]);

export const paymentCharges = pgTable("payment_charges", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider").default("asaas").notNull(),
  providerPaymentId: text("provider_payment_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  providerCustomerId: text("provider_customer_id"),
  originType: text("origin_type").notNull(),
  originId: text("origin_id").notNull(),
  financialEntryId: uuid("financial_entry_id").references(() => financialEntries.id, { onDelete: "set null" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  paymentMethod: text("payment_method").notNull(),
  chargeMode: text("charge_mode").default("single").notNull(),
  installmentCount: integer("installment_count").default(1).notNull(),
  status: text("status").default("pending").notNull(),
  amountInCents: integer("amount_in_cents").notNull(),
  description: text("description").notNull(),
  customerName: text("customer_name").notNull(),
  customerDocument: text("customer_document"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  invoiceUrl: text("invoice_url"),
  bankSlipUrl: text("bank_slip_url"),
  bankSlipIdentificationField: text("bank_slip_identification_field"),
  pixQrCodePayload: text("pix_qr_code_payload"),
  pixQrCodeImage: text("pix_qr_code_image"),
  paidAt: timestamp("paid_at"),
  cancelledAt: timestamp("cancelled_at"),
  refundedAt: timestamp("refunded_at"),
  lastReminderAt: timestamp("last_reminder_at"),
  reminderCount: integer("reminder_count").default(0).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("payment_charges_provider_payment_unique").on(table.provider, table.providerPaymentId),
  index("payment_charges_org_created_idx").on(table.organizationId, table.createdAt),
  index("payment_charges_origin_idx").on(table.organizationId, table.originType, table.originId),
  index("payment_charges_financial_entry_idx").on(table.financialEntryId),
  index("payment_charges_client_idx").on(table.organizationId, table.clientId),
  index("payment_charges_due_status_idx").on(table.organizationId, table.status, table.dueDate),
]);

export const paymentChargeEvents = pgTable("payment_charge_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  chargeId: uuid("charge_id").notNull().references(() => paymentCharges.id, { onDelete: "cascade" }),
  providerEventId: text("provider_event_id"),
  eventType: text("event_type").notNull(),
  previousStatus: text("previous_status"),
  status: text("status").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("payment_charge_events_provider_event_unique").on(table.providerEventId),
  index("payment_charge_events_charge_idx").on(table.chargeId, table.createdAt),
]);

export const fiscalDocuments = pgTable("fiscal_documents", {
  id: uuid("id").defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), financialEntryId: uuid("financial_entry_id").references(() => financialEntries.id, { onDelete: "set null" }), provider: text("provider").default("manual").notNull(), externalId: text("external_id"), number: text("number"), status: text("status").default("draft").notNull(), amountInCents: integer("amount_in_cents").notNull(), issuedAt: timestamp("issued_at"), verificationUrl: text("verification_url"), createdAt: timestamp("created_at").defaultNow().notNull(), updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [index("fiscal_documents_org_idx").on(table.organizationId, table.createdAt)]);

export const financialEntries = pgTable(
  "financial_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").default("pending").notNull(),
    source: text("source").default("manual").notNull(),
    description: text("description").notNull(),
    category: text("category"),
    categoryId: uuid("category_id").references(() => financialCategories.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => financialAccounts.id, { onDelete: "set null" }),
    costCenterId: uuid("cost_center_id").references(() => financialCostCenters.id, { onDelete: "set null" }),
    amountInCents: integer("amount_in_cents").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    realizedDate: date("realized_date", { mode: "string" }),
    paymentMethod: text("payment_method"),
    notes: text("notes"),
    recurrenceGroupId: uuid("recurrence_group_id"),
    installmentNumber: integer("installment_number").default(1).notNull(),
    installmentCount: integer("installment_count").default(1).notNull(),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    appointmentId: uuid("appointment_id")
      .unique()
      .references(() => appointments.id, { onDelete: "set null" }),
    clientPackageId: uuid("client_package_id")
      .unique()
      .references(() => clientPackages.id, { onDelete: "set null" }),
    crmProposalId: uuid("crm_proposal_id")
      .unique()
      .references(() => crmProposals.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("financial_entries_org_due_idx").on(
      table.organizationId,
      table.dueDate
    ),
    index("financial_entries_org_realized_idx").on(
      table.organizationId,
      table.realizedDate
    ),
    index("financial_entries_status_idx").on(table.status),
    index("financial_entries_account_idx").on(table.accountId),
    index("financial_entries_category_idx").on(table.categoryId),
    index("financial_entries_recurrence_idx").on(table.recurrenceGroupId),
  ]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_organization_idx").on(table.organizationId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ]
);

export const whatsappChannels = pgTable(
  "whatsapp_channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    phoneNumberId: text("phone_number_id").notNull(),
    whatsappBusinessAccountId: text("whatsapp_business_account_id"),
    displayPhoneNumber: text("display_phone_number"),
    verifiedName: text("verified_name"),
    connectionStatus: text("connection_status").default("pending").notNull(),
    encryptedAccessToken: text("encrypted_access_token"),
    tokenExpiresAt: timestamp("token_expires_at"),
    connectedAt: timestamp("connected_at"),
    lastConnectionError: text("last_connection_error"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("whatsapp_channels_phone_number_unique").on(table.phoneNumberId),
    index("whatsapp_channels_organization_idx").on(table.organizationId),
  ]
);

export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => whatsappChannels.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => crmLeads.id, { onDelete: "set null" }),
    opportunityId: uuid("opportunity_id").references(() => crmOpportunities.id, { onDelete: "set null" }),
    assignedUserId: text("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    externalContactId: text("external_contact_id").notNull(),
    contactName: text("contact_name"),
    handoffStatus: text("handoff_status").default("bot").notNull(),
    handoffReason: text("handoff_reason"),
    automationPaused: boolean("automation_paused").default(false).notNull(),
    handoffRequestedAt: timestamp("handoff_requested_at"),
    handoffResolvedAt: timestamp("handoff_resolved_at"),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("chat_conversations_channel_contact_unique").on(
      table.channelId,
      table.externalContactId
    ),
    index("chat_conversations_organization_idx").on(table.organizationId),
    index("chat_conversations_lead_idx").on(table.leadId),
    index("chat_conversations_assigned_idx").on(table.assignedUserId),
    index("chat_conversations_last_message_idx").on(table.lastMessageAt),
  ]
);

export const crmAiInsights = pgTable(
  "crm_ai_insights",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => crmLeads.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").references(() => crmOpportunities.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => chatConversations.id, { onDelete: "set null" }),
    requestedByUserId: text("requested_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    status: crmAiInsightStatusEnum("status").default("draft").notNull(),
    summary: text("summary").notNull(),
    intent: text("intent"),
    urgency: integer("urgency").default(1).notNull(),
    suggestedAction: text("suggested_action"),
    suggestedReply: text("suggested_reply"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").default("crm-v1").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("crm_ai_insights_lead_idx").on(table.leadId, table.createdAt), index("crm_ai_insights_org_status_idx").on(table.organizationId, table.status)]
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    externalMessageId: text("external_message_id").notNull(),
    direction: chatMessageDirectionEnum("direction").notNull(),
    status: chatMessageStatusEnum("status").notNull(),
    messageType: text("message_type").default("text").notNull(),
    body: text("body"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().default({}),
    occurredAt: timestamp("occurred_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("chat_messages_external_id_unique").on(table.externalMessageId),
    index("chat_messages_conversation_idx").on(
      table.conversationId,
      table.occurredAt
    ),
    index("chat_messages_organization_idx").on(table.organizationId),
  ]
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: outboxStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    availableAt: timestamp("available_at").defaultNow().notNull(),
    lockedAt: timestamp("locked_at"),
    lockedBy: text("locked_by"),
    processedAt: timestamp("processed_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("outbox_events_event_key_unique").on(table.eventKey),
    index("outbox_events_pending_idx").on(table.status, table.availableAt),
    index("outbox_events_organization_idx").on(table.organizationId),
  ]
);
