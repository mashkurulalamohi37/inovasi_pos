/** Frontend path → enabled_modules key (matches server tenant-modules.ts). */
export const PATH_TO_MODULE: Record<string, string> = {
  '/pos': 'pos',
  '/sales-history': 'pos',
  '/prescriptions': 'prescription',
  '/dispensing': 'prescription',
  '/patients': 'patient',
  '/inventory': 'inventory',
  '/opening-stock': 'inventory',
  '/adjustment': 'inventory',
  '/item-stock-report': 'reports',
  '/batch-stock-report': 'reports',
  '/requisition': 'inventory',
  '/purchasing': 'purchasing',
  '/receive': 'purchasing',
  '/stock': 'inventory',
  '/accounts': 'accounts',
  '/ecommerce': 'ecommerce',
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

export function resolveModuleForPath(path: string): string | null {
  for (const [prefix, mod] of Object.entries(PATH_TO_MODULE)) {
    if (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(prefix)) {
      return mod;
    }
  }
  return null;
}

export function isModuleEnabledForPath(
  enabledModules: string[] | undefined,
  path: string
): boolean {
  if (!enabledModules?.length) return true;
  const mod = resolveModuleForPath(path);
  if (!mod) return true;
  const list = enabledModules.map((m) => m.toLowerCase());
  const aliases = MODULE_ALIASES[mod] ?? [mod];
  return aliases.some((a) => list.includes(a));
}
