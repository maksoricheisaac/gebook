"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

import { LogoLink } from "@/src/components/layout/logo";
import { TenantSwitcher } from "@/src/components/layout/tenant-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/src/components/ui/sidebar";
import {
  isAdminNavItemActive,
  SETTINGS_NAV_ITEM,
  useAdminNav,
} from "@/src/components/admin/admin-nav";

/**
 * Barre latérale de l'administration, bâtie sur le composant `Sidebar` de
 * shadcn/ui (`sidebar-04`) — remplace l'ancienne coquille écrite à la main
 * (`AdminSidebar` + `AdminMobileNav`, encore conservés uniquement pour leur
 * logique de navigation : `useAdminNav`, `isAdminNavItemActive`,
 * `SETTINGS_NAV_ITEM`, réutilisée telle quelle ici).
 *
 * Le passage à `Sidebar` apporte, sans code supplémentaire : le panneau
 * mobile (un `Sheet`, automatique dès que l'écran passe sous `md`), la
 * persistance de l'état replié (cookie, posé par `SidebarProvider` — plus
 * fiable que le `localStorage` précédent, lisible aussi côté serveur si un
 * jour la coquille devient un composant serveur), et une bulle d'aide au
 * survol de chaque lien quand la barre est repliée en rail d'icônes.
 */
export function AdminAppSidebar({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const pathname = usePathname();
  const { ungroupedItems, groupedItems } = useAdminNav(isPlatformAdmin);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 border-b px-3 py-3">
        <div className="group-data-[collapsible=icon]:hidden">
          <LogoLink variant="light" className="h-7" />
        </div>
        <div className="group-data-[collapsible=icon]:hidden">
          <TenantSwitcher />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {ungroupedItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isAdminNavItemActive(pathname, item)}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <item.icon aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {groupedItems.map((group) => (
          <SidebarGroup key={group.name}>
            <SidebarGroupLabel>{group.name}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isAdminNavItemActive(pathname, item)}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <item.icon aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* Séparé du reste : un réglage de l'espace, pas une section de
          contenu qu'on visite aussi souvent — même raison que dans
          l'ancienne barre latérale. */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isAdminNavItemActive(pathname, SETTINGS_NAV_ITEM)}
              tooltip={SETTINGS_NAV_ITEM.label}
            >
              <Link href={SETTINGS_NAV_ITEM.href}>
                <SETTINGS_NAV_ITEM.icon aria-hidden />
                <span>{SETTINGS_NAV_ITEM.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
