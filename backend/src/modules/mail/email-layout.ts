/**
 * Gabarit visuel commun à tous les e-mails transactionnels (vérification,
 * OTP à venir…), pour que chaque envoi respire la même identité que le site
 * plutôt qu'un texte brut sans lien avec la marque.
 *
 * Contrainte propre à l'e-mail, pas au web : aucune feuille de style externe
 * ni classe utilitaire, uniquement des styles en ligne et une mise en page en
 * `<table>` — la plupart des clients mail (Outlook en tête) ignorent le CSS
 * moderne et le flexbox/grid. Les couleurs reprennent celles du site
 * (`frontend/app/globals.css` : vert `leaf-700`, encre `ink-800/900`, or
 * `gold-400/600`, papier `paper-50/100`) pour rester reconnaissables d'un
 * coup d'œil, sans dépendre d'une police distante que les clients mail
 * bloquent presque systématiquement.
 */

const COLORS = {
  paperBackground: '#f8f6f0',
  paperCard: '#fdfcf9',
  border: '#e6e0d4',
  ink900: '#04182f',
  ink800: '#07264a',
  inkMuted: '#5b6b7c',
  leaf700: '#05603a',
  leaf600: '#077a46',
  gold400: '#f6b51d',
} as const;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface EmailLayoutOptions {
  /** Texte d'aperçu, visible dans la liste des messages avant ouverture — jamais dans le corps affiché. */
  previewText: string;
  heading: string;
  /** Paragraphes déjà échappés (voir `escapeHtml` dans les appelants) — un par élément. */
  paragraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
  /** Note secondaire sous le bouton (durée de validité, mise en garde…). */
  footnote?: string;
  /** URL absolue du logo — construite par l'appelant à partir d'`APP_PUBLIC_URL`. */
  logoUrl: string;
}

export function renderEmailLayout(options: EmailLayoutOptions): string {
  const {
    previewText,
    heading,
    paragraphs,
    ctaLabel,
    ctaUrl,
    footnote,
    logoUrl,
  } = options;

  const paragraphsHtml = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${COLORS.ink800};">${paragraph}</p>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeAttribute(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${COLORS.paperBackground};font-family:${FONT_STACK};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeAttribute(previewText)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.paperBackground};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:${COLORS.paperCard};border:1px solid ${COLORS.border};border-radius:12px;overflow:hidden;">
            <tr>
              <td style="height:4px;background-color:${COLORS.gold400};line-height:4px;font-size:4px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:32px 40px 8px;">
                <img src="${logoUrl}" alt="GeBook" height="32" style="height:32px;width:auto;display:block;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 8px;">
                <h1 style="margin:0 0 20px;font-size:21px;line-height:1.3;color:${COLORS.ink900};font-weight:700;">${escapeAttribute(heading)}</h1>
                ${paragraphsHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background-color:${COLORS.leaf700};">
                      <a href="${ctaUrl}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:${COLORS.leaf700};">${escapeAttribute(ctaLabel)}</a>
                    </td>
                  </tr>
                </table>
                ${footnote ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:${COLORS.inkMuted};">${footnote}</p>` : ''}
                <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:${COLORS.inkMuted};word-break:break-all;">
                  Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :<br />
                  <a href="${ctaUrl}" style="color:${COLORS.leaf600};">${ctaUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px;border-top:1px solid ${COLORS.border};">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${COLORS.inkMuted};">
                  GeBook — la plateforme qui publie, vend et fait rayonner vos œuvres.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Échappe les caractères sensibles en attribut/texte HTML — jamais de contenu
 * utilisateur (prénom, e-mail…) injecté tel quel dans un gabarit. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
