"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Image de couverture, avec repli si le fichier manque.
 *
 * Composant client pour une seule raison : `onError`. Un chemin de couverture
 * peut exister en base alors que le fichier a disparu du disque de l'API — et
 * dans ce cas le navigateur affiche l'icône d'image cassée, ce qui est pire que
 * l'absence de couverture. Ici, l'échec bascule sur la couverture composée,
 * exactement comme si aucun chemin n'avait été enregistré.
 */
export function CoverImage({
  src,
  sizes,
  priority,
  fallback,
}: {
  src: string;
  sizes: string;
  priority?: boolean;
  fallback: React.ReactNode;
}) {
  const [hasFailed, setHasFailed] = useState(false);

  if (hasFailed) {
    return <>{fallback}</>;
  }

  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      priority={priority}
      onError={() => setHasFailed(true)}
      className="object-cover"
    />
  );
}
