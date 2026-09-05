import { IsOptional, IsString, MaxLength } from 'class-validator';
import { LocaleQuery } from './locale.query';

/**
 * Paramètres de la liste publique d'auteurs. Étend `LocaleQuery` plutôt que
 * d'y ajouter `tenant` directement : `/categories` partage `LocaleQuery` et
 * n'a aucune notion de tenant (catégories = taxonomie globale de la
 * plateforme, jamais scopée).
 */
export class ListAuthorsQuery extends LocaleQuery {
  /** Slug de tenant (Phase 5, vitrine publique d'un espace). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tenant?: string;

  /** Recherche par nom de plume — insensible à la casse. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
