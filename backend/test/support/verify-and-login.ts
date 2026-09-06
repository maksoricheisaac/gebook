import request from 'supertest';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { MailMessage } from '../../src/modules/mail/mail.service';
import { extractLoginOtp } from './fake-mail';

const DEFAULT_PASSWORD = 'MotDePasse1';

/**
 * Complète l'inscription puis la connexion dans les tests e2e qui ne portent
 * pas sur la vérification d'adresse ou le code de connexion eux-mêmes (ceux-ci
 * sont testés pour de vrai dans `auth.e2e-spec.ts`) : depuis l'introduction de
 * la confirmation d'adresse obligatoire (brief §1) puis du code de connexion
 * (OTP, audit pré-production), ni `POST /auth/register` ni `POST /auth/login`
 * ne posent plus de cookie de session directement. Cette fonction marque
 * `emailVerifiedAt` directement en base — jamais via une route HTTP, aucune
 * route publique ne doit permettre ça —, se connecte réellement, puis extrait
 * le code de connexion du dernier e-mail « envoyé » à cette adresse (via
 * `fakeMailService()`, exactement comme un utilisateur lirait sa boîte mail)
 * pour terminer la connexion.
 */
export async function verifyAndLogin(
  agent: ReturnType<typeof request.agent>,
  prisma: PrismaService,
  origin: string,
  email: string,
  sent: MailMessage[],
  password: string = DEFAULT_PASSWORD,
): Promise<void> {
  await prisma.user.update({
    where: { email },
    data: { emailVerifiedAt: new Date() },
  });
  await agent
    .post('/auth/login')
    .set('Origin', origin)
    .send({ email, password })
    .expect(200);

  const otpMail = [...sent].reverse().find((message) => message.to === email);
  if (!otpMail) {
    throw new Error(`Aucun code de connexion envoyé à ${email}.`);
  }
  const code = extractLoginOtp(otpMail.html);

  await agent
    .post('/auth/login/otp')
    .set('Origin', origin)
    .send({ email, code })
    .expect(200);
}
