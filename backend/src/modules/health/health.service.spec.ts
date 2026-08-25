import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const buildService = async (isReachable: boolean): Promise<HealthService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: { isReachable: jest.fn().mockResolvedValue(isReachable) },
        },
      ],
    }).compile();

    return moduleRef.get(HealthService);
  };

  it('signale un service sain quand la base répond', async () => {
    const report = await (await buildService(true)).check();

    expect(report.status).toBe('ok');
    expect(report.database).toBe('up');
  });

  it('signale un service dégradé quand la base ne répond pas', async () => {
    const report = await (await buildService(false)).check();

    expect(report.status).toBe('degraded');
    expect(report.database).toBe('down');
  });
});
