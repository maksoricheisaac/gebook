import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { validationExceptionFactory } from './../src/common/validation/validation-exception.factory';
import { MailService } from './../src/modules/mail/mail.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { UserStatus } from './../src/generated/prisma/enums';
import type { AuthUserResponse } from './../src/modules/auth/dto/auth-user.response';
import type { ErrorResponseBody } from './../src/common/filters/http-exception.filter';
import { extractVerificationToken, fakeMailService } from './support/fake-mail';
import { verifyAndLogin } from './support/verify-and-login';

const ORIGIN = 'http://localhost:3000';
/** Préfixe dédié : nettoyé intégralement en fin de suite, sans toucher au seed. */
const EMAIL_DOMAIN = '@phase5.e2e.test';

/**
 * Ces tests s'exécutent sur la base réellement migrée et alimentée par
 * `prisma/seed.ts` (le rôle `reader` en particulier doit exister). Comme pour le
 * catalogue, les règles vérifiées ici — révocation immédiate d'un compte bloqué,
 * cumul de rôles, transaction d'inscription — dépendent du schéma et de Prisma, pas
 * seulement du TypeScript : les simuler ne prouverait rien.
 */
describe('Authentification (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const mail = fakeMailService();

  /** Dernier jeton de vérification envoyé à cette adresse (voir `mail.sent`). */
  const lastVerificationToken = (email: string): string => {
    const message = [...mail.sent].reverse().find((sent) => sent.to === email);
    if (!message) {
      throw new Error(`Aucun e-mail de vérification envoyé à ${email}.`);
    }
    return extractVerificationToken(message.html);
  };

  const registerPayload = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    firstName: 'Jeanne',
    lastName: 'Kimbangu',
    email: `jeanne.kimbangu${EMAIL_DOMAIN}`,
    password: 'MotDePasse1',
    passwordConfirmation: 'MotDePasse1',
    acceptTerms: true,
    ...overrides,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);

    // État propre : les compteurs de limitation d'un run précédent ne doivent pas
    // fausser les tentatives comptées dans celui-ci.
    await prisma.loginAttempt.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await prisma.loginAttempt.deleteMany({});
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('inscrit un lecteur mais ne pose pas de cookie tant que l’adresse n’est pas confirmée', async () => {
      const email = `jeanne.kimbangu${EMAIL_DOMAIN}`;
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(registerPayload())
        .expect(201);

      expect(response.body).toEqual({
        status: 'verification_required',
        email,
      });
      expect(response.headers['set-cookie']).toBeUndefined();

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.emailVerifiedAt).toBeNull();
      expect(mail.sent.some((sent) => sent.to === email)).toBe(true);
    });

    it('refuse une écriture sans origine autorisée', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerPayload({ email: `origine${EMAIL_DOMAIN}` }))
        .expect(403);
    });

    it('refuse un e-mail déjà utilisé', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(registerPayload({ email: `doublon${EMAIL_DOMAIN}` }))
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(registerPayload({ email: `doublon${EMAIL_DOMAIN}` }))
        .expect(409);

      expect((response.body as ErrorResponseBody).message).toContain(
        'existe déjà',
      );
    });

    it('refuse un prénom trop court', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({ firstName: 'J', email: `prenom${EMAIL_DOMAIN}` }),
        )
        .expect(400);

      expect(
        (response.body as ErrorResponseBody).errors?.firstName,
      ).toBeDefined();
    });

    it('refuse un nom de famille trop long', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({
            lastName: 'K'.repeat(81),
            email: `nom${EMAIL_DOMAIN}`,
          }),
        )
        .expect(400);

      expect(
        (response.body as ErrorResponseBody).errors?.lastName,
      ).toBeDefined();
    });

    it('refuse une adresse e-mail invalide', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(registerPayload({ email: 'pas-un-e-mail' }))
        .expect(400);

      expect((response.body as ErrorResponseBody).errors?.email).toBeDefined();
    });

    it('refuse un mot de passe qui ne respecte pas la complexité requise', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({
            email: `faible${EMAIL_DOMAIN}`,
            password: 'minuscules8',
            passwordConfirmation: 'minuscules8',
          }),
        )
        .expect(400);

      expect(
        (response.body as ErrorResponseBody).errors?.password,
      ).toBeDefined();
    });

    it('refuse une confirmation de mot de passe différente', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({
            email: `confirmation${EMAIL_DOMAIN}`,
            passwordConfirmation: 'AutreMotDePasse1',
          }),
        )
        .expect(400);

      expect(
        (response.body as ErrorResponseBody).errors?.passwordConfirmation,
      ).toBeDefined();
    });

    it('refuse une inscription sans acceptation des conditions', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({
            email: `conditions${EMAIL_DOMAIN}`,
            acceptTerms: false,
          }),
        )
        .expect(400);

      expect(
        (response.body as ErrorResponseBody).errors?.acceptTerms,
      ).toBeDefined();
    });
  });

  describe('POST /auth/verify-email', () => {
    it('confirme l’adresse, connecte directement et n’autorise le jeton qu’une seule fois', async () => {
      const email = `verification${EMAIL_DOMAIN}`;
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(registerPayload({ email }))
        .expect(201);

      const token = lastVerificationToken(email);

      const response = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .set('Origin', ORIGIN)
        .send({ token })
        .expect(200);

      expect((response.body as AuthUserResponse).email).toBe(email);
      const setCookie = response.headers['set-cookie'];
      expect(setCookie?.[0]).toMatch(/gebook_session=.+HttpOnly/);

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.emailVerifiedAt).not.toBeNull();

      // Jeton à usage unique : un second clic sur le même lien est refusé.
      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .set('Origin', ORIGIN)
        .send({ token })
        .expect(401);
    });

    it('refuse un jeton invalide', async () => {
      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .set('Origin', ORIGIN)
        .send({ token: 'jeton-invente' })
        .expect(401);
    });
  });

  describe('POST /auth/verify-email/resend', () => {
    it('renvoie un nouveau lien à un compte non vérifié', async () => {
      const email = `renvoi${EMAIL_DOMAIN}`;
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(registerPayload({ email }))
        .expect(201);

      const sentBefore = mail.sent.filter((sent) => sent.to === email).length;

      await request(app.getHttpServer())
        .post('/auth/verify-email/resend')
        .set('Origin', ORIGIN)
        .send({ email })
        .expect(204);

      const sentAfter = mail.sent.filter((sent) => sent.to === email).length;
      expect(sentAfter).toBe(sentBefore + 1);
    });

    it('répond 204 de façon identique pour un compte inexistant, sans rien envoyer', async () => {
      const email = `inexistant${EMAIL_DOMAIN}`;
      await request(app.getHttpServer())
        .post('/auth/verify-email/resend')
        .set('Origin', ORIGIN)
        .send({ email })
        .expect(204);

      expect(mail.sent.some((sent) => sent.to === email)).toBe(false);
    });
  });

  describe('POST /auth/login', () => {
    const email = `connexion${EMAIL_DOMAIN}`;
    const password = 'MotDePasse1';

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({ email, password, passwordConfirmation: password }),
        );
      // Adresse marquée vérifiée directement en base : ce bloc teste la mécanique
      // de connexion elle-même, pas la vérification d'adresse (couverte plus bas).
      await prisma.user.update({
        where: { email },
        data: { emailVerifiedAt: new Date() },
      });
    });

    it('connecte un lecteur avec les bons identifiants', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', ORIGIN)
        .send({ email, password })
        .expect(200);

      const body = response.body as { status: string; user: AuthUserResponse };
      expect(body.status).toBe('ok');
      expect(body.user.email).toBe(email);
      const setCookie = response.headers['set-cookie'];
      expect(setCookie?.[0]).toMatch(/gebook_session=.+HttpOnly/);
    });

    it('renvoie « verification_required » et ne pose pas de cookie pour un compte non vérifié', async () => {
      const unverifiedEmail = `non-verifie${EMAIL_DOMAIN}`;
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({
            email: unverifiedEmail,
            password,
            passwordConfirmation: password,
          }),
        )
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: unverifiedEmail, password })
        .expect(200);

      expect(response.body).toEqual({
        status: 'verification_required',
        email: unverifiedEmail,
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('refuse un mot de passe incorrect, avec un message générique', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', ORIGIN)
        .send({ email, password: 'MauvaisMotDePasse1' })
        .expect(401);

      expect((response.body as ErrorResponseBody).message).toBe(
        'Adresse e-mail ou mot de passe incorrect.',
      );
    });

    it('refuse un compte inexistant avec le même message générique', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: `personne${EMAIL_DOMAIN}`, password })
        .expect(401);

      expect((response.body as ErrorResponseBody).message).toBe(
        'Adresse e-mail ou mot de passe incorrect.',
      );
    });

    it('refuse un compte bloqué avec le même message générique', async () => {
      const blockedEmail = `bloque${EMAIL_DOMAIN}`;
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({
            email: blockedEmail,
            password,
            passwordConfirmation: password,
          }),
        );

      await prisma.user.update({
        where: { email: blockedEmail },
        data: { status: UserStatus.blocked },
      });

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: blockedEmail, password })
        .expect(401);

      expect((response.body as ErrorResponseBody).message).toBe(
        'Adresse e-mail ou mot de passe incorrect.',
      );
    });

    it('limite les tentatives après 5 échecs (double compteur compte + IP)', async () => {
      // Toutes les requêtes de ce fichier partagent la même IP source : sans ce
      // nettoyage, le compteur IP porterait déjà les échecs des tests précédents.
      await prisma.loginAttempt.deleteMany({});

      const throttledEmail = `limite${EMAIL_DOMAIN}`;
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({
            email: throttledEmail,
            password,
            passwordConfirmation: password,
          }),
        );

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .set('Origin', ORIGIN)
          .send({ email: throttledEmail, password: 'Faux1MotDePasse' })
          .expect(401);
      }

      // Le 6e essai est bloqué même avec le bon mot de passe : la limitation porte
      // sur le compte, pas seulement sur des identifiants invalides.
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: throttledEmail, password })
        .expect(429);

      expect((response.body as ErrorResponseBody).message).toContain(
        'Trop de tentatives',
      );
    });
  });

  describe('GET /auth/me', () => {
    it('refuse une requête non authentifiée', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('renvoie l’utilisateur courant avec ses rôles', async () => {
      const agent = request.agent(app.getHttpServer());
      const email = `moi${EMAIL_DOMAIN}`;
      const password = 'MotDePasse1';

      await agent
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({ email, password, passwordConfirmation: password }),
        )
        .expect(201);
      await verifyAndLogin(agent, prisma, ORIGIN, email, password);

      const response = await agent.get('/auth/me').expect(200);
      expect((response.body as AuthUserResponse).email).toBe(email);
      expect((response.body as AuthUserResponse).roles).toEqual(['reader']);
    });

    it('révoque l’accès immédiatement quand le compte est bloqué (règle métier n° 25)', async () => {
      const agent = request.agent(app.getHttpServer());
      const email = `revocation${EMAIL_DOMAIN}`;
      const password = 'MotDePasse1';

      await agent
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({ email, password, passwordConfirmation: password }),
        )
        .expect(201);
      await verifyAndLogin(agent, prisma, ORIGIN, email, password);

      await agent.get('/auth/me').expect(200);

      await prisma.user.update({
        where: { email },
        data: { status: UserStatus.blocked },
      });

      // Même cookie, même session en base : seul le statut du compte a changé.
      await agent.get('/auth/me').expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('efface le cookie et invalide la session', async () => {
      const agent = request.agent(app.getHttpServer());
      const email = `deconnexion${EMAIL_DOMAIN}`;
      const password = 'MotDePasse1';

      await agent
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({ email, password, passwordConfirmation: password }),
        );
      await verifyAndLogin(agent, prisma, ORIGIN, email, password);

      await agent.post('/auth/logout').set('Origin', ORIGIN).expect(204);
      await agent.get('/auth/me').expect(401);
    });

    it('reste idempotent sans session active', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Origin', ORIGIN)
        .expect(204);
    });
  });

  describe('PATCH /auth/me', () => {
    it('refuse une requête non authentifiée', async () => {
      await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Origin', ORIGIN)
        .send({ firstName: 'Nouveau', email: `x${EMAIL_DOMAIN}` })
        .expect(401);
    });

    it('modifie prénom, nom et e-mail du compte connecté', async () => {
      const agent = request.agent(app.getHttpServer());
      const email = `profil${EMAIL_DOMAIN}`;
      const password = 'MotDePasse1';

      await agent
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({ email, password, passwordConfirmation: password }),
        )
        .expect(201);
      await verifyAndLogin(agent, prisma, ORIGIN, email, password);

      const newEmail = `profil-modifie${EMAIL_DOMAIN}`;
      const response = await agent
        .patch('/auth/me')
        .set('Origin', ORIGIN)
        .send({ firstName: 'Modifié', lastName: 'Nom', email: newEmail })
        .expect(200);

      const body = response.body as AuthUserResponse;
      expect(body.firstName).toBe('Modifié');
      expect(body.lastName).toBe('Nom');
      expect(body.email).toBe(newEmail);
      expect(JSON.stringify(body)).not.toMatch(/passwordHash|password_hash/i);

      // La session reste valide après le changement d'e-mail.
      const me = await agent.get('/auth/me').expect(200);
      expect((me.body as AuthUserResponse).email).toBe(newEmail);
    });

    it('refuse un e-mail déjà utilisé par un autre compte', async () => {
      const takenEmail = `deja-pris${EMAIL_DOMAIN}`;
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(registerPayload({ email: takenEmail }));

      const agent = request.agent(app.getHttpServer());
      const email = `veut-changer${EMAIL_DOMAIN}`;
      const password = 'MotDePasse1';
      await agent
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({ email, password, passwordConfirmation: password }),
        )
        .expect(201);
      await verifyAndLogin(agent, prisma, ORIGIN, email, password);

      const response = await agent
        .patch('/auth/me')
        .set('Origin', ORIGIN)
        .send({ firstName: 'Jeanne', email: takenEmail })
        .expect(409);

      expect((response.body as ErrorResponseBody).message).toContain(
        'existe déjà',
      );
    });

    it('refuse un prénom trop court', async () => {
      const agent = request.agent(app.getHttpServer());
      const email = `profil-invalide${EMAIL_DOMAIN}`;
      const password = 'MotDePasse1';
      await agent
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({ email, password, passwordConfirmation: password }),
        )
        .expect(201);
      await verifyAndLogin(agent, prisma, ORIGIN, email, password);

      const response = await agent
        .patch('/auth/me')
        .set('Origin', ORIGIN)
        .send({ firstName: 'J', email })
        .expect(400);

      expect(
        (response.body as ErrorResponseBody).errors?.firstName,
      ).toBeDefined();
    });
  });

  describe('POST /auth/me/password', () => {
    it('refuse une requête non authentifiée', async () => {
      await request(app.getHttpServer())
        .post('/auth/me/password')
        .set('Origin', ORIGIN)
        .send({
          currentPassword: 'MotDePasse1',
          newPassword: 'NouveauMotDePasse1',
          newPasswordConfirmation: 'NouveauMotDePasse1',
        })
        .expect(401);
    });

    it('change le mot de passe quand l’actuel est correct, et le nouveau fonctionne à la connexion', async () => {
      // Des échecs de connexion accumulés par d'autres tests de ce fichier
      // (même IP source) ne doivent pas faire échouer les tentatives légitimes
      // vérifiées ici — voir le test de limitation plus haut, qui pollue
      // volontairement ce compteur.
      await prisma.loginAttempt.deleteMany({});

      const agent = request.agent(app.getHttpServer());
      const email = `mdp${EMAIL_DOMAIN}`;
      const password = 'MotDePasse1';
      const newPassword = 'NouveauMotDePasse1';

      await agent
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({ email, password, passwordConfirmation: password }),
        )
        .expect(201);
      await verifyAndLogin(agent, prisma, ORIGIN, email, password);

      await agent
        .post('/auth/me/password')
        .set('Origin', ORIGIN)
        .send({
          currentPassword: password,
          newPassword,
          newPasswordConfirmation: newPassword,
        })
        .expect(204);

      // La session courante reste valide juste après le changement.
      await agent.get('/auth/me').expect(200);

      // L'ancien mot de passe ne fonctionne plus, le nouveau si.
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', ORIGIN)
        .send({ email, password })
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', ORIGIN)
        .send({ email, password: newPassword })
        .expect(200);
    });

    it('révoque les autres sessions actives, sans déconnecter celle qui a fait le changement', async () => {
      // Voir le commentaire équivalent ci-dessus : ce test se connecte deux
      // fois, il ne doit pas hériter du compteur d'échecs d'un test précédent.
      await prisma.loginAttempt.deleteMany({});

      const email = `mdp-sessions${EMAIL_DOMAIN}`;
      const password = 'MotDePasse1';
      const newPassword = 'NouveauMotDePasse1';

      const registerAgent = request.agent(app.getHttpServer());
      await registerAgent
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({ email, password, passwordConfirmation: password }),
        )
        .expect(201);
      await verifyAndLogin(registerAgent, prisma, ORIGIN, email, password);

      // Une deuxième session, ouverte séparément (agent distinct = cookie distinct).
      const otherAgent = request.agent(app.getHttpServer());
      await otherAgent
        .post('/auth/login')
        .set('Origin', ORIGIN)
        .send({ email, password })
        .expect(200);
      await otherAgent.get('/auth/me').expect(200);

      await registerAgent
        .post('/auth/me/password')
        .set('Origin', ORIGIN)
        .send({
          currentPassword: password,
          newPassword,
          newPasswordConfirmation: newPassword,
        })
        .expect(204);

      // La session qui a changé le mot de passe reste valide…
      await registerAgent.get('/auth/me').expect(200);
      // … l'autre session active au moment du changement est révoquée.
      await otherAgent.get('/auth/me').expect(401);
    });

    it('refuse un mot de passe actuel incorrect', async () => {
      const agent = request.agent(app.getHttpServer());
      const email = `mdp-incorrect${EMAIL_DOMAIN}`;
      const password = 'MotDePasse1';
      await agent
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({ email, password, passwordConfirmation: password }),
        )
        .expect(201);
      await verifyAndLogin(agent, prisma, ORIGIN, email, password);

      const response = await agent
        .post('/auth/me/password')
        .set('Origin', ORIGIN)
        .send({
          currentPassword: 'MauvaisMotDePasse1',
          newPassword: 'NouveauMotDePasse1',
          newPasswordConfirmation: 'NouveauMotDePasse1',
        })
        .expect(401);

      expect((response.body as ErrorResponseBody).message).toContain(
        'incorrect',
      );
    });

    it('refuse une confirmation qui ne correspond pas au nouveau mot de passe', async () => {
      const agent = request.agent(app.getHttpServer());
      const email = `mdp-confirmation${EMAIL_DOMAIN}`;
      const password = 'MotDePasse1';
      await agent
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({ email, password, passwordConfirmation: password }),
        )
        .expect(201);
      await verifyAndLogin(agent, prisma, ORIGIN, email, password);

      const response = await agent
        .post('/auth/me/password')
        .set('Origin', ORIGIN)
        .send({
          currentPassword: password,
          newPassword: 'NouveauMotDePasse1',
          newPasswordConfirmation: 'AutreMotDePasse1',
        })
        .expect(400);

      expect(
        (response.body as ErrorResponseBody).errors?.newPasswordConfirmation,
      ).toBeDefined();
    });

    it('refuse un nouveau mot de passe qui ne respecte pas la complexité requise', async () => {
      const agent = request.agent(app.getHttpServer());
      const email = `mdp-faible${EMAIL_DOMAIN}`;
      const password = 'MotDePasse1';
      await agent
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({ email, password, passwordConfirmation: password }),
        )
        .expect(201);
      await verifyAndLogin(agent, prisma, ORIGIN, email, password);

      const response = await agent
        .post('/auth/me/password')
        .set('Origin', ORIGIN)
        .send({
          currentPassword: password,
          newPassword: 'minuscules8',
          newPasswordConfirmation: 'minuscules8',
        })
        .expect(400);

      expect(
        (response.body as ErrorResponseBody).errors?.newPassword,
      ).toBeDefined();
    });
  });

  describe('Cumul de rôles (règle métier n° 23)', () => {
    it('un compte lecteur et auteur accède aux deux périmètres', async () => {
      const agent = request.agent(app.getHttpServer());
      const email = `double-role${EMAIL_DOMAIN}`;
      const password = 'MotDePasse1';

      await agent
        .post('/auth/register')
        .set('Origin', ORIGIN)
        .send(
          registerPayload({ email, password, passwordConfirmation: password }),
        )
        .expect(201);
      await verifyAndLogin(agent, prisma, ORIGIN, email, password);

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const authorRole = await prisma.role.findUniqueOrThrow({
        where: { name: 'author' },
      });
      await prisma.userRole.create({
        data: { userId: user.id, roleId: authorRole.id },
      });

      const response = await agent.get('/auth/me').expect(200);
      const roles = (response.body as AuthUserResponse).roles;
      expect(roles).toEqual(expect.arrayContaining(['reader', 'author']));
      expect(roles).toHaveLength(2);
    });
  });
});
