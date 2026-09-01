"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import {
  BookOpen,
  Check,
  FileText,
  Headphones,
  Lock,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useCart } from "@/src/components/providers/cart-provider";
import { Button } from "@/src/components/ui/button";
import { Field, FormError } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { deliveryTypeLabel, formatPrice, formatTypeLabel } from "@/src/lib/format";
import type { WorkFormat } from "@/src/lib/catalog";
import { purchaseAction, type PurchaseFormState } from "@/src/lib/order-actions";
import { cn } from "@/src/lib/utils";

const initialPurchaseState: PurchaseFormState = {};

const FORMAT_ICONS: Record<string, LucideIcon> = {
  pdf: FileText,
  audio: Headphones,
  paper: BookOpen,
};

/**
 * Modes de remise qui exigent des coordonnées.
 *
 * Ces valeurs viennent du contrat de l'API (`CreateOrderDto`) : une commande
 * `physical_delivery` sans adresse, ou `pickup` sans téléphone, est refusée.
 */
export const DELIVERY_REQUIREMENTS: Record<string, "address" | "contact" | undefined> = {
  physical_delivery: "address",
  pickup: "contact",
};

/**
 * Sélecteur de format et achat.
 *
 * Il traduit à l'écran la règle métier centrale du projet : une œuvre, plusieurs
 * manières de l'acheter, chacune avec son prix et son mode de remise.
 *
 * Il corrige surtout une impasse fonctionnelle. L'API refuse toute commande d'un
 * format papier tant qu'elle ne porte pas de destinataire, de téléphone, de pays,
 * de ville et d'adresse — et le formulaire n'en demandait aucun. Choisir « Livre
 * imprimé » puis cliquer sur « Acheter » menait donc invariablement au message
 * « Les coordonnées de livraison sont incomplètes », sans qu'aucun champ ne
 * permette de les fournir. Les coordonnées apparaissent maintenant dès que le
 * format sélectionné les exige, et disparaissent sinon.
 */
