# Graph Report - gebook  (2026-08-25)

## Corpus Check
- 322 files · ~149,940 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2222 nodes · 5569 edges · 154 communities (107 shown, 47 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 215 edges (avg confidence: 0.81)
- Token cost: 186,237 input · 0 output

## Community Hubs (Navigation)
- Authors & Catalog Service
- Auth Service Core
- Public Site Pages
- Auth Guards & Decorators
- App Bootstrap & Error Filters
- Admin Authors Controller
- Admin Author & Work Editing
- Admin Categories Controller
- Auth Controller Endpoints
- Commission Rules Admin
- Team Member Invitations
- Tenant Creation & Cookie
- Workspace & Format Forms
- Commission Rule UI
- Tenant Profile Settings
- Admin Authors Service
- Order Pages & Views
- Initial Database Schema
- Author Revenue Reporting
- Admin Layout & Providers
- Activity Log & Modules
- Admin Page Shell Components
- Tenant Settings & Book Cards
- MIME Sniffing & Categories
- Backend TypeScript Config
- Frontend TypeScript Config
- Next.js API Proxy Routes
- Reader Library Space
- Fake Payment Driver Tests
- Backend Runtime Dependencies
- Work Creation DTOs
- shadcn Components Config
- Origin Guard Protection
- Marketing Content Pages
- Order Status Transitions
- Environment Configuration
- Backend NPM Scripts
- Frontend Runtime Dependencies
- Frontend Dev Dependencies
- Brand Illustration & Logo
- Admin Navigation Sidebar
- Category Manager UI
- Author DTOs
- Health Check Module
- Payment Response & Money
- Admin Profile Management
- Author Dashboard
- Order Creation DTOs
- Admin Pagination & Author Manager
- Revenue Chart Components
- Order DTO Validation
- Payment Panel Actions
- Order Listing Queries
- Team Management UI
- Format Selection & Purchase
- Jest Test Configuration
- Library Listing Queries
- Sample Throttling
- Orders Controller
- Project Docs & Agent Rules
- Database Seeding
- Roles Guard
- Commission Calculation Engine
- Library Download Controller
- Payments Controller
- Initial Setup Controller
- Music Book Cover Assets
- Admin List Pages
- Public Author Pages
- Admin Orders Controller
- Fake Payment Webhook Parsing
- Local File Storage Driver
- Payment Driver Registry
- Backend Build Config
- Site Homepage
- Admin Payment Refunds
- Multi-Tenant Audit Findings
- Admin Dashboard & Catalog Fetch
- Order Status Updates
- Book Detail Page
- Frontend Catalog Types
- Backend Package Metadata
- Library Service
- Tenant Access Guard
- Tenant Data Model Migration
- Financial Integrity Rules
- RLS Tenant Isolation
- Controlled Download Security
- Catalog Browse Page
- Frontend NPM Scripts
- Payment Webhook Security
- Backend Dev Dependencies
- Payment Initialization DTO
- Book Cover Rendering
- NestJS CLI Config
- Storage Driver Interface
- Root Layout & Fonts
- Frontend Package Metadata
- class-transformer Dependency
- helmet Dependency
- @nestjs/config Dependency
- @nestjs/platform-express Dependency
- @nestjs/serve-static Dependency
- eslint Dependency
- eslint-config-prettier Dependency
- @eslint/eslintrc Dependency
- eslint-plugin-prettier Dependency
- globals Dependency
- jest Dependency
- @nestjs/cli Dependency
- @nestjs/schematics Dependency
- @nestjs/testing Dependency
- prettier Dependency
- prisma Dependency
- source-map-support Dependency
- ts-jest Dependency
- ts-loader Dependency
- ts-node Dependency
- tsconfig-paths Dependency
- @types/cookie-parser Dependency
- @types/express Dependency
- @types/jest Dependency
- @types/multer Dependency
- @types/node Dependency
- @types/supertest Dependency
- typescript Dependency
- typescript-eslint Dependency
- Frontend ESLint Config
- Next.js Config
- gsap Dependency
- @hookform/resolvers Dependency
- lucide-react Dependency
- next-themes Dependency
- react-dom Dependency
- recharts Dependency
- tailwind-merge Dependency
- @tanstack/react-query Dependency
- tw-animate-css Dependency
- zod Dependency
- PostCSS Config
- Bilingual Naming Convention
- No Repository Layer

## God Nodes (most connected - your core abstractions)
1. `AuthenticatedUser` - 124 edges
2. `cn()` - 83 edges
3. `PrismaService` - 71 edges
4. `TenantContext` - 69 edges
5. `buildRlsContext()` - 45 edges
6. `Button()` - 38 edges
7. `CurrentTenant` - 32 edges
8. `formatPrice()` - 30 edges
9. `ActivityLogService` - 27 edges
10. `adminFetch()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Double filet : isolation applicative + RLS` --semantically_similar_to--> `Règles de sécurité non négociables`  [INFERRED] [semantically similar]
  docs/AUDIT_V2_MULTI_TENANT.md → README.md
- `ActivityLogService (journal d'activité)` --semantically_similar_to--> `Enregistrement de l'événement avant tout traitement`  [INFERRED] [semantically similar]
  docs/AUDIT_V2_MULTI_TENANT.md → README.md
- `frontend pnpm ignoredBuiltDependencies (sharp, unrs-resolver)` --semantically_similar_to--> `backend pnpm allowBuilds (prisma, argon2, unrs-resolver)`  [INFERRED] [semantically similar]
  frontend/pnpm-workspace.yaml → backend/pnpm-workspace.yaml
- `Cover: Cours de musique congolaise (backend asset)` --semantically_similar_to--> `Cover: Cours de musique congolaise (frontend asset)`  [INFERRED] [semantically similar]
  backend/storage/public/covers/cours-musique-congolaise.svg → frontend/public/covers/cours-musique-congolaise.svg
- `Cover: Education musicale et culture (backend asset)` --semantically_similar_to--> `Cover: Education musicale et culture (frontend asset)`  [INFERRED] [semantically similar]
  backend/storage/public/covers/education-musicale-culture.svg → frontend/public/covers/education-musicale-culture.svg

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Chaîne d'intégrité du webhook de paiement** — readme_paymentdriver, readme_webhook_sequence, readme_payment_event_logging, readme_webhook_idempotency, readme_frozen_sale_distributions, readme_payment_webhook_secret [EXTRACTED 1.00]
- **Isolation multi-tenant en profondeur** — docs_audit_v2_multi_tenant_tenantcontext, docs_audit_v2_multi_tenant_session_context, docs_audit_v2_multi_tenant_rls_policy, docs_audit_v2_multi_tenant_double_filet, docs_audit_v2_multi_tenant_no_bypassrls, docs_audit_v2_multi_tenant_scoped_role_guards [EXTRACTED 1.00]
- **Chaîne de téléchargement contrôlé** — readme_reader_library_access, readme_download_sequence, readme_private_storage_isolation, readme_frontend_download_relay, readme_access_revoked_never_deleted [EXTRACTED 1.00]
- **Mampouya Mam'sy music pedagogy cover series (600x800, dark ground, gold inset border, note motif, author byline)** — backend_storage_public_covers_cours_musique_congolaise_cover, backend_storage_public_covers_education_musicale_culture_cover, backend_storage_public_covers_harmonie_pratique_musicale_cover, backend_storage_public_covers_theorie_musicale_simplifiee_cover [INFERRED 0.95]
- **Music education curriculum: theory, harmony, culture, and Congolese repertoire** — backend_storage_public_covers_theorie_musicale_simplifiee_theorie_musicale, backend_storage_public_covers_harmonie_pratique_musicale_harmonie, backend_storage_public_covers_education_musicale_culture_education_musicale, backend_storage_public_covers_cours_musique_congolaise_musique_congolaise [INFERRED 0.85]
- **Cover assets duplicated across backend storage and frontend public roots** — backend_storage_public_covers_cours_musique_congolaise_cover, frontend_public_covers_cours_musique_congolaise_cover, backend_storage_public_covers_theorie_musicale_simplifiee_cover, frontend_public_covers_theorie_musicale_simplifiee_cover, backend_storage_public_covers_harmonie_pratique_musicale_cover, frontend_public_covers_harmonie_pratique_musicale_cover, backend_storage_public_covers_education_musicale_culture_cover, frontend_public_covers_education_musicale_culture_cover [INFERRED 0.95]
- **GeBOOK Brand Visual Language** — frontend_public_logo_gebook_logo, frontend_public_logo_gebook_brand_palette, frontend_public_illustrations_hero_books_illustration, frontend_public_illustrations_hero_books_brand_palette [INFERRED 0.85]
- **Open Book Motif Across Brand Assets** — frontend_public_logo_gebook_open_book_symbol, frontend_public_illustrations_hero_books_open_book, frontend_public_illustrations_hero_books_book_stack, frontend_public_illustrations_hero_books_gold_ribbon_bookmark [INFERRED 0.75]

## Communities (154 total, 47 thin omitted)

### Community 0 - "Authors & Catalog Service"
Cohesion: 0.05
Nodes (60): AuthorsService, publiclyVisible, publishedWorks, Injectable, CatalogController, Controller, Get, Param (+52 more)

### Community 1 - "Auth Service Core"
Cohesion: 0.06
Nodes (35): AuthResult, AuthService, registerDto, Injectable, RequestMeta, toAuthUserResponse(), RegisterDto, IsBoolean (+27 more)

### Community 2 - "Public Site Pages"
Cohesion: 0.06
Nodes (41): dynamic, metadata, SetupPage(), dynamic, LoginPage(), metadata, CreateWorkspacePage(), dynamic (+33 more)

### Community 3 - "Auth Guards & Decorators"
Cohesion: 0.09
Nodes (31): CurrentUser, AuthGuard, Injectable, AdminAuthorStats, assertCanWriteCatalog(), authorInclude, AuthorWithTranslations, AdminWorkStats (+23 more)

### Community 4 - "App Bootstrap & Error Filters"
Cohesion: 0.13
Nodes (29): AppModule, Module, defaultMessageFor(), ErrorResponseBody, HttpExceptionFilter, flatten(), validationExceptionFactory(), bootstrap() (+21 more)

### Community 5 - "Admin Authors Controller"
Cohesion: 0.11
Nodes (30): AdminAuthorsController, Body, Controller, CurrentUser, Delete, Get, HttpCode, Param (+22 more)

### Community 6 - "Admin Author & Work Editing"
Cohesion: 0.08
Nodes (39): metadata, metadata, Author, AuthorDetail(), AuthorFormValues, authorSchema, AuthorStatus, AuthorTranslation (+31 more)

### Community 7 - "Admin Categories Controller"
Cohesion: 0.08
Nodes (31): AdminCategoriesController, Body, Controller, CurrentUser, Delete, Get, HttpCode, Param (+23 more)

### Community 8 - "Auth Controller Endpoints"
Cohesion: 0.09
Nodes (32): AuthController, requestMeta(), Body, Controller, CurrentUser, Get, HttpCode, Patch (+24 more)

### Community 9 - "Commission Rules Admin"
Cohesion: 0.08
Nodes (29): AdminCommissionRulesService, Injectable, AdminCommissionsController, Body, Controller, CurrentUser, Delete, Get (+21 more)

### Community 10 - "Team Member Invitations"
Cohesion: 0.10
Nodes (29): ASSIGNABLE_ROLES, InviteMemberDto, IsEmail, IsIn, Transform, TeamMemberResponse, toTeamMemberResponse(), ASSIGNABLE_ROLES (+21 more)

### Community 11 - "Tenant Creation & Cookie"
Cohesion: 0.10
Nodes (27): ACTIVE_TENANT_COOKIE_NAME, activeTenantCookieOptions(), clearedActiveTenantCookieOptions(), CreateTenantDto, TENANT_TYPES, IsIn, IsOptional, IsString (+19 more)

### Community 12 - "Workspace & Format Forms"
Cohesion: 0.12
Nodes (25): CreateWorkspaceForm(), initialState, TENANT_TYPE_OPTIONS, ACCEPT_BY_FORMAT, FORMAT_TYPES, WorkFormat, initialState, PasswordInput() (+17 more)

### Community 13 - "Commission Rule UI"
Cohesion: 0.09
Nodes (30): AdminTablePanel(), BASE_LABELS, CommissionRule, CommissionRuleManager(), EMPTY, EMPTY_RULES, errorMessage(), Paginated (+22 more)

### Community 14 - "Tenant Profile Settings"
Cohesion: 0.10
Nodes (26): EXTENSION_BY_MIME, TenantProfileResponse, toTenantProfileResponse(), SocialLinksDto, IsOptional, IsString, Length, MaxLength (+18 more)

### Community 15 - "Admin Authors Service"
Cohesion: 0.19
Nodes (12): AuthenticatedUser, AdminAuthorsService, translateError(), Injectable, AdminWorksService, assertAllowedStatus(), assertCanWriteWork(), translateFormatError() (+4 more)

### Community 16 - "Order Pages & Views"
Cohesion: 0.10
Nodes (30): metadata, dynamic, metadata, MyOrdersPage(), OrderCard(), dynamic, loadOrder(), metadata (+22 more)

### Community 17 - "Initial Database Schema"
Cohesion: 0.11
Nodes (29): "activity_logs", "authors", "categories", "commission_rules", "downloads", "order_items", "orders", "payment_events" (+21 more)

### Community 18 - "Author Revenue Reporting"
Cohesion: 0.10
Nodes (23): AuthorRevenueController, Controller, CurrentUser, Get, Query, UseGuards, assertCanViewTenantFinance(), AuthorRevenueResponse (+15 more)

### Community 19 - "Admin Layout & Providers"
Cohesion: 0.11
Nodes (24): AdminLayout(), dynamic, metadata, AuteurLayout(), dynamic, AdminShell(), QueryProvider(), TenantContext (+16 more)

### Community 20 - "Activity Log & Modules"
Cohesion: 0.11
Nodes (23): ActivityLogEntry, ActivityLogService, Injectable, AuthModule, Module, categoryInclude, CategoryWithTranslations, CatalogModule (+15 more)

### Community 21 - "Admin Page Shell Components"
Cohesion: 0.11
Nodes (24): metadata, metadata, metadata, AdminPageHeader(), AdminStatCard(), AdminStatGrid(), STAT_GRID_COLUMNS, DateRange (+16 more)

### Community 22 - "Tenant Settings & Book Cards"
Cohesion: 0.10
Nodes (20): errorMessage(), TenantProfile, TenantSettingsFormValues, TenantSettingsManager(), tenantSettingsSchema, toFormValues(), BookCard(), BookGrid() (+12 more)

### Community 23 - "MIME Sniffing & Categories"
Cohesion: 0.09
Nodes (13): Inject, Inject, CategoryResponse, SniffedMimeType, sniffMimeType(), startsWith(), IMAGE_MIME_TYPES, Injectable (+5 more)

### Community 24 - "Backend TypeScript Config"
Cohesion: 0.06
Nodes (30): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+22 more)

