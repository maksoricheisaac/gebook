import type { NextConfig } from "next";

/*
 * Les couvertures et photos téléversées sont servies par l'API, mais elles
 * transitent par le relais `app/api/media/[...path]` : côté navigateur ce sont
 * donc des images de première partie, aux URL relatives.
 *
 * `remotePatterns` n'a plus lieu d'être — il autorisait `next/image` à charger
 * directement depuis l'origine de l'API, ce que la politique
 * `Cross-Origin-Resource-Policy` de celle-ci empêchait de toute façon.
 */
const nextConfig: NextConfig = {
  images: {
    // Les couvertures ont un rapport 2/3 : inutile de générer les très grandes
    // largeurs prévues par défaut pour des visuels pleine page.
    imageSizes: [96, 128, 176, 220, 256, 320, 384],
  },
};

export default nextConfig;
