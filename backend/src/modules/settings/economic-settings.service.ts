import { Injectable } from '@nestjs/common';
import { ActivityLogService } from '../../common/activity-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EconomicSettingsResponse,
  UpdateEconomicSettingsDto,
} from './dto/economic-settings.dto';

/**
 * Paramètres du modèle économique liés aux retraits et au simulateur
 * (brief « interface de configuration du modèle économique », §4). Les
 * commissions elles-mêmes restent gérées par `CommissionRule` — cette table
 * ne fait pas doublon, elle couvre ce qui n'a pas encore de modèle dédié :
 * seuils et délais de retrait, frais de retrait, fréquence, mode de
 * validation, devise, et le taux estimé utilisé par le simulateur.
 *
 * Stockée dans la table `settings` générique (clé/valeur) plutôt que dans de
 * nouvelles colonnes : ce sont des réglages plateforme, pas des données
 * métier avec leurs propres relations.
 */
const KEYS = {
  payoutMinThreshold: 'economic.payout_min_threshold',
  payoutDelayDays: 'economic.payout_delay_days',
  payoutFeePercent: 'economic.payout_fee_percent',
  payoutFrequency: 'economic.payout_frequency',
  payoutValidationMode: 'economic.payout_validation_mode',
  payoutCurrency: 'economic.payout_currency',
  simulatorProviderFeePercent: 'economic.simulator_provider_fee_percent',
} as const;

type KeyName = keyof typeof KEYS;

@Injectable()
export class EconomicSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async get(): Promise<EconomicSettingsResponse> {
    const rows = await this.prisma.setting.findMany({
      where: { settingKey: { in: Object.values(KEYS) } },
    });
    const byKey = new Map(
      rows.map((row) => [row.settingKey, row.settingValue]),
    );

    const raw: Record<KeyName, string | null> = {
      payoutMinThreshold: byKey.get(KEYS.payoutMinThreshold) ?? null,
      payoutDelayDays: byKey.get(KEYS.payoutDelayDays) ?? null,
      payoutFeePercent: byKey.get(KEYS.payoutFeePercent) ?? null,
      payoutFrequency: byKey.get(KEYS.payoutFrequency) ?? null,
      payoutValidationMode: byKey.get(KEYS.payoutValidationMode) ?? null,
      payoutCurrency: byKey.get(KEYS.payoutCurrency) ?? null,
      simulatorProviderFeePercent:
        byKey.get(KEYS.simulatorProviderFeePercent) ?? null,
    };

    const undefinedKeys = (Object.keys(KEYS) as KeyName[]).filter(
      (key) => raw[key] === null,
    );

    return {
      payoutMinThreshold: raw.payoutMinThreshold,
      payoutDelayDays:
        raw.payoutDelayDays === null ? null : Number(raw.payoutDelayDays),
      payoutFeePercent: raw.payoutFeePercent,
      payoutFrequency:
        raw.payoutFrequency as EconomicSettingsResponse['payoutFrequency'],
      payoutValidationMode:
        raw.payoutValidationMode as EconomicSettingsResponse['payoutValidationMode'],
      payoutCurrency: raw.payoutCurrency,
      simulatorProviderFeePercent: raw.simulatorProviderFeePercent,
      undefinedKeys: undefinedKeys.map((key) => KEYS[key]),
    };
  }

  /**
   * Écrit uniquement les champs transmis. Chaque changement de valeur est
   * journalisé individuellement (ancienne/nouvelle valeur) — brief §4,
   * historique des changements de configuration.
   */
  async update(
    dto: UpdateEconomicSettingsDto,
    adminId: string,
  ): Promise<EconomicSettingsResponse> {
    const entries: [string, string, 'string' | 'integer' | 'decimal'][] = [];
    if (dto.payoutMinThreshold !== undefined) {
      entries.push([
        KEYS.payoutMinThreshold,
        dto.payoutMinThreshold,
        'decimal',
      ]);
    }
    if (dto.payoutDelayDays !== undefined) {
      entries.push([
        KEYS.payoutDelayDays,
        String(dto.payoutDelayDays),
        'integer',
      ]);
    }
    if (dto.payoutFeePercent !== undefined) {
      entries.push([KEYS.payoutFeePercent, dto.payoutFeePercent, 'decimal']);
    }
    if (dto.payoutFrequency !== undefined) {
      entries.push([KEYS.payoutFrequency, dto.payoutFrequency, 'string']);
    }
    if (dto.payoutValidationMode !== undefined) {
      entries.push([
        KEYS.payoutValidationMode,
        dto.payoutValidationMode,
        'string',
      ]);
    }
    if (dto.payoutCurrency !== undefined) {
      entries.push([KEYS.payoutCurrency, dto.payoutCurrency, 'string']);
    }
    if (dto.simulatorProviderFeePercent !== undefined) {
      entries.push([
        KEYS.simulatorProviderFeePercent,
        dto.simulatorProviderFeePercent,
        'decimal',
      ]);
    }

    const previous = await this.prisma.setting.findMany({
      where: { settingKey: { in: entries.map(([key]) => key) } },
    });
    const previousByKey = new Map(
      previous.map((row) => [row.settingKey, row.settingValue]),
    );

    for (const [settingKey, settingValue, valueType] of entries) {
      const oldValue = previousByKey.get(settingKey) ?? null;
      if (oldValue === settingValue) continue;

      await this.prisma.setting.upsert({
        where: { settingKey },
        create: { settingKey, settingValue, valueType, isPublic: false },
        update: { settingValue, valueType },
      });

      await this.activityLog.record({
        userId: adminId,
        action: 'admin.economic-settings.update',
        entityType: 'setting',
        description: `${settingKey} : ${oldValue ?? '(non défini)'} → ${settingValue}`,
        oldValues: { [settingKey]: oldValue },
        newValues: { [settingKey]: settingValue },
      });
    }

    return this.get();
  }
}
