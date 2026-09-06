/**
 * Données de référence de GeBook — plateforme uniquement, jamais de tenant.
 *
 * Ce fichier est le **seul** endroit où vivent des données de référence : ni les
 * contrôleurs, ni les composants ne doivent en contenir. Il pose ce dont l'application
 * a besoin pour fonctionner (rôles, catégories, prestataires de paiement, réglages,
 * règle de commission générale, conditions de distribution) — jamais de tenant, jamais
 * d'auteur, jamais d'œuvre : un tenant est une organisation réelle, créée en
 * libre-service par un utilisateur authentifié (`POST /tenants`), pas une donnée de
 * démonstration à semer.
 *
 * Le seed est idempotent : chaque écriture passe par un `upsert` sur une clé unique
 * métier, il peut donc être relancé sans dupliquer ni casser quoi que ce soit.
 *
 * Aucun compte utilisateur n'est créé, conformément au choix d'origine documenté dans
 * `database/README.md`.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  CalculationBase,
  CommissionType,
  ContentLocale,
  ProviderEnvironment,
  ProviderStatus,
  SettingValueType,
  TenantType,
} from '../src/generated/prisma/enums';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Date de référence des données historiques, reprise de `database/seed.sql`. */
const REFERENCE_DATE = new Date('2026-07-21T23:09:25Z');

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

async function main(): Promise<void> {
  await seedRoles();
  await seedCategories();
  await seedPaymentProviders();
  await seedSettings();
  await seedCommissionRules();
  await seedDistributionTerms();

  const categories = await prisma.category.count();

  console.log(`Seed terminé : ${categories} catégories de référence.`);
}

main()
  .catch((error: unknown) => {
    console.error('Échec du seed :', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
