import { getTenantById } from './tenant-context.js';

/** API mount path → enabled_modules key on tenant. */
export const API_PREFIX_TO_MODULE: Record<string, string> = {
  '/api/sales': 'pos',
  '/api/customers': 'pos',
  '/api/purchasing': 'purchasing',
  '/api/stock': 'inventory',
  '/api/inventory': 'inventory',
  '/api/requisitions': 'inventory',
  '/api/accounts': 'accounts',
  '/api/patients': 'patient',
  '/api/prescriptions': 'prescription',
  '/api/reminders': 'patient',
  '/api/billing': 'accounts',
};

const MODULE_ALIASES: Record<string, string[]> = {
  pos: ['pos', 'sales'],
  inventory: ['inventory', 'stock'],
  purchasing: ['purchasing', 'purchase'],
  patient: ['patient', 'patients'],
  prescription: ['prescription', 'prescriptions'],
  accounts: ['accounts', 'accounting'],
  reports: ['reports', 'report'],
  ecommerce: ['ecommerce'],
};

const DEFAULT_MODULES = [
  'pos',
  'inventory',
  'purchasing',
  'accounts',
  'reports',
  'patient',
  'prescription',
];

export function normalizeModuleCode(code: string): string {
  return String(code || '')
    .toLowerCase()
    .trim();
}

export function isModuleEnabled(
  enabledModules: string[] | undefined,
  moduleKey: string
): boolean {
  const list =
    enabledModules && enabledModules.length > 0
      ? enabledModules.map(normalizeModuleCode)
      : DEFAULT_MODULES.map(normalizeModuleCode);

  const key = normalizeModuleCode(moduleKey);
  const aliases = MODULE_ALIASES[key] ?? [key];
  return aliases.some((a) => list.includes(a));
}

export function resolveModuleForApiPath(originalUrl: string): string | null {
  const path = originalUrl.split('?')[0];
  for (const [prefix, module] of Object.entries(API_PREFIX_TO_MODULE)) {
    if (path.startsWith(prefix)) return module;
  }
  return null;
}

export async function getTenantEnabledModules(tenantId: string): Promise<string[]> {
  const tenant = await getTenantById(tenantId);
  if (!tenant?.enabled_modules?.length) return [...DEFAULT_MODULES];
  return tenant.enabled_modules;
}
