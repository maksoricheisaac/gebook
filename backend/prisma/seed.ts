/**
 * Données de développement de GeBook.
 *
 * Ce fichier est le **seul** endroit où vivent des données de démonstration : ni les
 * contrôleurs, ni les composants ne doivent en contenir. Il reprend les données de
 * référence de `database/seed.sql` (rôles, catégories, prestataires, réglages, règle
 * de commission) et y ajoute le catalogue qui servait de décor à l'ancienne version
 * PHP, cette fois en base.
 *
 * Le seed est idempotent : chaque écriture passe par un `upsert` sur une clé unique
 * métier, il peut donc être relancé sans dupliquer ni casser quoi que ce soit.
 *
 * Aucun compte utilisateur n'est créé, conformément au choix d'origine documenté dans
 * `database/README.md`.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import {
  AuthorStatus,
  CalculationBase,
  CommissionType,
  ContentLocale,
  DeliveryType,
  FormatType,
  ProviderEnvironment,
  ProviderStatus,
  SettingValueType,
  TenantStatus,
  TenantType,
  WorkStatus,
  WorkVisibility,
} from '../src/generated/prisma/enums';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Date de référence des données historiques, reprise de `database/seed.sql`. */
const REFERENCE_DATE = new Date('2026-07-21T23:09:25Z');

/**
 * Même identifiant que le tenant historique créé par la migration
 * `20260823010000_add_multi_tenant_core` : sur une base déjà existante, cette
 * migration l'a déjà créé (backfill des données V1) et cet upsert ne fait
 * qu'y toucher ; sur une base fraîche (CI, nouvel environnement), la migration
 * n'a rien créé faute d'utilisateur — c'est ce seed qui le crée alors.
 * Garder le même id dans les deux cas évite d'avoir deux tenants différents
 * selon l'ordre dans lequel la base a été construite.
 */
const HISTORICAL_TENANT_ID = 'e000ff30-9153-4226-9010-0ba3f640d23c';

async function seedTenant(): Promise<string> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'mampouya-editions' },
    update: {},
    create: {
      id: HISTORICAL_TENANT_ID,
      slug: 'mampouya-editions',
      name: 'Mampouya Éditions',
      type: TenantType.publishing_house,
      description:
        "Maison d'édition congolaise — premier tenant historique de GeBook, publiée avant l'introduction du multi-tenant.",
      status: TenantStatus.active,
      createdAt: REFERENCE_DATE,
      updatedAt: REFERENCE_DATE,
    },
  });
  return tenant.id;
}

async function seedRoles(): Promise<void> {
  const roles = [
    { name: 'admin', label: 'Administrateur' },
    { name: 'author', label: 'Auteur' },
    { name: 'reader', label: 'Lecteur' },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { label: role.label },
      create: { ...role, createdAt: REFERENCE_DATE },
    });
  }
}

async function seedCategories(): Promise<void> {
  const categories = [
    {
      slug: 'musique',
      name: 'Musique',
      description: 'Ouvrages consacrés à la musique.',
    },
    {
      slug: 'culture-congolaise',
      name: 'Culture congolaise',
      description: 'Œuvres portant sur la culture congolaise.',
    },
    {
      slug: 'litterature',
      name: 'Littérature',
      description: 'Romans, nouvelles, poésie et récits.',
    },
    {
      slug: 'pedagogie',
      name: 'Pédagogie',
      description: 'Ouvrages et supports pédagogiques.',
    },
    {
      slug: 'sciences-humaines',
      name: 'Sciences humaines',
      description: 'Ouvrages liés aux sciences humaines et sociales.',
    },
  ];

  for (const category of categories) {
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, description: category.description },
      create: {
        ...category,
        createdAt: REFERENCE_DATE,
        updatedAt: REFERENCE_DATE,
      },
    });

    // Ligne `fr` (Phase 1 « bilinguisme ») : les colonnes ci-dessus restent la
    // source pendant la transition, `category_translations` en est la copie
    // structurée que lit désormais l'API.
    await prisma.categoryTranslation.upsert({
      where: {
        categoryId_locale: { categoryId: saved.id, locale: ContentLocale.fr },
      },
      update: { name: category.name, description: category.description },
      create: {
        categoryId: saved.id,
        locale: ContentLocale.fr,
        name: category.name,
        description: category.description,
      },
    });
  }
}

