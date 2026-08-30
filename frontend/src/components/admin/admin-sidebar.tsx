"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookText,
  FolderTree,
  LayoutDashboard,
  Percent,
  ReceiptText,
  Settings,
  Users,
  UserSquare2,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { LogoLink } from "@/src/components/layout/logo";
import { TenantSwitcher } from "@/src/components/layout/tenant-switcher";
import { useTenant } from "@/src/components/providers/tenant-provider";
import { cn } from "@/src/lib/utils";

/** Aligné sur `TENANT_FINANCE_ROLES` côté API (policy RLS `sale_distributions_select`). */
const FINANCE_ROLES = ["owner", "admin", "finance"];

/** Les deux seuls regroupements de contenu : au-delà, un intitulé de plus par entrée n'aiderait plus à s'orienter. */
type AdminNavGroup = "Catalogue" | "Opérations";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Le tableau de bord ne doit pas s'allumer sur ses sous-sections. */
  exact?: boolean;
  /** Ressource plateforme (catégories, commandes…) : invisible pour un simple membre de tenant. */
  platformOnly?: boolean;
  /** Tableau de bord de tenant : visible aussi pour owner/admin/finance, pas seulement platform_admin. */
  financeOnly?: boolean;
  /** `undefined` = hors groupe (le tableau de bord, affiché seul en tête). */
  group?: AdminNavGroup;
}

const ADMIN_NAV: AdminNavItem[] = [
  {
    href: "/admin",
    label: "Tableau de bord",
    icon: LayoutDashboard,
    exact: true,
    platformOnly: true,
    financeOnly: true,
  },
  { href: "/admin/oeuvres", label: "Œuvres", icon: BookText, group: "Catalogue" },
  { href: "/admin/auteurs", label: "Auteurs", icon: UserSquare2, group: "Catalogue" },
  {
    href: "/admin/categories",
    label: "Catégories",
    icon: FolderTree,
    platformOnly: true,
    group: "Catalogue",
  },
  {
    href: "/admin/commandes",
    label: "Commandes",
    icon: ReceiptText,
    platformOnly: true,
    group: "Opérations",
  },
  {
    href: "/admin/paiements",
    label: "Paiements",
    icon: Wallet,
    platformOnly: true,
    group: "Opérations",
  },
  {
    href: "/admin/commissions",
    label: "Commissions",
    icon: Percent,
    platformOnly: true,
    group: "Opérations",
  },
  { href: "/admin/team", label: "Équipe", icon: Users, group: "Opérations" },
];

const NAV_GROUPS: AdminNavGroup[] = ["Catalogue", "Opérations"];

/** Séparé du reste : un réglage de l'espace, pas une section de contenu qu'on visite aussi souvent. */
export const SETTINGS_NAV_ITEM: AdminNavItem = {
  href: "/admin/parametres",
  label: "Paramètres",
  icon: Settings,
};