### Community 25 - "Frontend TypeScript Config"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 26 - "Next.js API Proxy Routes"
Cohesion: 0.13
Nodes (19): PATCH(), POST(), proxy(), RouteContext, DELETE(), GET(), PATCH(), POST() (+11 more)

### Community 27 - "Reader Library Space"
Cohesion: 0.16
Nodes (18): DOWNLOAD_FAILURES, dynamic, LibraryCard(), LibraryPage(), metadata, dynamic, metadata, ReaderSpacePage() (+10 more)

### Community 28 - "Fake Payment Driver Tests"
Cohesion: 0.13
Nodes (13): FAKE_PROVIDER_CODE, FakeWebhookPayload, OUTCOMES, SIGNATURE_HEADER, TIMESTAMP_HEADER, DriverCapabilities, PAYMENT_DRIVER, PaymentInitRequest (+5 more)

### Community 29 - "Backend Runtime Dependencies"
Cohesion: 0.09
Nodes (23): argon2, dependencies, argon2, class-validator, cookie-parser, multer, @nestjs/common, @nestjs/core (+15 more)

### Community 30 - "Work Creation DTOs"
Cohesion: 0.24
Nodes (22): CreateWorkDto, CreateWorkFormatDto, CreateWorkTranslationsDto, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional (+14 more)

