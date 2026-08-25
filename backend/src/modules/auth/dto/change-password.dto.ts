import { IsString, Matches, MinLength } from 'class-validator';

/**
 * Changement de mot de passe (compte déjà authentifié).
 *
 * `currentPassword` n'a pas de contrainte de format : seule sa correspondance
 * avec le hachage stocké compte, vérifiée par `AuthService.changePassword()`
 * — imposer un format ici n'apporterait rien et rejetterait à tort un ancien
 * mot de passe créé sous une règle différente.
 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Le mot de passe actuel est obligatoire.' })
  currentPassword!: string;

  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message:
      'Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre.',
  })
  newPassword!: string;

  @IsString()
  newPasswordConfirmation!: string;
}
