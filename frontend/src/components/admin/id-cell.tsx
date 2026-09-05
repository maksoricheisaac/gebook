/**
 * Identifiant tronqué, colonne « # » des datatables d'administration.
 *
 * L'identifiant complet (UUID, 36 caractères) n'a jamais sa place dans une
 * colonne de tableau — il écraserait toutes les autres. Les huit premiers
 * caractères suffisent à le reconnaître d'un coup d'œil (même convention
 * qu'un hash Git abrégé) ; l'identifiant complet reste accessible via l'info-
 * bulle native du navigateur (`title`), sans JavaScript ni bouton dédié.
 */
export function IdCell({ id, length = 8 }: { id: string; length?: number }) {
  const truncated = id.length > length ? `${id.slice(0, length)}…` : id;

  return (
    <span title={id} className="text-muted-foreground tnum cursor-help font-mono text-xs">
      {truncated}
    </span>
  );
}
