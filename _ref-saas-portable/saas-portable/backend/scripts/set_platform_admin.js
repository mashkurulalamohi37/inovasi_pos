/**
 * Promote a user to platform_admin (SaaS operator).
 * Usage: node scripts/set_platform_admin.js user@example.com
 */
import { query } from '../config/database.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/set_platform_admin.js <email>');
  process.exit(1);
}

async function main() {
  const user = await query('SELECT id FROM auth.users WHERE lower(email) = lower($1)', [
    email.trim(),
  ]);
  if (user.rows.length === 0) {
    console.error('User not found:', email);
    process.exit(1);
  }
  const userId = user.rows[0].id;

  const enumRow = await query(
    `
    SELECT e.enumlabel
    FROM pg_attribute a
    JOIN pg_type t ON a.atttypid = t.oid
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE a.attrelid = 'public.user_roles'::regclass
      AND a.attname = 'role'
      AND lower(e.enumlabel) = 'platform_admin'
    LIMIT 1
    `
  );
  const label = enumRow.rows[0]?.enumlabel || 'platform_admin';

  await query('DELETE FROM public.user_roles WHERE user_id = $1', [userId]);
  await query(
    `INSERT INTO public.user_roles (id, user_id, role, created_at)
     VALUES (gen_random_uuid(), $1, $2, NOW())`,
    [userId, label]
  );

  console.log(`✅ ${email} is now platform_admin (${label})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
