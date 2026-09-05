"use client";

import { AdminApiError } from "@/src/lib/admin-api";

/**
 * Téléversement avec progression réelle, pour le seul appel qui en a besoin
 * (le fichier d'un format — potentiellement volumineux, jusqu'à 200 Mo).
 *
 * `adminFetch` (`admin-api.ts`) reste construit sur `fetch()`, qui n'expose
 * aucun événement de progression d'envoi — seul `XMLHttpRequest` le permet
 * (`xhr.upload.onprogress`). Passer tout `adminFetch` à `XMLHttpRequest`
 * pour ce seul besoin aurait été disproportionné ; cette fonction reste donc
 * un cas particulier, pas un remplacement.
 */
export function uploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress: (fraction: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin${path}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (xhr.status === 204 || !xhr.responseText) {
          resolve(undefined as T);
          return;
        }
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new Error("Réponse invalide du serveur."));
        }
        return;
      }

      let message = "Une erreur est survenue. Veuillez réessayer.";
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string };
        if (body.message) message = body.message;
      } catch {
        // Réponse d'erreur non-JSON (proxy en panne, coupure réseau) : le
        // message générique ci-dessus reste affiché.
      }
      reject(new AdminApiError(xhr.status, message));
    };

    xhr.onerror = () => {
      reject(new Error("Le téléversement a échoué (problème réseau)."));
    };

    xhr.send(formData);
  });
}
