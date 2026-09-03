import { apiFetch } from "./api";

/*
 * Types et appels du catalogue.
 *
 * Ces types décrivent ce que l'API renvoie réellement. Ils sont écrits ici plutôt
 * que partagés depuis le backend : tant qu'il n'y a qu'un point de contact, un
 * paquet partagé coûterait plus qu'il ne rapporte. Le jour où l'authentification
 * et les commandes multiplieront les contrats, `packages/shared` aura un vrai motif
 * d'exister.
 */

export interface WorkFormat {
  id: string;
  formatType: string;
  label: string | null;
  /** Chaîne décimale : aucun arrondi flottant entre la base et l'écran. */
  price: string;
  currency: string;
  deliveryType: string;
  isAvailable: boolean;
}

export interface WorkSummary {
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
  author: { id: string; slug: string; penName: string };
  tenant: { slug: string; name: string };
  category: { id: string; slug: string; name: string } | null;
  formats: WorkFormat[];
  priceFrom: string | null;
}

export interface WorkDetail extends WorkSummary {
  description: string | null;
  tableOfContents: string | null;
  isbn: string | null;
  edition: string | null;
  publicationDate: string | null;
}

export interface AuthorSummary {
  id: string;
  slug: string;
  penName: string;
  shortBiography: string | null;
  photoPath: string | null;
  country: string | null;
  city: string | null;
  workCount: number;
}

export interface AuthorDetail extends AuthorSummary {
  biography: string | null;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  workCount: number;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export interface WorksFilters {
  q?: string;
  category?: string;
  author?: string;
  /** Slug de tenant (Phase 5, vitrine publique d'un espace). */
  tenant?: string;
  format?: string;
  featured?: boolean;
  page?: number;
  perPage?: number;
}

/**
 * Le catalogue public change rarement et doit rester rapide : une minute de cache
 * évite d'interroger l'API à chaque visite sans jamais retarder une publication de
 * plus d'une minute.
 */
const CATALOG_REVALIDATE = 60;

export function fetchWorks(filters: WorksFilters = {}): Promise<Paginated<WorkSummary>> {
  return apiFetch<Paginated<WorkSummary>>("/works", {
    query: { ...filters },
    revalidate: CATALOG_REVALIDATE,
  });
}

export function fetchWork(slug: string): Promise<WorkDetail> {
  return apiFetch<WorkDetail>(`/works/${encodeURIComponent(slug)}`, {
    revalidate: CATALOG_REVALIDATE,
  });
}

export function fetchAuthors(tenant?: string): Promise<AuthorSummary[]> {
  return apiFetch<AuthorSummary[]>("/authors", {
    query: tenant ? { tenant } : undefined,
    revalidate: CATALOG_REVALIDATE,
  });
}

export function fetchAuthor(slug: string): Promise<AuthorDetail> {
  return apiFetch<AuthorDetail>(`/authors/${encodeURIComponent(slug)}`, {
    revalidate: CATALOG_REVALIDATE,
  });
}

export function fetchCategories(): Promise<Category[]> {
  return apiFetch<Category[]>("/categories", { revalidate: CATALOG_REVALIDATE });
}

/**
 * Les formats d'achat.
 */
export const FORMAT_OPTIONS = [
  { value: "pdf", label: "PDF" },
  { value: "paper", label: "Papier" },
] as const;

export type FormatType = (typeof FORMAT_OPTIONS)[number]["value"];

export function isFormatType(value: string): value is FormatType {
  return FORMAT_OPTIONS.some((option) => option.value === value);
}

/** Initiales servant de vignette tant qu'aucune photo d'auteur n'est téléversée. */
export function authorInitials(penName: string): string {
  return penName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
