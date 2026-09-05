import request from 'supertest';
import type { PrismaService } from '../../src/prisma/prisma.service';

const DEFAULT_PASSWORD = 'MotDePasse1';

/**
 * Complète l'inscription dans les tests e2e qui ne portent pas sur la
 * vérification d'adresse elle-même (celle-ci est testée pour de vrai dans
 * `auth.e2e-spec.ts`) : depuis l'introduction de la confirmation d'adresse
 * obligatoire (brief §1), `POST /auth/register` ne pose plus de cookie de
 * session directement. Cette fonction marque `emailVerifiedAt` directement en
 * base — jamais via une route HTTP, aucune route publique ne doit permettre
 * ça — puis se connecte réellement, pour obtenir un agent authentifié
 * équivalent à l'ancien comportement d'avant cette exigence.
 */
export async function verifyAndLogin(
  agent: ReturnType<typeof request.agent>,
  prisma: PrismaService,
  origin: string,
  email: string,
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
}
