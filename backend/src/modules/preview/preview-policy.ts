import type {
  TenantMemberRole,
  WorkStatus,
  WorkVisibility,
} from '../../generated/prisma/enums';
import { TENANT_CATALOG_WRITE_ROLES } from '../tenants/tenant-context';
import type { PreviewSettingsResponse } from '../settings/dto/preview-settings.dto';

export type PreviewMode = 'admin' | 'author' | 'owned' | 'reader' | 'public';

export interface PreviewPolicy {
  mode: PreviewMode;
  /** `null` = pas de plafond de pages consultables (borné malgré tout par le
   * nombre de pages réellement générées, `previewPageCount`). */
  maxPages: number | null;
  canNavigate: boolean;
  canFullscreen: boolean;
  /** Toujours `false` — la preview ne sert jamais le fichier original
   * (brief §5) ; télécharger un ouvrage possédé reste une action distincte
   * (`/library/:id/download`), hors du périmètre de ce composant. */
  canDownload: boolean;
  showWatermark: boolean;
  /** Toutes les formules disponibles de l'œuvre sont à 0 — aucune limite de
   * pages ne s'applique alors à un lecteur/visiteur (brief §10). */
  isFree: boolean;
  /** `true` quand un visiteur anonyme gagnerait plus de pages en se
   * connectant — pilote la CTA « Se connecter pour continuer ». */
  requiresAuth: boolean;
}

export interface WorkAccessInput {
  work: {
    status: WorkStatus;
    visibility: WorkVisibility;
    tenantId: string;
    authorId: string;
  };
  /** `null` : personne n'est connecté. */
  user: { id: string; roles: string[] } | null;
  /** Profil auteur de CETTE œuvre, si l'utilisateur en a un. */
  isPenNameAuthor: boolean;
  /** Rôle de l'utilisateur dans le tenant de l'œuvre, s'il en est membre. */
  tenantRole: TenantMemberRole | null;
  /** Un droit de bibliothèque actif existe pour cette œuvre (achat). */
  hasLibraryAccess: boolean;
  /** Toutes les formules disponibles de l'œuvre sont gratuites. */
  isFree: boolean;
  settings: PreviewSettingsResponse;
}

/** Une œuvre non publiée / non visible publiquement ne l'est que pour son
 * équipe (auteur, éditeur, admin/owner du tenant) ou un platform_admin —
 * jamais un lecteur ou un visiteur ordinaire, quel que soit son état de
 * connexion (règle n° 3, étendue à la preview). */
function isPubliclyVisible(work: WorkAccessInput['work']): boolean {
  return work.status === 'published' && work.visibility !== 'private';
}

/**
 * Point d'entrée unique de la politique de preview — jamais un
 * `if (user.role === 'AUTHOR')` dispersé ailleurs (brief §13). Pure et
 * synchrone : toutes les données d'accès (appartenance, achat, prix) sont déjà
 * résolues par l'appelant (`PreviewPolicyService`), qui seul touche la base.
 *
 * Renvoie `null` quand l'œuvre n'est simplement pas consultable par ce
 * visiteur — l'appelant traduit ça en 404, jamais en détail sur la raison
 * (brief §18, aucune fuite d'existence d'une œuvre privée).
 */
export function resolvePreviewPolicy(
  input: WorkAccessInput,
): PreviewPolicy | null {
  const {
    user,
    isPenNameAuthor,
    tenantRole,
    hasLibraryAccess,
    isFree,
    settings,
  } = input;

  const isPlatformAdmin = user?.roles.includes('admin') ?? false;
  const isTenantStaff =
    tenantRole !== null && TENANT_CATALOG_WRITE_ROLES.includes(tenantRole);

  if (isPlatformAdmin) {
    return fullAccessPolicy('admin', isFree);
  }

  if (isPenNameAuthor || isTenantStaff) {
    return fullAccessPolicy('author', isFree);
  }

  // Au-delà de ce point, seule une œuvre publiée et non privée existe pour ce
  // visiteur — jamais un brouillon ni une œuvre `private` d'un autre tenant.
  if (!isPubliclyVisible(input.work)) {
    return null;
  }

  if (hasLibraryAccess) {
    return fullAccessPolicy('owned', isFree);
  }

  if (!settings.enabled) {
    // Preview désactivée globalement : seuls les rôles déjà traités plus
    // haut (admin/auteur/équipe/acheteur) continuent d'y avoir accès.
    return null;
  }

  if (user) {
    return {
      mode: 'reader',
      maxPages: isFree ? null : settings.maxPagesReader,
      canNavigate: true,
      canFullscreen: false,
      canDownload: false,
      showWatermark: !isFree && settings.watermarkEnabled,
      isFree,
      requiresAuth: false,
    };
  }

  return {
    mode: 'public',
    maxPages: isFree ? null : settings.maxPagesPublic,
    canNavigate: true,
    canFullscreen: false,
    canDownload: false,
    showWatermark: !isFree && settings.watermarkEnabled,
    isFree,
    // Un visiteur anonyme gagnerait plus de pages (le plafond lecteur) en se
    // connectant, sauf pour une œuvre déjà gratuite (déjà illimitée).
    requiresAuth: !isFree && settings.maxPagesReader > settings.maxPagesPublic,
  };
}

function fullAccessPolicy(
  mode: 'admin' | 'author' | 'owned',
  isFree: boolean,
): PreviewPolicy {
  return {
    mode,
    maxPages: null,
    canNavigate: true,
    canFullscreen: true,
    canDownload: false,
    showWatermark: false,
    isFree,
    requiresAuth: false,
  };
}
