import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/**
 * Transforme les erreurs de `class-validator` en une réponse indexée par champ.
 *
 * Par défaut, NestJS renvoie un tableau plat de phrases : le frontend ne peut alors
 * pas rattacher un message au champ concerné pour l'afficher sous le bon libellé.
 */
export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException({
    message: 'Les données envoyées sont invalides.',
    errors: flatten(errors),
  });
}

function flatten(
  errors: ValidationError[],
  parentPath = '',
  accumulator: Record<string, string[]> = {},
): Record<string, string[]> {
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const messages = Object.values(error.constraints ?? {});

    if (messages.length > 0) {
      (accumulator[path] ??= []).push(...messages);
    }

    // Les DTO imbriqués (`@ValidateNested`) produisent des erreurs filles ; leur
    // chemin complet permet de viser le bon champ d'un formulaire structuré.
    if (error.children && error.children.length > 0) {
      flatten(error.children, path, accumulator);
    }
  }

  return accumulator;
}