### Community 31 - "shadcn Components Config"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 32 - "Origin Guard Protection"
Cohesion: 0.11
Nodes (11): SKIP_ORIGIN_CHECK, SkipOriginCheck(), OriginGuard, SAFE_METHODS, Injectable, Controller, HttpCode, Param (+3 more)

### Community 33 - "Marketing Content Pages"
Cohesion: 0.14
Nodes (12): metadata, VALUES, AuthorsPage(), dynamic, metadata, metadata, AuthorCard(), ContactForm() (+4 more)

### Community 34 - "Order Status Transitions"
Cohesion: 0.13
Nodes (15): ALLOWED_TRANSITIONS, assertOrderTransitionAllowed(), RefundOrderDto, IsOptional, IsString, MaxLength, Transform, SimulatePaymentDto (+7 more)

### Community 35 - "Environment Configuration"
Cohesion: 0.12
Nodes (17): ArrayNotEmpty, Environment, NodeEnvironment, development, production, test, baseEnvironment, IsBoolean (+9 more)

### Community 36 - "Backend NPM Scripts"
Cohesion: 0.11
Nodes (19): scripts, build, db:deploy, db:generate, db:migrate, db:seed, format, lint (+11 more)

### Community 37 - "Frontend Runtime Dependencies"
Cohesion: 0.11
Nodes (19): class-variance-authority, clsx, dependencies, class-variance-authority, clsx, @gsap/react, next, radix-ui (+11 more)

