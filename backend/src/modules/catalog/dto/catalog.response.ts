import type { Prisma } from '../../../generated/prisma/client';
import { ContentLocale } from '../../../generated/prisma/enums';

/**
 * Ce que l'API expose réellement du catalogue.
 *
 * Ces types ne sont pas ceux de Prisma : ils sont écrits à la main, champ par champ.
 * C'est volontaire, et c'est la garantie qu'aucune colonne interne ne sorte par
 * accident — `storagePath` en tête, dont la divulgation ruinerait la protection des
 * livres achetés. Un champ ajouté au schéma n'apparaît dans l'API que si quelqu'un
 * l'ajoute ici, en connaissance de cause.
 *
 * Les montants restent des chaînes décimales : les convertir en nombre flottant
 * introduirait des arrondis dans une valeur d'argent.
 *
 * Le contenu bilingue (titre, description, biographie, nom de catégorie…) est résolu
 * ici, une seule fois : la forme des réponses reste des chaînes simples (`title:
 * string`), jamais un objet `{fr, en}` — la locale est déjà tranchée côté serveur.
 */

export interface CategoryResponse {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** Nombre d'œuvres publiées, pour afficher les filtres sans requête supplémentaire. */
  workCount?: number;
}

export interface AuthorSummaryResponse {
  id: string;
  slug: string;
  penName: string;
  shortBiography: string | null;
  photoPath: string | null;
  country: string | null;
  city: string | null;
  workCount?: number;
}

export interface AuthorDetailResponse extends AuthorSummaryResponse {
  biography: string | null;
}

export interface WorkFormatResponse {
  id: string;
  formatType: string;
  label: string | null;
  price: string;
  currency: string;
  deliveryType: string;
  isAvailable: boolean;
}

export interface WorkSummaryResponse {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  shortDescription: string | null;
  coverPath: string | null;
  language: string;
  pageCount: number | null;
  publicationYear: number | null;
  featured: boolean;
  publishedAt: string | null;
  author: Pick<AuthorSummaryResponse, 'id' | 'slug' | 'penName'>;
  category: Pick<CategoryResponse, 'id' | 'slug' | 'name'> | null;
  /** Tenant vendeur — nécessaire pour grouper le panier par vendeur (mission panier multi-tenant). */
  tenant: { slug: string; name: string };
  formats: WorkFormatResponse[];
  /** Prix le plus bas parmi les formats disponibles, pour l'affichage « à partir de ». */
  priceFrom: string | null;
}

