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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("organization_service_plans_core_idx").on(table.corePlanCode)]
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
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("client_history_entries_client_idx").on(table.clientId, table.occurredAt),
    index("client_history_entries_org_idx").on(table.organizationId),
  ]
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
    durationMinutes: integer("duration_minutes").notNull(),
    priceInCents: integer("price_in_cents"),
    requiresProfessional: boolean("requires_professional").default(true).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("services_organization_idx").on(table.organizationId)]
);

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
    amountInCents: integer("amount_in_cents").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    realizedDate: date("realized_date", { mode: "string" }),
    paymentMethod: text("payment_method"),
    notes: text("notes"),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    appointmentId: uuid("appointment_id")
      .unique()
      .references(() => appointments.id, { onDelete: "set null" }),
    clientPackageId: uuid("client_package_id")
      .unique()
      .references(() => clientPackages.id, { onDelete: "set null" }),
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
    externalContactId: text("external_contact_id").notNull(),
    contactName: text("contact_name"),
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
    index("chat_conversations_last_message_idx").on(table.lastMessageAt),
  ]
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
