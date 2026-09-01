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

import { useTenant } from "@/src/components/providers/tenant-provider";

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

/** Le tableau de bord ne doit pas s'allumer sur ses sous-sections. */
export function isAdminNavItemActive(pathname: string, item: AdminNavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Filtrage par rôle (plateforme vs. membre de tenant) et regroupement — même
 * liste, quel que soit l'écran (grand écran : `AdminAppSidebar` en rail
 * complet ; petit écran : le même composant, rendu en panneau `Sheet` par le
 * primitif `Sidebar` de shadcn/ui) : la dupliquer aurait fini par diverger
 * silencieusement entre les deux, comme avant le passage à `Sidebar`.
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
