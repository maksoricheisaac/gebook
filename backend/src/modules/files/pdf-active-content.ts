/**
 * Détection de contenu actif dangereux dans un PDF — JavaScript embarqué,
 * actions `/Launch` (exécution d'une commande externe côté lecteur), pièces
 * jointes embarquées (`/EmbeddedFile`, un moyen classique de faire passer un
 * second fichier malveillant à l'intérieur d'un PDF « valide »), ou contenu
 * multimédia enrichi (`/RichMedia`).
 *
 * Complémentaire de ClamAV, pas un substitut : ClamAV détecte des signatures
 * connues, ceci détecte une *catégorie* de comportement dangereux même pour
 * un PDF qui n'a jamais été vu auparavant. Recherche par motif d'octets sur
 * le contenu brut — pas un analyseur PDF complet — volontairement, même
 * philosophie que `mime-sniffer.ts` : suffisant pour la question posée
 * (« ce PDF contient-il un de ces mots-clés dangereux ? »), pas une
 * dépendance externe pour l'écrire.
 *
 * Limite connue et acceptée : un flux d'objets compressé (`ObjStm`, autorisé
 * par la norme PDF) peut cacher ces mots-clés à une recherche sur les octets
 * bruts. ClamAV, lui, décompresse et inspecte ces flux — c'est précisément
 * pour ça que les deux couches se complètent au lieu de se remplacer.
 */

const DANGEROUS_PDF_TOKENS = [
  '/JavaScript',
  '/JS',
  '/OpenAction',
  '/Launch',
  '/EmbeddedFile',
  '/RichMedia',
  '/AA',
] as const;

export function findDangerousPdfContent(buffer: Buffer): string | null {
  // Recherche en « latin1 » : préserve la correspondance octet-à-octet avec
  // le buffer, contrairement à 'utf8' qui réinterpréterait certains octets.
  const text = buffer.toString('latin1');

  for (const token of DANGEROUS_PDF_TOKENS) {
    if (text.includes(token)) {
      return token;
    }
  }

  return null;
}