export function FormatSelector({
  formats,
  workSlug,
  workTitle,
  authorName,
  coverPath,
  tenantSlug,
  tenantName,
  isAuthenticated,
  defaultFormatId,
}: {
  formats: WorkFormat[];
  workSlug: string;
  workTitle: string;
  authorName: string;
  coverPath: string | null;
  tenantSlug: string;
  tenantName: string;
  isAuthenticated: boolean;
  defaultFormatId?: string;
}) {
  const groupId = useId();
  const cart = useCart();
  const available = formats.filter((format) => format.isAvailable);
  const [selectedId, setSelectedId] = useState(
    (defaultFormatId && available.some((format) => format.id === defaultFormatId)
      ? defaultFormatId
      : available[0]?.id) ?? "",
  );
  const [state, formAction, pending] = useActionState(
    purchaseAction,
    initialPurchaseState,
  );

  if (available.length === 0) {
    return (
      <div className="border-border bg-muted rounded-lg border p-5">
        <p className="text-secondary text-sm font-semibold">
          Aucun format n’est disponible à la vente pour le moment.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          Cet ouvrage est publié mais ses formats ne sont pas encore ouverts à la
          commande. Revenez bientôt.
        </p>
      </div>
    );
  }

  const selected = available.find((format) => format.id === selectedId) ?? available[0]!;
  const requirement = DELIVERY_REQUIREMENTS[selected.deliveryType];

  const handleAddToCart = (): void => {
    cart.addItem({
      workFormatId: selected.id,
      workSlug,
      workTitle,
      authorName,
      coverPath,
      formatType: selected.formatType,
      formatLabel: selected.label,
      deliveryType: selected.deliveryType,
      price: selected.price,
      tenantSlug,
      tenantName,
    });
    toast.success("Ajouté au panier.", { description: workTitle });
  };

  // L'achat exige un compte. La destination souhaitée est transmise à la page de
  // connexion pour que le lecteur y revienne, son format toujours sélectionné.
  const purchaseHref = `/connexion?retour=${encodeURIComponent(
    `/livres/${workSlug}?format=${selected.id}`,
  )}`;

  return (
    <form action={formAction} className="space-y-6">
      <fieldset>
        <legend className="type-h3 text-secondary mb-4">Choisissez votre format</legend>

        <div className="grid gap-2.5">
          {available.map((format) => {
            const Icon = FORMAT_ICONS[format.formatType] ?? BookOpen;
            const isSelected = format.id === selected.id;
            const inputId = `${groupId}-${format.id}`;

            return (
              <label
                key={format.id}
                htmlFor={inputId}
                className={cn(
                  "relative flex cursor-pointer items-center gap-4 rounded-lg border p-4",
                  "transition-[border-color,background-color] duration-[--duration-fast]",
                  "has-focus-visible:ring-ring/40 has-focus-visible:ring-[3px]",
                  isSelected
                    ? "border-primary bg-primary/[0.04]"
                    : "border-border hover:border-border-strong hover:bg-paper-100/60",
                )}
              >
                <input
                  id={inputId}
                  type="radio"
                  name="workFormatId"
                  value={format.id}
                  checked={isSelected}
                  onChange={() => setSelectedId(format.id)}
                  className="sr-only"
                />

                {/* Pastille dessinée : le radio natif ignore nos couleurs, mais
                    il reste dans le DOM et porte le focus et l'état coché. */}
                <span
                  aria-hidden
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors duration-[--duration-fast]",
                    isSelected ? "border-primary bg-primary" : "border-border-strong",
                  )}
                >
                  {isSelected && (
                    <Check className="size-3 text-white" strokeWidth={3.5} />
                  )}
                </span>

                <Icon
                  aria-hidden
                  className={cn(
                    "size-5 shrink-0",
                    isSelected ? "text-primary" : "text-muted-foreground",
                  )}
                />

                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-secondary text-[0.9375rem] font-semibold">
                    {format.label ?? formatTypeLabel(format.formatType)}
                  </span>
                  <span className="type-caption">
                    {deliveryTypeLabel(format.deliveryType)}
                  </span>
                </span>

                <span className="text-secondary tnum text-base font-semibold whitespace-nowrap">
                  {formatPrice(format.price)}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/*
       * Coordonnées de remise, affichées seulement quand le format sélectionné
       * les exige. Les champs sont volontairement démontés dans le cas contraire
       * pour ne pas être envoyés — l'API refuserait une adresse sur une commande
       * purement numérique.
       */}
      {requirement && isAuthenticated && (
        <DeliveryFields requirement={requirement} fieldErrors={state.fieldErrors} />
      )}

      <FormError message={state.error} />

      <input type="hidden" name="workSlug" value={workSlug} />

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={handleAddToCart}
          className="w-full sm:w-auto"
        >
          <ShoppingCart aria-hidden />
          Ajouter au panier
        </Button>

        {isAuthenticated ? (
          <Button
            type="submit"
            size="lg"
            isLoading={pending}
            className="w-full sm:w-auto"
          >
            {pending ? "Enregistrement de la commande…" : "Commander maintenant"}
          </Button>
        ) : (
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={purchaseHref}>Se connecter pour commander</Link>
          </Button>
        )}
      </div>

      <p className="text-muted-foreground flex items-start gap-2 text-sm">
        <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {/*
         * Formulation honnête : le paiement en ligne n'est pas raccordé. Annoncer
         * un « paiement sécurisé » ici laisserait croire qu'on peut payer tout de
         * suite, ce qui est faux — la commande est enregistrée, le règlement suit.
         */}
        La commande est enregistrée à votre nom. Le règlement s’effectue à l’étape
        suivante, après confirmation.
      </p>
    </form>
  );
}

/**
 * Coordonnées de remise.
 *
 * Les champs correspondent exactement à ceux que l'API exige selon le mode :
 * destinataire et téléphone pour un retrait, plus le pays, la ville et l'adresse
 * pour une livraison.
 */
function DeliveryFields({
  requirement,
  fieldErrors,
}: {
  requirement: "address" | "contact";
  fieldErrors?: Record<string, string[]>;
}) {
  const firstError = (name: string) => fieldErrors?.[name]?.[0];

  return (
    <fieldset className="border-border bg-paper-100/70 space-y-4 rounded-lg border p-5">
      <legend className="sr-only">Coordonnées de remise</legend>

      <p className="text-secondary flex items-center gap-2 text-sm font-semibold">
        <Truck aria-hidden className="text-primary size-4" />
        {requirement === "address"
          ? "Où livrer cet exemplaire ?"
          : "Qui vient retirer l’exemplaire ?"}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="recipientName"
          label="Nom du destinataire"
          required
          error={firstError("recipientName")}
        >
          <Input name="recipientName" autoComplete="name" maxLength={150} />
        </Field>

        <Field
          id="deliveryPhone"
          label="Téléphone"
          hint="Pour vous joindre au moment de la remise."
          required
          error={firstError("deliveryPhone")}
        >
          <Input
            name="deliveryPhone"
            type="tel"
            autoComplete="tel"
            maxLength={30}
            placeholder="+242 06 000 00 00"
          />
        </Field>
      </div>

      {requirement === "address" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="deliveryCountry"
              label="Pays"
              required
              error={firstError("deliveryCountry")}
            >
              <Input
                name="deliveryCountry"
                autoComplete="country-name"
                defaultValue="Congo"
                maxLength={100}
              />
            </Field>

            <Field
              id="deliveryCity"
              label="Ville"
              required
              error={firstError("deliveryCity")}
            >
              <Input name="deliveryCity" autoComplete="address-level2" maxLength={100} />
            </Field>
          </div>

          <Field
            id="deliveryAddress"
            label="Adresse"
            required
            error={firstError("deliveryAddress")}
          >
            <Input
              name="deliveryAddress"
              autoComplete="street-address"
              placeholder="Numéro, rue, quartier"
            />
          </Field>

          <Field
            id="deliveryLandmark"
            label="Point de repère"
            hint="Un commerce, un carrefour ou un bâtiment connu à proximité."
            optional
            error={firstError("deliveryLandmark")}
          >
            <Input name="deliveryLandmark" maxLength={255} />
          </Field>
        </>
      )}
    </fieldset>
  );
}
