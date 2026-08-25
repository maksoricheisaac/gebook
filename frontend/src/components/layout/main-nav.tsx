"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActivePath, MAIN_NAVIGATION } from "./navigation";
import { cn } from "@/src/lib/utils";

/*
 * Navigation principale, sur grand écran.
 *
 * Composant client pour une seule raison : marquer le lien de la section
 * courante. C'est ce qui manquait — aucune page n'indiquait où l'on se trouvait,
 * ni visuellement ni pour un lecteur d'écran.
 *
 * Le marquage passe par `aria-current="page"`, et le soulignement doré n'est que
 * la traduction visuelle de cet attribut : les deux ne peuvent pas diverger.
 */
export function MainNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigation principale" className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {MAIN_NAVIGATION.map((item) => {
          const active = isActivePath(pathname, item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-10 items-center rounded-md px-3 text-sm font-medium",
                  "transition-colors duration-[--duration-fast]",
                  "after:absolute after:inset-x-3 after:bottom-1.5 after:h-px after:origin-left after:scale-x-0 after:bg-accent after:transition-transform after:duration-[--duration-base] after:ease-[--ease-out]",
                  "hover:after:scale-x-100",
                  active
                    ? "text-secondary after:scale-x-100"
                    : "text-muted-foreground hover:text-secondary",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
