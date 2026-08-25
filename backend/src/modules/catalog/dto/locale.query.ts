import { IsEnum, IsOptional } from 'class-validator';
import { ContentLocale } from '../../../generated/prisma/enums';

/**
 * Langue du contenu éditorial demandé, sur les routes qui n'ont pas déjà leur
 * propre DTO de requête (`ListWorksQuery` porte le même champ pour `/works`).
 */
export class LocaleQuery {
  @IsOptional()
  @IsEnum(ContentLocale)
  locale: ContentLocale = ContentLocale.fr;
}