/**
 * Un prestataire n'est actif que si son pilote existe réellement dans l'API : la
 * table décrit ce qui est disponible, le code exécute. Tant que le pilote Chariow
 * n'est pas écrit (phase 8b), le seul prestataire actif est celui de simulation —
 * annoncer le contraire reviendrait à proposer au lecteur un paiement impossible.
 */
async function seedPaymentProviders(): Promise<void> {
  const providers = [
    {
      code: 'fake',
      name: 'Paiement simulé (développement)',
      driver: 'FakePaymentDriver',
      environment: ProviderEnvironment.sandbox,
      status: ProviderStatus.active,
      supportsMobileMoney: true,
      supportsCard: true,
      supportsRefund: true,
      supportsPayout: true,
      priority: 1,
    },
    // Catalogue des trois prestataires de la plateforme de paiement (mission
    // dédiée, `docs/PAYMENT_PLATFORM_PROGRESS.md`). `inactive` tant qu'aucun
    // pilote réel n'est écrit (Phases 4-6 pay-in, 10-11 payout) : la table
    // décrit ce qui existera, le code exécute ce qui existe vraiment — même
    // règle que pour `chariow`/`mtn_momo` ci-dessous. Les capacités cochées
    // ne reprennent que ce que le brief affirme explicitement ; tout le reste
    // reste à `false` jusqu'à vérification réelle contre un compte sandbox
    // (jamais supposé depuis la documentation du prestataire).
    {
      code: 'pawapay',
      name: 'PawaPay',
      driver: 'PawaPayDriver',
      environment: ProviderEnvironment.sandbox,
      status: ProviderStatus.inactive,
      supportsMobileMoney: true,
      supportsCard: false,
      supportsRefund: false,
      supportsPayout: true,
      priority: 4,
    },
    {
      code: 'cinetpay',
      name: 'CinetPay',
      driver: 'CinetPayDriver',
      environment: ProviderEnvironment.sandbox,
      // Actif : un vrai pilote existe désormais (CinetPayPaymentDriver,
      // Phase 4) — même règle que les autres lignes de cette table, « un
      // prestataire n'est actif que si son pilote existe réellement ».
      // Reste indisponible tant que CINETPAY_API_KEY/SITE_ID/SECRET_KEY ne
      // sont pas renseignées dans l'environnement (`PaymentDriverRegistry`
      // renvoie alors 503, jamais une erreur de configuration silencieuse).
      status: ProviderStatus.active,
      supportsMobileMoney: false,
      supportsCard: true,
      supportsRefund: false,
      supportsPayout: false,
      priority: 5,
    },
    {
      code: 'feexpay',
      name: 'FeexPay',
      driver: 'FeexPayDriver',
      environment: ProviderEnvironment.sandbox,
      // Actif côté pay-in : FeexPayPaymentDriver existe désormais. Le
      // payout FeexPay (supportsPayout ci-dessous) reste un axe distinct,
      // pas encore couvert par un pilote payout réel (à venir).
      status: ProviderStatus.active,
      supportsMobileMoney: true,
      supportsCard: false,
      supportsRefund: false,
      supportsPayout: true,
      priority: 6,
    },
    {
      code: 'chariow',
      name: 'Chariow',
      driver: 'ChariowPaymentDriver',
      environment: ProviderEnvironment.sandbox,
      status: ProviderStatus.inactive,
      supportsMobileMoney: true,
      supportsCard: true,
      supportsRefund: true,
      priority: 2,
    },
    {
      code: 'mtn_momo',
      name: 'MTN Mobile Money',
      driver: 'MtnMomoPaymentDriver',
      environment: ProviderEnvironment.sandbox,
      status: ProviderStatus.inactive,
      supportsMobileMoney: true,
      supportsCard: false,
      supportsRefund: false,
      priority: 3,
    },
  ];

  for (const provider of providers) {
    await prisma.paymentProvider.upsert({
      where: { code: provider.code },
      update: provider,
      create: {
        ...provider,
        createdAt: REFERENCE_DATE,
        updatedAt: REFERENCE_DATE,
      },
    });
  }
}