### Community 38 - "Frontend Dev Dependencies"
Cohesion: 0.11
Nodes (19): eslint-config-next, devDependencies, eslint, eslint-config-next, prettier, tailwindcss, @tailwindcss/postcss, @types/node (+11 more)

### Community 39 - "Brand Illustration & Logo"
Cohesion: 0.17
Nodes (19): Fanned Closed Volume Stack, Illustration Navy-Leaf-Gold Palette, Leaf Green Cover Gradient, Navy Cover Gradient, Decorative aria-hidden Treatment, Gold Ribbon Bookmark, Gold Radial Halo Gradient, Hero Books Illustration (+11 more)

### Community 40 - "Admin Navigation Sidebar"
Cohesion: 0.16
Nodes (13): ADMIN_NAV, AdminNavGroup, AdminNavItem, AdminSidebar(), FINANCE_ROLES, NAV_GROUPS, SETTINGS_NAV_ITEM, AdminTopbar() (+5 more)

### Community 41 - "Category Manager UI"
Cohesion: 0.13
Nodes (16): Category, CategoryFormValues, categorySchema, CategoryStats, CategoryTranslation, categoryTranslationFieldsSchema, EMPTY, EMPTY_CATEGORIES (+8 more)

### Community 42 - "Author DTOs"
Cohesion: 0.25
Nodes (17): AuthorTranslationFieldsDto, CreateAuthorDto, CreateAuthorTranslationsDto, IsDateString, IsEmail, IsEnum, IsOptional, IsString (+9 more)

