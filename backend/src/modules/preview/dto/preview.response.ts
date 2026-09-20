import type { PreviewMode } from '../preview-policy';

export interface PreviewPageResponse {
  page: number;
  url: string;
}

export interface PreviewResponse {
  book: {
    id: string;
    title: string;
    author: string;
    cover: string | null;
    slug: string;
  };
  preview: {
    mode: PreviewMode;
    /** `pending`/`failed`/`none` : aucune page à afficher pour l'instant —
     * le frontend distingue « patiente » de « ne sera jamais disponible ». */
    status: 'ready' | 'pending' | 'failed' | 'none';
    maxPages: number | null;
    totalPages: number;
    canNavigate: boolean;
    canFullscreen: boolean;
    canDownload: boolean;
    watermark: boolean;
    isFree: boolean;
    requiresAuth: boolean;
  };
  pages: PreviewPageResponse[];
}