async function seedSettings(): Promise<void> {
  const settings = [
    {
      settingKey: 'site_name',
      settingValue: 'GeBook',
      valueType: SettingValueType.string,
      isPublic: true,
    },
    {
      settingKey: 'site_slogan',
      settingValue: 'Publiez. Vendez. Rayonnez.',
      valueType: SettingValueType.string,
      isPublic: true,
    },
    {
      settingKey: 'default_currency',
      settingValue: 'XAF',
      valueType: SettingValueType.string,
      isPublic: true,
    },
    {
      settingKey: 'default_commission_rate',
      settingValue: '10',
      valueType: SettingValueType.decimal,
      isPublic: false,
    },
    {
      settingKey: 'commission_calculation_base',
      settingValue: 'after_provider_fee',
      valueType: SettingValueType.string,
      isPublic: false,
    },
    {
      settingKey: 'support_email',
      settingValue: 'contact@gebook.local',
      valueType: SettingValueType.string,
      isPublic: true,
    },
    // Prestataire retenu par défaut à l'ouverture d'un paiement. Réglage métier,
    // modifiable par un administrateur sans redéploiement (audit §33). Il désigne
    // la simulation tant qu'aucun pilote réel n'est installé.
    {
      settingKey: 'default_payment_provider',
      settingValue: 'fake',
      valueType: SettingValueType.string,
      isPublic: false,
    },
    {
      settingKey: 'max_pdf_size_mb',
      settingValue: '100',
      valueType: SettingValueType.integer,
      isPublic: false,
    },
    // 0 signifie « téléchargements illimités ».
    {
      settingKey: 'download_limit',
      settingValue: '0',
      valueType: SettingValueType.integer,
      isPublic: false,
    },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { settingKey: setting.settingKey },
      update: setting,
      create: setting,
    });
  }
}

async function seedCommissionRules(): Promise<void> {
  const name = 'Commission générale GeBook';
  const existing = await prisma.commissionRule.findFirst({
    where: { name, authorId: null },
  });

  const rule = {
    name,
    authorId: null,
    commissionType: CommissionType.percentage,
    commissionValue: '10.0000',
    calculationBase: CalculationBase.after_provider_fee,
    effectiveFrom: REFERENCE_DATE,
  };

  if (existing) {
    await prisma.commissionRule.update({
      where: { id: existing.id },
      data: rule,
    });
    return;
  }

  await prisma.commissionRule.create({
    data: { ...rule, createdAt: REFERENCE_DATE },
  });
}

/**
 * Conditions de distribution, version 1, une par type de tenant (mission
 * plateforme de paiement, §16 : « ne crée pas de conditions juridiques
 * fictives — si aucun contenu définitif n'est fourni, une structure
 * administrable avec des textes clairement marqués comme à compléter »).
 *
 * Sans cette version de base, la création d'un tenant n'aurait rien à faire
 * accepter — ce placeholder existe pour que le circuit d'acceptation
 * (`TenantsService.create`) soit réellement exercé dès le premier tenant créé,
 * pas seulement une fois qu'un texte juridique définitif aura été publié par
 * un Superadmin depuis `/admin/distribution-terms`.
 */