### Community 43 - "Health Check Module"
Cohesion: 0.17
Nodes (9): HealthController, Controller, Get, HttpCode, HealthModule, Module, HealthReport, HealthService (+1 more)

### Community 44 - "Payment Response & Money"
Cohesion: 0.19
Nodes (7): PaymentResponse, toPaymentResponse(), fromMinorUnits(), toMinorUnits(), WebhookAccepted, PaymentsService, Injectable

### Community 45 - "Admin Profile Management"
Cohesion: 0.14
Nodes (14): AdminProfilePage(), metadata, AdminPanel(), EMPTY_PASSWORD, errorMessage(), PasswordFormValues, passwordSchema, ProfileFormValues (+6 more)

### Community 46 - "Author Dashboard"
Cohesion: 0.16
Nodes (13): AuthorDashboardPage(), dynamic, metadata, SaleCard(), authHeaders(), AuthorRevenue, AuthorSale, fetchAuthorRevenue() (+5 more)

### Community 47 - "Order Creation DTOs"
Cohesion: 0.16
Nodes (12): CreateOrderItemDto, IsInt, IsUUID, Max, Min, OrderItemResponse, toAdminOrderResponse(), toOrderResponse() (+4 more)

### Community 48 - "Admin Pagination & Author Manager"
Cohesion: 0.13
Nodes (15): AdminPagination(), condense(), Step(), Author, AuthorFormValues, authorSchema, AuthorStats, AuthorTranslation (+7 more)

### Community 49 - "Revenue Chart Components"
Cohesion: 0.17
Nodes (14): chartConfig, RevenueChart(), ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent() (+6 more)

### Community 50 - "Order DTO Validation"
Cohesion: 0.17
Nodes (11): ArrayMinSize, CreateOrderDto, IsOptional, IsString, MaxLength, Transform, Type, ValidateNested (+3 more)

### Community 51 - "Payment Panel Actions"
Cohesion: 0.28
Nodes (12): initialState, PAYABLE_ORDER_STATUSES, PaymentPanel(), PaymentFormState, postToApi(), simulatePaymentAction(), startPaymentAction(), isPaymentInFlight() (+4 more)

### Community 52 - "Order Listing Queries"
Cohesion: 0.21
Nodes (10): Query, AdminListOrdersQuery, ListOrdersQuery, PaginatedOrdersResponse, IsEnum, IsInt, IsOptional, Max (+2 more)