export interface WorkDetailResponse extends WorkSummaryResponse {
  description: string | null;
  tableOfContents: string | null;
  isbn: string | null;
  edition: string | null;
  publicationDate: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Locales à charger pour résoudre un champ traduisible : la locale demandée, puis
 * `fr` en repli. `fr` seul si c'est justement la locale demandée, pour ne pas
 * doubler inutilement la requête.
 */
export function translationLocales(locale: ContentLocale): ContentLocale[] {
  return locale === ContentLocale.fr
    ? [ContentLocale.fr]
    : [locale, ContentLocale.fr];
}

interface WorkTranslationRow {
  locale: ContentLocale;
  title: string;
  subtitle: string | null;
  shortDescription: string | null;
}

interface WorkTranslationDetailRow extends WorkTranslationRow {
  description: string | null;
  tableOfContents: string | null;
}

interface AuthorTranslationRow {
  locale: ContentLocale;
  shortBiography: string | null;
}

interface AuthorTranslationDetailRow extends AuthorTranslationRow {
  biography: string | null;
}

interface CategoryTranslationRow {
  locale: ContentLocale;
  name: string;
  description: string | null;
}

/**
 * Résolution par champ, pas par ligne entière : un titre déjà traduit peut
 * cohabiter avec une description encore en français, tant que l'anglais n'est
 * pas complet. `fr` existe toujours (backfill de la migration + saisie
 * obligatoire à la création), donc `title`/`name` ne sont vides que dans un cas
 * qui ne devrait jamais se produire en pratique.
 */
function resolveWorkFields(
  translations: WorkTranslationRow[],
  requested: ContentLocale,
): Pick<WorkSummaryResponse, 'title' | 'subtitle' | 'shortDescription'> {
  const requestedRow = translations.find((t) => t.locale === requested);
  const frRow = translations.find((t) => t.locale === ContentLocale.fr);

  return {
    title: requestedRow?.title ?? frRow?.title ?? '',
    subtitle: requestedRow?.subtitle ?? frRow?.subtitle ?? null,
    shortDescription:
      requestedRow?.shortDescription ?? frRow?.shortDescription ?? null,
  };
}

function resolveWorkDetailFields(
  translations: WorkTranslationDetailRow[],
  requested: ContentLocale,
): Pick<WorkDetailResponse, 'description' | 'tableOfContents'> {
  const requestedRow = translations.find((t) => t.locale === requested);
  const frRow = translations.find((t) => t.locale === ContentLocale.fr);

  return {
    description: requestedRow?.description ?? frRow?.description ?? null,
    tableOfContents:
      requestedRow?.tableOfContents ?? frRow?.tableOfContents ?? null,
  };
}

function resolveAuthorFields(
  translations: AuthorTranslationRow[],
  requested: ContentLocale,
): Pick<AuthorSummaryResponse, 'shortBiography'> {
  const requestedRow = translations.find((t) => t.locale === requested);
  const frRow = translations.find((t) => t.locale === ContentLocale.fr);

  return {
    shortBiography:
      requestedRow?.shortBiography ?? frRow?.shortBiography ?? null,
  };
}

function resolveAuthorDetailFields(
  translations: AuthorTranslationDetailRow[],
  requested: ContentLocale,
): Pick<AuthorDetailResponse, 'biography'> {
  const requestedRow = translations.find((t) => t.locale === requested);
  const frRow = translations.find((t) => t.locale === ContentLocale.fr);

  return {
    biography: requestedRow?.biography ?? frRow?.biography ?? null,
  };
}

function resolveCategoryFields(
  translations: CategoryTranslationRow[],
  requested: ContentLocale,
): Pick<CategoryResponse, 'name' | 'description'> {
  const requestedRow = translations.find((t) => t.locale === requested);
  const frRow = translations.find((t) => t.locale === ContentLocale.fr);

  return {
    name: requestedRow?.name ?? frRow?.name ?? '',
    description: requestedRow?.description ?? frRow?.description ?? null,
  };
}

/**
 * Version allégée de `resolveCategoryFields`, pour la catégorie imbriquée dans
 * une réponse `Work` : seul le nom y est exposé (`WorkSummaryResponse.category`
 * n'a pas de `description`), donc la sélection Prisma correspondante ne charge
 * pas ce champ.
 */
function resolveCategoryName(
  translations: Pick<CategoryTranslationRow, 'locale' | 'name'>[],
  requested: ContentLocale,
): string {
  const requestedRow = translations.find((t) => t.locale === requested);
  const frRow = translations.find((t) => t.locale === ContentLocale.fr);

  return requestedRow?.name ?? frRow?.name ?? '';
}

/**
 * Sélection Prisma partagée par la liste et le détail. La déclarer une seule fois
 * évite qu'une des deux routes se mette un jour à exposer un champ que l'autre cache.
 *
 * Fonction plutôt que constante, depuis l'introduction du contenu bilingue (Phase 1
 * "bilinguisme") : la locale décide quelles lignes de `translations` charger.
 */
export function buildWorkSelection(locale: ContentLocale) {
  return {
    id: true,
    slug: true,
    coverPath: true,
    language: true,
    pageCount: true,
    publicationYear: true,
    featured: true,
    publishedAt: true,
    author: { select: { id: true, slug: true, penName: true } },
    tenant: { select: { slug: true, name: true } },
    category: {
      select: {
        id: true,
        slug: true,
        translations: {
          where: { locale: { in: translationLocales(locale) } },
          select: { locale: true, name: true },
        },
      },
    },
    formats: {
      select: {
        id: true,
        formatType: true,
        label: true,
        price: true,
        currency: true,
        deliveryType: true,
        isAvailable: true,
      },
      orderBy: { price: 'asc' },
    },
    translations: {
      where: { locale: { in: translationLocales(locale) } },
      select: {
        locale: true,
        title: true,
        subtitle: true,
        shortDescription: true,
      },
    },
  } satisfies Prisma.WorkSelect;
}

export function buildWorkDetailSelection(locale: ContentLocale) {
  return {
    ...buildWorkSelection(locale),
    isbn: true,
    edition: true,
    publicationDate: true,
    translations: {
      where: { locale: { in: translationLocales(locale) } },
      select: {
        locale: true,
        title: true,
        subtitle: true,
        shortDescription: true,
        description: true,
        tableOfContents: true,
      },
    },
  } satisfies Prisma.WorkSelect;
}

type SelectedWork = Prisma.WorkGetPayload<{
  select: ReturnType<typeof buildWorkSelection>;
}>;
type SelectedWorkDetail = Prisma.WorkGetPayload<{
  select: ReturnType<typeof buildWorkDetailSelection>;
}>;

export function toWorkSummary(
  work: SelectedWork,
  locale: ContentLocale,
): WorkSummaryResponse {
  const formats = work.formats.map((format): WorkFormatResponse => ({
    id: format.id,
    formatType: format.formatType,
    label: format.label,
    price: format.price.toFixed(2),
    currency: format.currency,
    deliveryType: format.deliveryType,
    isAvailable: format.isAvailable,
  }));

  const cheapest = formats.find((format) => format.isAvailable);
  const { title, subtitle, shortDescription } = resolveWorkFields(
    work.translations,
    locale,
  );

  return {
    id: work.id,
    slug: work.slug,
    title,
    subtitle,
    shortDescription,
    coverPath: work.coverPath,
    language: work.language,
    pageCount: work.pageCount,
    publicationYear: work.publicationYear,
    featured: work.featured,
    publishedAt: work.publishedAt?.toISOString() ?? null,
    author: work.author,
    tenant: work.tenant,
    category: work.category
      ? {
          id: work.category.id,
          slug: work.category.slug,
          name: resolveCategoryName(work.category.translations, locale),
        }
      : null,
    formats,
    // Les formats sont déjà triés par prix croissant côté base.
    priceFrom: cheapest?.price ?? null,
  };
}

export function toWorkDetail(
  work: SelectedWorkDetail,
  locale: ContentLocale,
): WorkDetailResponse {
  return {
    ...toWorkSummary(work, locale),
    ...resolveWorkDetailFields(work.translations, locale),
    isbn: work.isbn,
    edition: work.edition,
    publicationDate: work.publicationDate?.toISOString() ?? null,
  };
}

export function buildAuthorSelection(locale: ContentLocale) {
  return {
    id: true,
    slug: true,
    penName: true,
    photoPath: true,
    country: true,
    city: true,
    translations: {
      where: { locale: { in: translationLocales(locale) } },
      select: { locale: true, shortBiography: true },
    },
  } satisfies Prisma.AuthorSelect;
}

export function buildAuthorDetailSelection(locale: ContentLocale) {
  return {
    ...buildAuthorSelection(locale),
    translations: {
      where: { locale: { in: translationLocales(locale) } },
      select: { locale: true, shortBiography: true, biography: true },
    },
  } satisfies Prisma.AuthorSelect;
}

type SelectedAuthor = Prisma.AuthorGetPayload<{
  select: ReturnType<typeof buildAuthorSelection>;
}>;
type SelectedAuthorDetail = Prisma.AuthorGetPayload<{
  select: ReturnType<typeof buildAuthorDetailSelection>;
}>;

export function toAuthorSummary(
  author: SelectedAuthor,
  locale: ContentLocale,
  workCount: number,
): AuthorSummaryResponse {
  return {
    id: author.id,
    slug: author.slug,
    penName: author.penName,
    photoPath: author.photoPath,
    country: author.country,
    city: author.city,
    ...resolveAuthorFields(author.translations, locale),
    workCount,
  };
}

export function toAuthorDetail(
  author: SelectedAuthorDetail,
  locale: ContentLocale,
  workCount: number,
): AuthorDetailResponse {
  return {
    ...toAuthorSummary(author, locale, workCount),
    ...resolveAuthorDetailFields(author.translations, locale),
  };
}

export function buildCategorySelection(locale: ContentLocale) {
  return {
    id: true,
    slug: true,
    translations: {
      where: { locale: { in: translationLocales(locale) } },
      select: { locale: true, name: true, description: true },
    },
  } satisfies Prisma.CategorySelect;
}

type SelectedCategory = Prisma.CategoryGetPayload<{
  select: ReturnType<typeof buildCategorySelection>;
}>;

export function toCategoryResponse(
  category: SelectedCategory,
  locale: ContentLocale,
  workCount: number,
): CategoryResponse {
  return {
    id: category.id,
    slug: category.slug,
    ...resolveCategoryFields(category.translations, locale),
    workCount,
  };
}
