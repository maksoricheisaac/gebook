import Image from "next/image";
import Link from "next/link";

import { cn } from "@/src/lib/utils";

/*
 * Signature GeBook.
 *
 * Le logo fourni est un bloc-marque complet — symbole, nom et baseline
 * « Publiez. Vendez. Rayonnez. » — en quatre couleurs. Deux conséquences que le
 * code doit assumer plutôt que subir :
 *
 *   1. il ne s'inverse pas. La version précédente lui appliquait
 *      `brightness-0 invert` dans le pied de page, ce qui le réduisait à un
 *      rectangle blanc. Sur fond sombre, il est donc posé sur une plaque ivoire,
 *      comme on le ferait sur un imprimé ;
 *   2. il est large (rapport 3:1). En dessous de ~120 px, la baseline devient
 *      illisible : la hauteur minimale retenue est 40 px.
 */
export function Logo({
  variant = "light",
  className,
  priority = false,
}: {
  /** `light` : fond clair. `plaque` : fond sombre, logo posé sur une plaque. */
  variant?: "light" | "plaque";
  className?: string;
  priority?: boolean;
}) {
  const image = (
    <Image
      src="/logo_gebook.png"
      alt="GeBook"
      width={1476}
      height={487}
      priority={priority}
      className={cn("h-10 w-auto", className)}
    />
  );

  if (variant === "plaque") {
    return (
      <span className="bg-paper-50 inline-flex w-fit rounded-md px-3 py-2">{image}</span>
    );
  }

  return image;
}

/** Le logo, cliquable, tel qu'il apparaît dans l'en-tête et le pied de page. */
export function LogoLink({
  variant = "light",
  className,
  priority = false,
}: {
  variant?: "light" | "plaque";
  className?: string;
  priority?: boolean;
}) {
  return (
    <Link
      href="/"
      aria-label="GeBook — retour à l’accueil"
      className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      <Logo variant={variant} className={className} priority={priority} />
    </Link>
  );
}