### Community 53 - "Team Management UI"
Cohesion: 0.16
Nodes (11): metadata, ConfirmDialog(), EMPTY, EMPTY_MEMBERS, errorMessage(), InviteFormValues, inviteSchema, ROLE_LABELS (+3 more)

### Community 54 - "Format Selection & Purchase"
Cohesion: 0.19
Nodes (12): errorMessage(), FormatManager(), DELIVERY_REQUIREMENTS, FORMAT_ICONS, FormatSelector(), initialPurchaseState, WorkFormat, deliveryTypeLabel() (+4 more)

### Community 55 - "Jest Test Configuration"
Cohesion: 0.14
Nodes (14): jest, collectCoverageFrom, coverageDirectory, moduleFileExtensions, rootDir, testEnvironment, testRegex, transform (+6 more)

### Community 56 - "Library Listing Queries"
Cohesion: 0.16
Nodes (11): publiclyVisible, LibraryEntryResponse, ListLibraryQuery, IsInt, IsOptional, Max, Min, Transform (+3 more)

### Community 57 - "Sample Throttling"
Cohesion: 0.19
Nodes (8): SampleThrottleService, Injectable, SamplesController, Controller, Get, Param, Req, Res

### Community 58 - "Orders Controller"
Cohesion: 0.18
Nodes (10): OrdersController, Body, Controller, CurrentUser, Get, HttpCode, Param, Post (+2 more)

### Community 59 - "Project Docs & Agent Rules"
Cohesion: 0.18
Nodes (13): backend pnpm allowBuilds (prisma, argon2, unrs-resolver), Audit GeBook V2 — multi-tenant, Réorganisation frontend en src/features/*, Décision : RLS PostgreSQL native, sans Supabase, Plan d'implémentation en 20 phases, Écart de stack avec le brief V2 (Supabase supposé), Règles agent Next.js (documentation locale obligatoire), frontend/CLAUDE.md (délègue à AGENTS.md) (+5 more)

### Community 60 - "Database Seeding"
Cohesion: 0.27
Nodes (12): main(), prisma, REFERENCE_DATE, seedAuthorTranslation(), seedCatalog(), seedCatalogWithContext(), seedCategories(), seedCommissionRules() (+4 more)

### Community 61 - "Roles Guard"
Cohesion: 0.26
Nodes (5): Roles(), ROLES_KEY, RolesGuard, baseUser, Injectable

### Community 62 - "Commission Calculation Engine"
Cohesion: 0.28
Nodes (10): allocateProviderFee(), ApplicableRule, computeDistribution(), Distribution, DistributionInput, money(), selectRule(), fixedRule() (+2 more)

### Community 63 - "Library Download Controller"
Cohesion: 0.18
Nodes (10): LibraryController, sendAsAttachment(), Controller, CurrentUser, Get, Param, Query, Req (+2 more)

### Community 64 - "Payments Controller"
Cohesion: 0.23
Nodes (9): PaymentsController, Body, Controller, CurrentUser, Get, HttpCode, Param, Post (+1 more)

### Community 65 - "Initial Setup Controller"
Cohesion: 0.15
Nodes (9): SetupController, Body, Controller, Get, HttpCode, Post, Req, Res (+1 more)

### Community 66 - "Music Book Cover Assets"
Cohesion: 0.26
Nodes (13): Cover: Cours de musique congolaise (backend asset), Gold-on-Dark Music Cover Design System, Congolese Music Instruction, Cover: Education musicale et culture (backend asset), Music Education and Culture, Cover: Harmonie et pratique musicale (backend asset), Harmony and Musical Practice, Cover: Theorie musicale simplifiee (backend asset) (+5 more)

### Community 67 - "Admin List Pages"
Cohesion: 0.19
Nodes (10): AdminCategoriesPage(), dynamic, metadata, AdminOrdersPage(), dynamic, metadata, AdminCommissionsPage(), dynamic (+2 more)

### Community 68 - "Public Author Pages"
Cohesion: 0.28
Nodes (10): AuthorPage(), AuthorPortrait(), dynamic, generateMetadata(), loadAuthor(), AuthorAvatar(), Breadcrumb(), resolveAssetUrl() (+2 more)

### Community 69 - "Admin Orders Controller"
Cohesion: 0.20
Nodes (7): AdminOrdersController, Controller, Get, Param, UseGuards, AdminOrderResponse, AdminOrderStats

### Community 71 - "Local File Storage Driver"
Cohesion: 0.27
Nodes (6): LocalStorageDriver, PRIVATE_ROOT, PUBLIC_ROOT, STORAGE_ROOT, Injectable, StoredFile

### Community 72 - "Payment Driver Registry"
Cohesion: 0.20
Nodes (4): PaymentDriver, PaymentDriverRegistry, Inject, Injectable

### Community 73 - "Backend Build Config"
Cohesion: 0.18
Nodes (10): exclude, extends, include, dist, node_modules, prisma, src/**/*, test (+2 more)

