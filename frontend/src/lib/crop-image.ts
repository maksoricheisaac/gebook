import type { Area } from "react-easy-crop";

/**
 * Découpe `imageSrc` selon `crop` (en pixels, tel que renvoyé par
 * `react-easy-crop`) et renvoie le résultat en JPEG.
 *
 * JPEG systématiquement, quel que soit le format d'origine (PNG, WebP) :
 * une couverture n'a jamais besoin de transparence, et `UploadValidatorService`
 * (backend) accepte `image/jpeg` sans distinction. Réencoder ici évite aussi de
 * réexpédier un PNG bien plus lourd pour la même image.
 */
export async function getCroppedImageBlob(imageSrc: string, crop: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(crop.width);
  canvas.height = Math.round(crop.height);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Le navigateur ne permet pas de rogner cette image.");
  }

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Le rognage de l’image a échoué."));
        }
      },
      "image/jpeg",
      0.92,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Image illisible.")));
    image.src = src;
  });
}
