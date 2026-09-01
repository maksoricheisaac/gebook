/**
 * Formatage des valeurs affichées, en français.
 *
 * Les prix arrivent de l'API sous forme de chaînes décimales (`"5000.00"`) : Prisma
 * expose les `Decimal` ainsi pour qu'aucun arrondi de nombre flottant ne s'introduise
 * entre la base et l'écran. La conversion en nombre n'a lieu qu'ici, au moment de
 * l'affichage, et jamais dans un calcul.
 */

const LOCALE = "fr-FR";

/**
 * Prix en francs CFA. Le franc CFA n'a pas de subdivision d'usage : on n'affiche
 * donc aucune décimale, et le symbole reste « FCFA », comme sur toute la maquette.
 */
export function formatPrice(amount: string | number): string {
  const value = typeof amount === "string" ? Number(amount) : amount;

  if (!Number.isFinite(value)) {
    return "—";
  }

  return `${new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 0,
  }).format(value)} FCFA`;
}

/** Date longue : « 15 mars 2024 ». */
export function formatDate(date: string | Date): string {
  const value = typeof date === "string" ? new Date(date) : date;

  if (Number.isNaN(value.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

/** Date et heure, pour les historiques de commande et les journaux. */
export function formatDateTime(date: string | Date): string {
  const value = typeof date === "string" ? new Date(date) : date;

  if (Number.isNaN(value.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(value);
}

/** Nombre entier lisible : « 1 248 ». */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value);
}

/**
 * Libellés des formats d'achat. Les codes viennent de la base (`format_type`) et
 * restent en anglais ; l'utilisateur, lui, ne voit que du français.
 */
export const FORMAT_LABELS: Record<string, string> = {
  pdf: "Livre numérique",
  audio: "Livre audio",
  paper: "Livre imprimé",
};

export function formatTypeLabel(formatType: string): string {
  return FORMAT_LABELS[formatType] ?? formatType;
}

/** Libellés des modes de livraison. */
export const DELIVERY_LABELS: Record<string, string> = {
  digital_download: "Téléchargement immédiat",
  physical_delivery: "Livraison à domicile",
  pickup: "Retrait sur place",
};

export function deliveryTypeLabel(deliveryType: string): string {
  return DELIVERY_LABELS[deliveryType] ?? deliveryType;
}
