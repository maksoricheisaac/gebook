import type { Area } from "react-easy-crop";

/**
 * Une couverture ne s'affiche jamais plus large que quelques centaines de
 * pixels (`aspect-2/3` dans `work-editor.tsx`/`book-cover.tsx`) : au-delà,
 * chaque pixel supplémentaire alourdit l'envoi et le scan antivirus sans
 * rien ajouter à l'affichage. Une photo de téléphone moderne (3000-4000 px
 * de large) rognée sans plafond produisait un JPEG de plusieurs Mo — c'était
 * l'essentiel du temps d'attente perçu, pas le rognage lui-même (un simple
 * dessin sur canvas, de l'ordre de quelques dizaines de millisecondes).
 */
const MAX_OUTPUT_WIDTH = 1000;

/**
 * Découpe `imageSrc` selon `crop` (en pixels, tel que renvoyé par
 * `react-easy-crop`), la redimensionne si nécessaire, et renvoie le résultat
 * en JPEG.
 *
 * JPEG systématiquement, quel que soit le format d'origine (PNG, WebP) :
 * une couverture n'a jamais besoin de transparence, et `UploadValidatorService`
 * (backend) accepte `image/jpeg` sans distinction. Réencoder ici évite aussi de
 * réexpédier un PNG bien plus lourd pour la même image.
 */
export async function getCroppedImageBlob(imageSrc: string, crop: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);

  // `Math.min(1, ...)` : jamais d'agrandissement d'une image déjà plus
  // petite que le plafond — seulement une réduction quand c'est utile.
  const scale = Math.min(1, MAX_OUTPUT_WIDTH / crop.width);
  const outputWidth = Math.round(crop.width * scale);
  const outputHeight = Math.round(crop.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

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
    outputWidth,
    outputHeight,
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
      0.85,
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
