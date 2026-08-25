import Image from "next/image";

/**
 * Visuel du hero.
 *
 * Une illustration statique plutôt que la scène 3D précédente : un ordinateur
 * modeste ou une préférence « mouvement réduit » n'ont plus besoin d'être
 * détectés, puisqu'il n'y a plus rien à animer ni à charger en différé.
 */
export function HeroVisual() {
  return (
    <Image
      src="/illustrations/hero-books.svg"
      alt=""
      fill
      priority
      className="object-contain"
      sizes="(min-width: 1024px) 40rem, 0px"
    />
  );
}