### Community 74 - "Site Homepage"
Cohesion: 0.22
Nodes (6): dynamic, FORMATS, Stat(), STEPS, HeroVisual(), formatNumber()

### Community 75 - "Admin Payment Refunds"
Cohesion: 0.20
Nodes (8): AdminPaymentsController, Body, Controller, CurrentUser, HttpCode, Param, Post, UseGuards

### Community 76 - "Multi-Tenant Audit Findings"
Cohesion: 0.22
Nodes (10): AuthenticatedUser (nœud le plus connecté), LEGACY_SINGLE_TENANT_ID (point de rattachement temporaire), PaymentDriverRegistry (pattern interface + registre), Séparation Tenant Dashboard / Platform Admin, RolesGuard (rôles globaux non scopés), PlatformRolesGuard / TenantRolesGuard, SET LOCAL app.current_tenant_id (contexte de session Postgres), StorageDriver / LocalStorageDriver (+2 more)

### Community 77 - "Admin Dashboard & Catalog Fetch"
Cohesion: 0.36
Nodes (9): AdminDashboardPage(), dynamic, FINANCE_ROLES, metadata, HomePage(), apiFetch(), fetchAuthors(), fetchCategories() (+1 more)

### Community 78 - "Order Status Updates"
Cohesion: 0.28
Nodes (6): Body, CurrentUser, Patch, OrderResponse, IsEnum, UpdateOrderStatusDto

### Community 79 - "Book Detail Page"
Cohesion: 0.36
Nodes (7): buildJsonLd(), dynamic, generateMetadata(), loadRelatedWorks(), loadWork(), WorkPage(), fetchWork()

### Community 80 - "Frontend Catalog Types"
Cohesion: 0.28
Nodes (8): AuthorDetail, AuthorSummary, Category, FORMAT_OPTIONS, FormatType, WorkDetail, WorksFilters, WorkSummary

### Community 81 - "Backend Package Metadata"
Cohesion: 0.25
Nodes (7): author, description, license, name, packageManager, private, version

### Community 83 - "Tenant Access Guard"
Cohesion: 0.29
Nodes (4): TenantAccessGuard, Injectable, TenantContextService, Injectable

