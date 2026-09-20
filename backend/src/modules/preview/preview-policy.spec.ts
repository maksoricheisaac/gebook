import { resolvePreviewPolicy, type WorkAccessInput } from './preview-policy';
import type { PreviewSettingsResponse } from '../settings/dto/preview-settings.dto';

const SETTINGS: PreviewSettingsResponse = {
  enabled: true,
  maxPagesPublic: 3,
  maxPagesReader: 5,
  watermarkEnabled: true,
  maxRenderPages: 60,
};

const PUBLISHED_PUBLIC = {
  status: 'published',
  visibility: 'public',
  tenantId: 'tenant-a',
  authorId: 'author-a',
} as const;

const DRAFT_PRIVATE = {
  status: 'draft',
  visibility: 'private',
  tenantId: 'tenant-a',
  authorId: 'author-a',
} as const;

function baseInput(overrides: Partial<WorkAccessInput> = {}): WorkAccessInput {
  return {
    work: PUBLISHED_PUBLIC,
    user: null,
    isPenNameAuthor: false,
    tenantRole: null,
    hasLibraryAccess: false,
    isFree: false,
    settings: SETTINGS,
    ...overrides,
  };
}

/**
 * Politique de la Book Preview Sandbox — vérifiée en isolation, sans base de
 * données ni HTTP (complémentaire de `test/preview.e2e-spec.ts`, qui prouve
 * que le pipeline réel — rendu PDF compris — produit bien ces décisions).
 */
describe('resolvePreviewPolicy', () => {
  describe('Visiteur', () => {
    it('voit le nombre de pages public configuré', () => {
      const policy = resolvePreviewPolicy(baseInput());
      expect(policy).toMatchObject({
        mode: 'public',
        maxPages: 3,
        canFullscreen: false,
        canDownload: false,
        showWatermark: true,
      });
    });

    it('ne voit jamais une œuvre non publiée ni non publique', () => {
      const policy = resolvePreviewPolicy(baseInput({ work: DRAFT_PRIVATE }));
      expect(policy).toBeNull();
    });

    it('signale qu’il gagnerait plus de pages en se connectant', () => {
      const policy = resolvePreviewPolicy(baseInput());
      expect(policy?.requiresAuth).toBe(true);
    });

    it('n’a aucune limite sur une œuvre gratuite', () => {
      const policy = resolvePreviewPolicy(baseInput({ isFree: true }));
      expect(policy).toMatchObject({ maxPages: null, showWatermark: false });
    });

    it('la preview désactivée globalement lui refuse tout accès', () => {
      const policy = resolvePreviewPolicy(
        baseInput({ settings: { ...SETTINGS, enabled: false } }),
      );
      expect(policy).toBeNull();
    });
  });

  describe('Lecteur connecté sans achat', () => {
    const user = { id: 'user-1', roles: ['reader'] };

    it('voit le nombre de pages configuré pour un lecteur', () => {
      const policy = resolvePreviewPolicy(baseInput({ user }));
      expect(policy).toMatchObject({ mode: 'reader', maxPages: 5 });
    });

    it('accède au livre complet s’il possède les droits (achat)', () => {
      const policy = resolvePreviewPolicy(
        baseInput({ user, hasLibraryAccess: true }),
      );
      expect(policy).toMatchObject({
        mode: 'owned',
        maxPages: null,
        canFullscreen: true,
        showWatermark: false,
      });
    });

    it('un membre d’un autre tenant reste un simple lecteur', () => {
      const policy = resolvePreviewPolicy(
        baseInput({ user, tenantRole: null }),
      );
      expect(policy?.mode).toBe('reader');
    });
  });

  describe('Auteur / équipe éditoriale', () => {
    const authorUser = { id: 'author-user', roles: ['reader'] };

    it('peut prévisualiser sa propre œuvre sans limite', () => {
      const policy = resolvePreviewPolicy(
        baseInput({ user: authorUser, isPenNameAuthor: true }),
      );
      expect(policy).toMatchObject({
        mode: 'author',
        maxPages: null,
        canFullscreen: true,
        canDownload: false,
      });
    });

    it('peut prévisualiser une œuvre de son tenant même non publiée, via son rôle d’équipe', () => {
      const policy = resolvePreviewPolicy(
        baseInput({
          work: DRAFT_PRIVATE,
          user: { id: 'editeur', roles: ['reader'] },
          tenantRole: 'editor',
        }),
      );
      expect(policy?.mode).toBe('author');
    });

    it('ne peut pas accéder à l’œuvre privée d’un autre tenant', () => {
      const policy = resolvePreviewPolicy(
        baseInput({
          work: DRAFT_PRIVATE,
          user: { id: 'autre-tenant', roles: ['reader'] },
          tenantRole: null,
          isPenNameAuthor: false,
        }),
      );
      expect(policy).toBeNull();
    });

    it('un simple rôle "viewer"/"marketing" du tenant ne donne pas l’accès équipe', () => {
      const policy = resolvePreviewPolicy(
        baseInput({
          work: DRAFT_PRIVATE,
          user: { id: 'marketing', roles: ['reader'] },
          tenantRole: 'marketing',
        }),
      );
      expect(policy).toBeNull();
    });
  });

  describe('Administrateur plateforme', () => {
    it('accède à n’importe quelle œuvre, y compris privée, sans limite', () => {
      const policy = resolvePreviewPolicy(
        baseInput({
          work: DRAFT_PRIVATE,
          user: { id: 'admin', roles: ['admin'] },
        }),
      );
      expect(policy).toMatchObject({
        mode: 'admin',
        maxPages: null,
        canFullscreen: true,
        canDownload: false,
      });
    });
  });

  describe('Sécurité', () => {
    it('canDownload est toujours faux, quel que soit le mode', () => {
      const modes: WorkAccessInput[] = [
        baseInput(),
        baseInput({ user: { id: 'u', roles: ['reader'] } }),
        baseInput({
          user: { id: 'u', roles: ['reader'] },
          isPenNameAuthor: true,
        }),
        baseInput({ user: { id: 'u', roles: ['admin'] } }),
      ];
      for (const input of modes) {
        expect(resolvePreviewPolicy(input)?.canDownload).toBe(false);
      }
    });
  });
});
