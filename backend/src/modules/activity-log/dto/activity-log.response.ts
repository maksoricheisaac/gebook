export interface ActivityLogEntryResponse {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  description: string | null;
  oldValues: unknown;
  newValues: unknown;
  createdAt: string;
}

export interface PaginatedActivityLogResponse {
  data: ActivityLogEntryResponse[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}
