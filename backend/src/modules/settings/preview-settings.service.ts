import { Injectable } from '@nestjs/common';
import { ActivityLogService } from '../../common/activity-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PreviewSettingsResponse,
  UpdatePreviewSettingsDto,
} from './dto/preview-settings.dto';

const KEYS = {
  enabled: 'preview.enabled',
  maxPagesPublic: 'preview.max_pages_public',
  maxPagesReader: 'preview.max_pages_reader',
  watermarkEnabled: 'preview.watermark_enabled',
  maxRenderPages: 'preview.max_render_pages',
} as const;

/** Valeurs par défaut explicitement demandées (brief §4) — appliquées tant
 * qu'aucun réglage n'a été enregistré en base. */
const DEFAULTS: PreviewSettingsResponse = {
  enabled: true,
  maxPagesPublic: 3,
  maxPagesReader: 5,
  watermarkEnabled: true,
  maxRenderPages: 60,
};

@Injectable()
export class PreviewSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async get(): Promise<PreviewSettingsResponse> {
    const rows = await this.prisma.setting.findMany({
      where: { settingKey: { in: Object.values(KEYS) } },
    });
    const byKey = new Map(
      rows.map((row) => [row.settingKey, row.settingValue]),
    );

    return {
      enabled: parseBool(byKey.get(KEYS.enabled), DEFAULTS.enabled),
      maxPagesPublic: parseInt10(
        byKey.get(KEYS.maxPagesPublic),
        DEFAULTS.maxPagesPublic,
      ),
      maxPagesReader: parseInt10(
        byKey.get(KEYS.maxPagesReader),
        DEFAULTS.maxPagesReader,
      ),
      watermarkEnabled: parseBool(
        byKey.get(KEYS.watermarkEnabled),
        DEFAULTS.watermarkEnabled,
      ),
      maxRenderPages: parseInt10(
        byKey.get(KEYS.maxRenderPages),
        DEFAULTS.maxRenderPages,
      ),
    };
  }

  async update(
    dto: UpdatePreviewSettingsDto,
    adminId: string,
  ): Promise<PreviewSettingsResponse> {
    const entries: [string, string, 'boolean' | 'integer'][] = [];
    if (dto.enabled !== undefined) {
      entries.push([KEYS.enabled, String(dto.enabled), 'boolean']);
    }
    if (dto.maxPagesPublic !== undefined) {
      entries.push([
        KEYS.maxPagesPublic,
        String(dto.maxPagesPublic),
        'integer',
      ]);
    }
    if (dto.maxPagesReader !== undefined) {
      entries.push([
        KEYS.maxPagesReader,
        String(dto.maxPagesReader),
        'integer',
      ]);
    }
    if (dto.watermarkEnabled !== undefined) {
      entries.push([
        KEYS.watermarkEnabled,
        String(dto.watermarkEnabled),
        'boolean',
      ]);
    }
    if (dto.maxRenderPages !== undefined) {
      entries.push([
        KEYS.maxRenderPages,
        String(dto.maxRenderPages),
        'integer',
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
        action: 'admin.preview-settings.update',
        entityType: 'setting',
        description: `${settingKey} : ${oldValue ?? '(par défaut)'} → ${settingValue}`,
        oldValues: { [settingKey]: oldValue },
        newValues: { [settingKey]: settingValue },
      });
    }

    return this.get();
  }
}

function parseBool(
  value: string | null | undefined,
  fallback: boolean,
): boolean {
  if (value === null || value === undefined) return fallback;
  return value === 'true';
}

function parseInt10(
  value: string | null | undefined,
  fallback: number,
): number {
  if (value === null || value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
