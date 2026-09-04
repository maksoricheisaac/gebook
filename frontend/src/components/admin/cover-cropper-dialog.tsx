"use client";

import { useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { Crop } from "lucide-react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { getCroppedImageBlob } from "@/src/lib/crop-image";

/** Même proportion que la couverture affichée partout ailleurs (`aspect-2/3` — voir `book-cover.tsx`, `work-editor.tsx`). */
const COVER_ASPECT = 2 / 3;

/**
 * Rognage de la couverture avant envoi.
 *
 * Le fichier choisi n'est jamais envoyé tel quel : cette modale s'intercale
 * systématiquement entre la sélection et `POST /works/:id/cover`, pour que la
 * zone visible corresponde toujours à ce que l'auteur a réellement cadré,
 * plutôt qu'un centrage automatique qui coupe parfois un visage ou un titre.
 * Le rognage se fait entièrement côté navigateur (`getCroppedImageBlob`,
 * canvas) : le backend ne redimensionne rien, il stocke l'image telle qu'elle
 * lui arrive.
 */
export function CoverCropperDialog({
  imageSrc,
  isSaving,
  onCancel,
  onCropped,
}: {
  /** URL objet du fichier choisi (`URL.createObjectURL`) — géré par l'appelant, qui la révoque à la fermeture. */
  imageSrc: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onCropped: (file: File) => void;
}) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const reset = (): void => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setIsProcessing(false);
  };

  const handleCancel = (): void => {
    reset();
    onCancel();
  };

  const handleConfirm = async (): Promise<void> => {
    if (!imageSrc || !croppedAreaPixels) return;

    setIsProcessing(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels);
      const file = new File([blob], "couverture.jpg", { type: "image/jpeg" });
      reset();
      onCropped(file);
    } catch {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={imageSrc !== null} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent showClose={!isProcessing && !isSaving}>
        <DialogHeader>
          <DialogTitle>Cadrer la couverture</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {imageSrc && (
            <div className="bg-paper-200 relative h-96 w-full overflow-hidden rounded-md">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={COVER_ASPECT}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_area, areaPixels) => setCroppedAreaPixels(areaPixels)}
              />
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="cover-zoom" className="text-secondary text-sm font-semibold">
              Zoom
            </Label>
            <input
              id="cover-zoom"
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="accent-primary h-2 w-full cursor-pointer"
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={isProcessing || isSaving}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            isLoading={isProcessing || isSaving}
            disabled={!croppedAreaPixels}
          >
            {!isProcessing && !isSaving && <Crop aria-hidden />}
            Utiliser cette couverture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
