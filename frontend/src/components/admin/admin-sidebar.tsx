"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookText,
  FolderTree,
  LayoutDashboard,
  ReceiptText,
  Settings,
  Users,
  UserSquare2,
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

interface AdminNavItem {
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
  { href: "/admin/team", label: "Équipe", icon: Users, group: "Opérations" },
];

const NAV_GROUPS: AdminNavGroup[] = ["Catalogue", "Opérations"];

/** Séparé du reste : un réglage de l'espace, pas une section de contenu qu'on visite aussi souvent. */
const SETTINGS_NAV_ITEM: AdminNavItem = {
  href: "/admin/parametres",
  label: "Paramètres",
  icon: Settings,
};

/**
 * Navigation du back-office.
 *
 * Barre latérale sombre : c'est ce qui distingue l'administration du site
 * public tout en restant dans la même identité — même encre, même or, même
 * typographie. Avant, l'administration reprenait l'en-tête marketing complet et
 * n'avait qu'une liste de liens sans état actif ni icônes.
 *
 * Composant client uniquement pour marquer la page courante.
 */
export function AdminSidebar({
  isPlatformAdmin,
  collapsed,
}: {
  isPlatformAdmin: boolean;
  collapsed: boolean;
}) {
  const pathname = usePathname();
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

  const renderNavLink = (item: AdminNavItem) => {
    const active = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium whitespace-nowrap",
          "transition-colors duration-[--duration-fast]",
          collapsed && "lg:justify-center lg:px-0",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
      >
        <item.icon aria-hidden className="size-4 shrink-0" />
        <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
        {active && (
          <span
            aria-hidden
            className={cn(
              "bg-sidebar-primary ml-auto hidden h-4 w-0.5 rounded-full lg:block",
              collapsed && "lg:hidden",
            )}
          />
        )}
      </Link>
    );
  };

  return (
    <div className="bg-sidebar text-sidebar-foreground flex h-full flex-col lg:sticky lg:top-0 lg:h-dvh">
      <div
        className={cn(
          "border-sidebar-border flex flex-col gap-1 border-b px-5 py-4",
          collapsed && "lg:items-center",
        )}
      >
        <div className={cn(collapsed && "lg:hidden")}>
          <LogoLink variant="plaque" className="h-7" />
        </div>
        <span
          className={cn(
            "type-label text-sidebar-foreground/45",
            collapsed && "lg:hidden",
          )}
        >
          Admin
        </span>
      </div>

      {/* Colonne sur grand écran, rangée défilante sur mobile : le back-office
          reste utilisable au téléphone sans imposer un menu plein écran, puisqu'on
          y navigue en permanence entre les sections. */}
      <nav
        aria-label="Navigation de l’administration"
        className="flex flex-1 flex-col px-3 py-3 lg:py-4"
      >
        <div className={cn("mb-3 px-1 lg:mb-4", collapsed && "lg:hidden")}>
          <TenantSwitcher />
        </div>

        <ul className="flex gap-1 overflow-x-auto lg:block lg:space-y-1 lg:overflow-visible">
          {ungroupedItems.map((item) => (
            <li key={item.href} className="shrink-0 lg:shrink">
              {renderNavLink(item)}
            </li>
          ))}
        </ul>

        {groupedItems.map((group) => (
          <div key={group.name} className="mt-4 lg:mt-5">
            <p
              className={cn(
                "type-label text-sidebar-foreground/40 mb-1.5 px-3 lg:block",
                collapsed && "lg:hidden",
              )}
            >
              {group.name}
            </p>
            <ul className="flex gap-1 overflow-x-auto lg:block lg:space-y-1 lg:overflow-visible">
              {group.items.map((item) => (
                <li key={item.href} className="shrink-0 lg:shrink">
                  {renderNavLink(item)}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="border-sidebar-border mt-4 border-t pt-3 lg:mt-auto">
          <ul>
            <li>{renderNavLink(SETTINGS_NAV_ITEM)}</li>
          </ul>
        </div>
      </nav>
    </div>
  );
}
