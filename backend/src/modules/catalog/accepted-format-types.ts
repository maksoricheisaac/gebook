import { FormatType } from '../../generated/prisma/enums';

/**
 * Formats réellement proposables aujourd'hui — distinct de `FormatType` (le
 * schéma Prisma), qui garde `epub` pour rester réversible sans migration le
 * jour où EPUB revient, et pour ne jamais invalider une ligne déjà en base.
 *
 * Décision produit (2026-09) : « PDF d'abord » — EPUB n'apparaît plus nulle
 * part côté utilisateur (création de format, filtre du catalogue public,
 * messages d'erreur). Utilisé partout où un format doit être *accepté en
 * écriture ou en filtre*, jamais pour lire une œuvre déjà en base — une
 * œuvre existante en EPUB reste lisible et achetable telle quelle.
 */
export const ACCEPTED_FORMAT_TYPES: readonly FormatType[] = [
  FormatType.pdf,
  FormatType.audio,
  FormatType.paper,
];