async function seedDistributionTerms(): Promise<void> {
  const placeholder =
    '[À COMPLÉTER] Ce texte est un espace réservé administrable. ' +
    'Aucun contenu juridique définitif n’a encore été rédigé pour ce type ' +
    'd’espace. Il doit être remplacé par un Superadmin avant toute mise en ' +
    'production réelle — commission, part du vendeur, délai de reversement, ' +
    'règles de publication, règles de retrait, conditions et frais de ' +
    'reversement, règles de remboursement, règles de contenu, propriété ' +
    'intellectuelle, responsabilités de l’auteur/du tenant, retrait ' +
    'd’œuvre, suspension de compte.';

  const types: { type: TenantType; label: string }[] = [
    { type: TenantType.independent_author, label: 'Auteur indépendant' },
    { type: TenantType.publishing_house, label: 'Maison d’édition' },
    { type: TenantType.collective, label: 'Collectif' },
    {
      type: TenantType.cultural_organization,
      label: 'Organisation culturelle',
    },
  ];

  for (const { type, label } of types) {
    await prisma.distributionTerms.upsert({
      where: { tenantType_version: { tenantType: type, version: 1 } },
      update: {},
      create: {
        tenantType: type,
        version: 1,
        title: `Conditions de distribution — ${label} (v1, à compléter)`,
        content: placeholder,
        isActive: true,
        publishedAt: REFERENCE_DATE,
        createdAt: REFERENCE_DATE,
      },
    });
  }
}

/**
 * Auteurs et œuvres. Le catalogue reprend les quatre ouvrages qui étaient codés en dur
 * dans `DemoWorkRepository`, avec leurs vrais prix, et y ajoute deux œuvres :
 * une pour un second auteur, et une en brouillon qui doit rester invisible du public.
 */
/** Ligne `fr` (Phase 1 « bilinguisme »), voir le commentaire de `seedCategories`. */
async function seedAuthorTranslation(
  tx: Prisma.TransactionClient,
  authorId: string,
  fields: { biography: string; shortBiography: string },
): Promise<void> {
  await tx.authorTranslation.upsert({
    where: {
      authorId_locale: { authorId, locale: ContentLocale.fr },
    },
    update: {},
    create: { authorId, locale: ContentLocale.fr, ...fields },
  });
}

/**
 * `authors`/`works`/`work_formats`/`*_translations` sont protégées par RLS
 * (Phase 4) : le client `prisma` de ce script n'a aucun contexte de session
 * (ni tenant, ni utilisateur, ni platform_admin), donc `FORCE ROW LEVEL
 * SECURITY` bloquerait chaque écriture. `$transaction` garantit que le
 * `set_config(..., true)` ci-dessous et toutes les écritures qui suivent
 * partagent la même connexion — exactement le mécanisme de
 * `PrismaService.withRlsContext()` côté application, reproduit ici à la main
 * puisque ce script tourne hors NestJS.
 */
async function seedCatalog(tenantId: string): Promise<void> {
  await prisma.$transaction((tx) => seedCatalogWithContext(tx, tenantId), {
    timeout: 30_000,
  });
}