### Community 84 - "Tenant Data Model Migration"
Cohesion: 0.25
Nodes (8): ActivityLogService (journal d'activité), Contrainte unique Author.userId (blocage multi-tenant), Plan de migration des données (backfill tenant_id), Tenant historique Mampouya Éditions, Modèle Tenant, Modèle TenantMember (rôles scopés), Modèle TenantSetting, Enregistrement de l'événement avant tout traitement

### Community 85 - "Financial Integrity Rules"
Cohesion: 0.29
Nodes (8): Moteur de commissions réutilisable (commission.ts), Panier multi-tenant : tenant_id sur OrderItem, 8 contraintes CHECK d'intégrité financière, Formule de commission (risque R-03), Montants figés dans sale_distributions, Migrations Prisma seule source de vérité, Répartition au prorata des frais prestataire, Clés primaires UUID v7

### Community 86 - "RLS Tenant Isolation"
Cohesion: 0.25
Nodes (8): Double filet : isolation applicative + RLS, Rôle Postgres applicatif sans BYPASSRLS, Workflow de publication (WorkStatus étendu), Policy RLS tenant_isolation_works, WorkVisibility (private / tenant_only / public), Flux de données unique (PostgreSQL → Prisma → NestJS → HTTP → Next.js), Seed idempotent, Aucune donnée métier en dur

### Community 87 - "Controlled Download Security"
Cohesion: 0.29
Nodes (8): ReaderLibrary tenant-agnostique, Séquence de téléchargement contrôlé (audit §34), Relais frontend app/api/library/[id]/download, storage/private jamais servi par URL statique, Droit d'accès issu de reader_library uniquement (règle 17), Extraits gratuits limités par IP, Règles de sécurité non négociables, Idempotence par contrainte unique (payment_provider_id, event_id)

### Community 88 - "Catalog Browse Page"
Cohesion: 0.36
Nodes (7): buildCatalogHref(), CatalogPage(), dynamic, firstValue(), metadata, CatalogFilters(), isFormatType()

### Community 89 - "Frontend NPM Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, format, format:check, lint, start, typecheck

### Community 90 - "Payment Webhook Security"
Cohesion: 0.29
Nodes (8): Accès révoqué, jamais supprimé, Validation des variables d'environnement au démarrage, Prestataire de simulation (fake), PAYMENT_WEBHOOK_SECRET, PaymentDriver (interface prestataire), Prestataire proposé seulement si actif en base et piloté, Remboursement transactionnel avec révocation d'accès, Séquence de traitement des webhooks de paiement (audit §33)

### Community 91 - "Backend Dev Dependencies"
Cohesion: 0.29
Nodes (7): devDependencies, dotenv, @eslint/js, supertest, dotenv, @eslint/js, supertest

### Community 92 - "Payment Initialization DTO"
Cohesion: 0.29
Nodes (6): InitializePaymentDto, IsOptional, IsString, Matches, MaxLength, Transform

### Community 93 - "Book Cover Rendering"
Cohesion: 0.38
Nodes (5): BookCover(), FallbackCover(), hashToTint(), TINTS, CoverImage()

### Community 94 - "NestJS CLI Config"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 96 - "Root Layout & Fonts"
Cohesion: 0.33
Nodes (4): fraunces, instrumentSans, metadata, viewport

### Community 97 - "Frontend Package Metadata"
Cohesion: 0.40
Nodes (4): name, packageManager, private, version

## Ambiguous Edges - Review These
- `Seed idempotent` → `WorkVisibility (private / tenant_only / public)`  [AMBIGUOUS]
  docs/AUDIT_V2_MULTI_TENANT.md · relation: conceptually_related_to
- `Réorganisation frontend en src/features/*` → `Règles agent Next.js (documentation locale obligatoire)`  [AMBIGUOUS]
  docs/AUDIT_V2_MULTI_TENANT.md · relation: conceptually_related_to
- `Hero Books Illustration` → `Green-Gold-Red Tricolor Rule`  [AMBIGUOUS]
  frontend/public/illustrations/hero-books.svg · relation: conceptually_related_to
- `Loose Leaf-Green Petals` → `Fanned Open Book Symbol`  [AMBIGUOUS]
  frontend/public/illustrations/hero-books.svg · relation: conceptually_related_to

## Knowledge Gaps
- **470 isolated node(s):** `$schema`, `collection`, `sourceRoot`, `deleteOutDir`, `name` (+465 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **47 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Seed idempotent` and `WorkVisibility (private / tenant_only / public)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Réorganisation frontend en src/features/*` and `Règles agent Next.js (documentation locale obligatoire)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Hero Books Illustration` and `Green-Gold-Red Tricolor Rule`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Loose Leaf-Green Petals` and `Fanned Open Book Symbol`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `AuthenticatedUser` connect `Admin Authors Service` to `Auth Service Core`, `Auth Guards & Decorators`, `Admin Authors Controller`, `Admin Categories Controller`, `Auth Controller Endpoints`, `Commission Rules Admin`, `Team Member Invitations`, `Tenant Creation & Cookie`, `Tenant Profile Settings`, `Author Revenue Reporting`, `Order Status Transitions`, `Payment Response & Money`, `Order Creation DTOs`, `Orders Controller`, `Roles Guard`, `Library Download Controller`, `Payments Controller`, `Admin Payment Refunds`, `Order Status Updates`, `Tenant Access Guard`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Why does `PrismaService` connect `MIME Sniffing & Categories` to `Authors & Catalog Service`, `Auth Service Core`, `Auth Guards & Decorators`, `App Bootstrap & Error Filters`, `Admin Categories Controller`, `Commission Rules Admin`, `Team Member Invitations`, `Tenant Creation & Cookie`, `Tenant Profile Settings`, `Admin Authors Service`, `Author Revenue Reporting`, `Activity Log & Modules`, `Order Status Transitions`, `Health Check Module`, `Order Creation DTOs`, `Order DTO Validation`, `Library Listing Queries`, `Payment Driver Registry`, `Tenant Access Guard`, `Storage Driver Interface`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `AdminCategoriesController` connect `Admin Categories Controller` to `Initial Database Schema`, `Auth Guards & Decorators`, `Activity Log & Modules`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._