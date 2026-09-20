import { Injectable } from '@nestjs/common';
import { createCanvas } from '@napi-rs/canvas';

/** Largeur cible d'une page rendue — assez pour une lecture confortable à
 * l'écran, très loin d'une qualité d'impression : c'est en soi une limite
 * naturelle contre le détournement (brief §6), en plus de l'absence de
 * bouton de téléchargement. */
const TARGET_PAGE_WIDTH = 1000;

export interface RasterizedPage {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Rendu PDF → image, isolé dans son propre service : le reste de
 * l'application ne connaît que « donne-moi le nombre de pages » et
 * « rends-moi la page N », jamais `pdfjs-dist`/`@napi-rs/canvas` directement.
 * Aucun binaire système requis (contrairement à Poppler/MuPDF) — les deux
 * dépendances sont pures JS/N-API avec binaires précompilés.
 */
@Injectable()
export class PdfRasterizerService {
  async pageCount(pdfBuffer: Buffer): Promise<number> {
    const pdfjsLib = await importPdfjs();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
    });
    try {
      const doc = await loadingTask.promise;
      return doc.numPages;
    } finally {
      await loadingTask.destroy();
    }
  }

  /**
   * Rend une page en WebP. `pageNumber` est en base 1 (comme dans le reste de
   * l'API et de l'UI — jamais un index base 0 qui finit par se mélanger).
   */
  async renderPage(
    pdfBuffer: Buffer,
    pageNumber: number,
  ): Promise<RasterizedPage> {
    const pdfjsLib = await importPdfjs();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
    });

    try {
      const doc = await loadingTask.promise;
      const page = await doc.getPage(pageNumber);
      const nativeViewport = page.getViewport({ scale: 1 });
      const scale = TARGET_PAGE_WIDTH / nativeViewport.width;
      const viewport = page.getViewport({ scale });

      const canvas = createCanvas(
        Math.round(viewport.width),
        Math.round(viewport.height),
      );
      const context = canvas.getContext('2d');

      await page.render({
        // `@napi-rs/canvas` implémente l'API Canvas 2D — pdfjs-dist ne
        // distingue pas son origine, seulement l'interface. `canvas: null` :
        // usage « legacy » documenté par pdfjs-dist, le contexte seul suffit.
        canvas: null,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;

      const buffer = await canvas.encode('webp');

      return {
        buffer,
        width: canvas.width,
        height: canvas.height,
      };
    } finally {
      await loadingTask.destroy();
    }
  }
}

/**
 * `pdfjs-dist` (build « legacy », sans worker séparé — on est déjà dans un
 * processus Node isolé du thread HTTP par l'`await`) n'expose qu'un module ES
 * — l'import dynamique reste compatible avec la sortie CommonJS de Nest.
 * Mémorisé après le premier appel — réimporter à chaque page ne coûterait
 * presque rien en production (le module reste en cache Node de toute façon),
 * mais s'est révélé instable dans l'environnement de test Jest (workers ESM
 * `--experimental-vm-modules`) une fois le module déjà chargé une première
 * fois.
 */
let pdfjsPromise: ReturnType<typeof loadPdfjs> | null = null;

function importPdfjs() {
  pdfjsPromise ??= loadPdfjs();
  return pdfjsPromise;
}

function loadPdfjs() {
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}