/** Partagée avec `AdminMobileNav` : le tableau de bord ne doit pas s'allumer sur ses sous-sections. */
export function isAdminNavItemActive(pathname: string, item: AdminNavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Filtrage par rôle (plateforme vs. membre de tenant) et regroupement — la
 * même règle doit produire la même liste dans la barre latérale (grand écran)
 * et dans le panneau `AdminMobileNav` (petit écran) : la dupliquer aurait
 * fini par diverger silencieusement entre les deux.
 */
export function useAdminNav(isPlatformAdmin: boolean) {
  const { role } = useTenant();
  const isFinanceRole = role !== null && FINANCE_ROLES.includes(role);
  const items = ADMIN_NAV.filter((item) => {
    if (!item.platformOnly) return true;
    if (isPlatformAdmin) return true;
    return Boolean(item.financeOnly) && isFinanceRole;
  });
  const ungroupedItems = items.filter((item) => !item.group);
  const groupedItems = NAV_GROUPS.map((name) => ({
    name,
    items: items.filter((item) => item.group === name),
  })).filter((group) => group.items.length > 0);

  return { ungroupedItems, groupedItems };
}

/** Lien de navigation, partagé entre la barre latérale et `AdminMobileNav`. */
export function AdminNavLink({
  item,
  active,
  collapsed = false,
  onNavigate,
}: {
  item: AdminNavItem;
  active: boolean;
  /** N'a de sens que dans la barre latérale grand écran : `AdminMobileNav` ne le passe jamais. */
  collapsed?: boolean;
  /** Referme le panneau mobile après navigation ; sans effet dans la barre latérale. */
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium whitespace-nowrap",
        "transition-colors duration-[var(--duration-fast)]",
        collapsed && "justify-center px-0",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <item.icon aria-hidden className="size-4 shrink-0" />
      <span
        className={cn(
          "overflow-hidden opacity-100 transition-[max-width,opacity] duration-[var(--duration-base)] ease-[var(--ease-out)]",
          collapsed ? "max-w-0 opacity-0" : "max-w-40",
        )}
      >
        {item.label}
      </span>
      {active && (
        <span
          aria-hidden
          className={cn(
            "bg-sidebar-primary ml-auto h-4 w-0.5 rounded-full",
            collapsed && "hidden",
          )}
        />
      )}
    </Link>
  );
}

/**
 * Navigation du back-office, grand écran.
 *
 * Barre latérale sombre : c'est ce qui distingue l'administration du site
 * public tout en restant dans la même identité — même encre, même or, même
 * typographie. Avant, l'administration reprenait l'en-tête marketing complet et
 * n'avait qu'une liste de liens sans état actif ni icônes.
 *
 * N'existe plus que pour `lg:` et au-delà — voir `AdminMobileNav` pour le
 * panneau latéral qui la remplace sur téléphone et tablette. Composant client
 * uniquement pour marquer la page courante.
 */
export function AdminSidebar({
  isPlatformAdmin,
  collapsed,
}: {
  isPlatformAdmin: boolean;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const { ungroupedItems, groupedItems } = useAdminNav(isPlatformAdmin);

  return (
    <div className="bg-sidebar text-sidebar-foreground hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
      <div
        className={cn(
          "border-sidebar-border flex flex-col gap-1 border-b px-5 py-4",
          collapsed && "items-center",
        )}
      >
        <div className={cn(collapsed && "hidden")}>
          <LogoLink variant="plaque" className="h-7" />
        </div>
        <span
          className={cn("type-label text-sidebar-foreground/45", collapsed && "hidden")}
        >
          Admin
        </span>
      </div>

      <nav
        aria-label="Navigation de l’administration"
        className="flex flex-1 flex-col px-3 py-4"
      >
        <div className={cn("mb-4 px-1", collapsed && "hidden")}>
          <TenantSwitcher />
        </div>

        <ul className="space-y-1">
          {ungroupedItems.map((item) => (
            <li key={item.href}>
              <AdminNavLink
                item={item}
                active={isAdminNavItemActive(pathname, item)}
                collapsed={collapsed}
              />
            </li>
          ))}
        </ul>

        {groupedItems.map((group) => (
          <div key={group.name} className="mt-5">
            <p
              className={cn(
                "type-label text-sidebar-foreground/40 mb-1.5 px-3",
                collapsed && "hidden",
              )}
            >
              {group.name}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.href}>
                  <AdminNavLink
                    item={item}
                    active={isAdminNavItemActive(pathname, item)}
                    collapsed={collapsed}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="border-sidebar-border mt-auto border-t pt-3">
          <ul>
            <li>
              <AdminNavLink
                item={SETTINGS_NAV_ITEM}
                active={isAdminNavItemActive(pathname, SETTINGS_NAV_ITEM)}
                collapsed={collapsed}
              />
            </li>
          </ul>
        </div>
      </nav>
    </div>
  );
}