async function seedCatalogWithContext(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', '', true)`;
  await tx.$executeRaw`SELECT set_config('app.current_user_id', '', true)`;
  await tx.$executeRaw`SELECT set_config('app.is_platform_admin', 'true', true)`;

  const author = await tx.author.upsert({
    where: { slug: 'mampouya-mamsy' },
    update: {},
    create: {
      tenantId,
      slug: 'mampouya-mamsy',
      penName: "Mampouya Mam'sy",
      shortBiography:
        'Auteur congolais passionné par la musique, la culture et la transmission des savoirs aux nouvelles générations.',
      biography:
        "Auteur, pédagogue et musicien, Mampouya Mam'sy consacre son travail à la transmission de la musique congolaise. " +
        "Ses ouvrages accompagnent aussi bien l'élève qui découvre le solfège que l'enseignant qui cherche des supports adaptés au contexte local.",
      country: 'Congo',
      city: 'Brazzaville',
      status: AuthorStatus.active,
    },
  });
  await seedAuthorTranslation(tx, author.id, {
    shortBiography:
      'Auteur congolais passionné par la musique, la culture et la transmission des savoirs aux nouvelles générations.',
    biography:
      "Auteur, pédagogue et musicien, Mampouya Mam'sy consacre son travail à la transmission de la musique congolaise. " +
      "Ses ouvrages accompagnent aussi bien l'élève qui découvre le solfège que l'enseignant qui cherche des supports adaptés au contexte local.",
  });

  const secondAuthor = await tx.author.upsert({
    where: { slug: 'linda-m' },
    update: {},
    create: {
      tenantId,
      slug: 'linda-m',
      penName: 'Linda M.',
      shortBiography:
        "Entrepreneure et autrice engagée dans le partage d'expériences concrètes pour accompagner les porteurs de projets.",
      biography:
        "Entrepreneure installée à Pointe-Noire, Linda M. écrit à partir de son propre parcours. Elle s'adresse à celles et ceux " +
        'qui veulent créer leur activité sans disposer d’un capital de départ ni d’un réseau établi.',
      country: 'Congo',
      city: 'Pointe-Noire',
      status: AuthorStatus.active,
    },
  });
  await seedAuthorTranslation(tx, secondAuthor.id, {
    shortBiography:
      "Entrepreneure et autrice engagée dans le partage d'expériences concrètes pour accompagner les porteurs de projets.",
    biography:
      "Entrepreneure installée à Pointe-Noire, Linda M. écrit à partir de son propre parcours. Elle s'adresse à celles et ceux " +
      'qui veulent créer leur activité sans disposer d’un capital de départ ni d’un réseau établi.',
  });

  const categories = await tx.category.findMany({
    select: { id: true, slug: true },
  });
  const categoryId = (slug: string): string => {
    const found = categories.find((category) => category.slug === slug);
    if (!found) {
      throw new Error(`Catégorie introuvable dans le seed : ${slug}`);
    }
    return found.id;
  };

  const works = [
    {
      slug: 'cours-de-musique-congolaise',
      title: 'Cours de musique congolaise',
      authorId: author.id,
      categoryId: categoryId('musique'),
      shortDescription:
        'Un guide complet pour découvrir, comprendre et maîtriser la musique congolaise dans toute sa richesse.',
      description:
        'Ce cours parcourt les rythmes, les instruments et les répertoires qui font la musique congolaise. ' +
        "Chaque chapitre alterne une partie théorique et des exercices d'application, pour un travail autonome ou en classe.",
      coverPath: 'covers/cours-musique-congolaise.svg',
      pageCount: 240,
      publicationYear: 2024,
      publicationDate: new Date('2024-03-15T00:00:00Z'),
      status: WorkStatus.published,
      featured: true,
      publishedAt: new Date('2024-03-15T00:00:00Z'),
      formats: [
        {
          formatType: FormatType.pdf,
          label: 'Livre numérique',
          price: '5000.00',
          deliveryType: DeliveryType.digital_download,
          unlimitedStock: true,
        },
        {
          formatType: FormatType.paper,
          label: 'Livre imprimé',
          price: '15000.00',
          deliveryType: DeliveryType.physical_delivery,
          stockQuantity: 25,
        },
      ],
    },
    {
      slug: 'harmonie-et-pratique-musicale',
      title: 'Harmonie et pratique musicale',
      authorId: author.id,
      categoryId: categoryId('musique'),
      shortDescription:
        "Une approche pratique de l'harmonie pour progresser avec méthode.",
      description:
        "L'harmonie est souvent enseignée comme une matière abstraite. Cet ouvrage prend le chemin inverse : chaque notion " +
        "est introduite par un extrait à jouer, puis expliquée. Il s'adresse aux musiciens qui savent déjà lire une partition.",
      coverPath: 'covers/harmonie-pratique-musicale.svg',
      pageCount: 180,
      publicationYear: 2024,
      publicationDate: new Date('2024-05-18T00:00:00Z'),
      status: WorkStatus.published,
      featured: false,
      publishedAt: new Date('2024-05-18T00:00:00Z'),
      formats: [
        {
          formatType: FormatType.pdf,
          label: 'Livre numérique',
          price: '5000.00',
          deliveryType: DeliveryType.digital_download,
          unlimitedStock: true,
        },
      ],
    },
    {
      slug: 'theorie-musicale-simplifiee',
      title: 'Théorie musicale simplifiée',
      authorId: author.id,
      categoryId: categoryId('pedagogie'),
      shortDescription:
        'Les bases essentielles de la théorie musicale expliquées simplement.',
      description:
        'Un manuel d’initiation pensé pour les grands débutants. Les notions sont introduites une par une, ' +
        'avec un vocabulaire volontairement dépouillé et des exercices courts à la fin de chaque partie.',
      coverPath: 'covers/theorie-musicale-simplifiee.svg',
      pageCount: 126,
      publicationYear: 2024,
      publicationDate: new Date('2024-06-12T00:00:00Z'),
      status: WorkStatus.published,
      featured: true,
      publishedAt: new Date('2024-06-12T00:00:00Z'),
      formats: [
        {
          formatType: FormatType.pdf,
          label: 'Livre numérique',
          price: '4000.00',
          deliveryType: DeliveryType.digital_download,
          unlimitedStock: true,
        },
      ],
    },
    {
      slug: 'education-musicale-et-culture',
      title: 'Éducation musicale et culture',
      authorId: author.id,
      categoryId: categoryId('culture-congolaise'),
      shortDescription:
        'Un regard pédagogique sur la musique, la culture et la transmission.',
      description:
        "Que transmet-on lorsqu'on enseigne la musique ? Cet essai relie la pratique musicale aux questions de culture " +
        "et d'éducation, à partir d'exemples pris dans les écoles congolaises.",
      coverPath: 'covers/education-musicale-culture.svg',
      pageCount: 150,
      publicationYear: 2024,
      publicationDate: new Date('2024-04-24T00:00:00Z'),
      status: WorkStatus.published,
      featured: false,
      publishedAt: new Date('2024-04-24T00:00:00Z'),
      formats: [
        {
          formatType: FormatType.pdf,
          label: 'Livre numérique',
          price: '4000.00',
          deliveryType: DeliveryType.digital_download,
          unlimitedStock: true,
        },
        {
          formatType: FormatType.paper,
          label: 'Livre imprimé',
          price: '12000.00',
          deliveryType: DeliveryType.physical_delivery,
          stockQuantity: 40,
        },
      ],
    },
    {
      slug: 'entreprendre-au-congo',
      title: 'Entreprendre au Congo',
      authorId: secondAuthor.id,
      categoryId: categoryId('sciences-humaines'),
      shortDescription:
        'Créer son activité avec les moyens du bord, sans capital de départ.',
      description:
        'Un manuel de terrain nourri de parcours réels : formaliser une activité, trouver ses premiers clients, ' +
        'gérer sa trésorerie au quotidien et tenir dans la durée.',
      pageCount: 210,
      publicationYear: 2025,
      publicationDate: new Date('2025-02-10T00:00:00Z'),
      status: WorkStatus.published,
      featured: true,
      publishedAt: new Date('2025-02-10T00:00:00Z'),
      formats: [
        {
          formatType: FormatType.pdf,
          label: 'Livre numérique',
          price: '6000.00',
          deliveryType: DeliveryType.digital_download,
          unlimitedStock: true,
        },
        {
          formatType: FormatType.paper,
          label: 'Livre imprimé',
          price: '14000.00',
          deliveryType: DeliveryType.physical_delivery,
          stockQuantity: 15,
        },
      ],
    },
    {
      // Volontairement en brouillon : sert de garde-fou à la règle métier n° 3 —
      // une œuvre non publiée ne doit apparaître ni dans le catalogue, ni par son slug.
      slug: 'memoire-des-rives',
      title: 'Mémoire des rives',
      authorId: author.id,
      categoryId: categoryId('litterature'),
      shortDescription:
        'Récits du fleuve, entre mémoire familiale et histoire collective.',
      description:
        'Un recueil de récits courts qui suit le cours du fleuve Congo, de Brazzaville aux villages de pêcheurs. ' +
        'Ouvrage en préparation.',
      pageCount: 160,
      publicationYear: 2026,
      status: WorkStatus.draft,
      featured: false,
      formats: [
        {
          formatType: FormatType.pdf,
          label: 'Livre numérique',
          price: '4500.00',
          deliveryType: DeliveryType.digital_download,
          unlimitedStock: true,
        },
        {
          formatType: FormatType.paper,
          label: 'Livre imprimé',
          price: '13000.00',
          deliveryType: DeliveryType.physical_delivery,
          stockQuantity: 0,
        },
      ],
    },
  ];

  for (const { formats, ...work } of works) {
    // Un catalogue de démonstration ne doit pas être créé "invisible" : une œuvre
    // déjà publiée doit apparaître dans le catalogue public agrégé (même défaut
    // sûr que le backfill de la migration 20260823010100).
    const visibility =
      work.status === WorkStatus.published
        ? WorkVisibility.public
        : WorkVisibility.private;
    const saved = await tx.work.upsert({
      where: { slug: work.slug },
      update: { ...work, visibility },
      create: { ...work, tenantId, visibility },
    });

    // Ligne `fr` (Phase 1 « bilinguisme »), voir le commentaire de
    // `seedCategories`. `cours-de-musique-congolaise` reçoit en plus une
    // traduction anglaise complète : fixture de démonstration/QA du repli
    // FR->EN sur les cinq autres œuvres, volontairement laissées non traduites.
    const frTranslation = {
      title: work.title,
      subtitle: undefined,
      shortDescription: work.shortDescription,
      description: work.description,
      tableOfContents: undefined,
    };
    await tx.workTranslation.upsert({
      where: { workId_locale: { workId: saved.id, locale: ContentLocale.fr } },
      update: frTranslation,
      create: { workId: saved.id, locale: ContentLocale.fr, ...frTranslation },
    });

    if (work.slug === 'cours-de-musique-congolaise') {
      const enTranslation = {
        title: 'Congolese Music Course',
        shortDescription:
          'A complete guide to discovering, understanding and mastering Congolese music in all its richness.',
        description:
          'This course covers the rhythms, instruments and repertoires that make up Congolese music. ' +
          'Each chapter alternates between theory and practical exercises, for independent study or classroom use.',
      };
      await tx.workTranslation.upsert({
        where: {
          workId_locale: { workId: saved.id, locale: ContentLocale.en },
        },
        update: enTranslation,
        create: {
          workId: saved.id,
          locale: ContentLocale.en,
          ...enTranslation,
        },
      });
    }

    for (const format of formats) {
      await tx.workFormat.upsert({
        where: {
          workId_formatType: {
            workId: saved.id,
            formatType: format.formatType,
          },
        },
        update: format,
        create: { ...format, workId: saved.id },
      });
    }
  }
}

async function main(): Promise<void> {
  await seedRoles();
  await seedCategories();
  await seedPaymentProviders();
  await seedSettings();
  await seedCommissionRules();
  await seedDistributionTerms();
  const tenantId = await seedTenant();
  await seedCatalog(tenantId);

  const [categories, authors, works, formats] = await Promise.all([
    prisma.category.count(),
    prisma.author.count(),
    prisma.work.count(),
    prisma.workFormat.count(),
  ]);

  console.log(
    `Seed terminé : ${categories} catégories, ${authors} auteurs, ${works} œuvres, ${formats} formats.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Échec du seed :', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
