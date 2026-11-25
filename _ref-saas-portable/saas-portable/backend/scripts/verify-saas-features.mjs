/**
 * End-to-end verification for SaaS / super-admin / mother-account features.
 * Usage: node scripts/verify-saas-features.mjs
 */
import bcrypt from 'bcryptjs';
import pg from 'pg';

const API = process.env.API_BASE || 'http://127.0.0.1:13002/api';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 15432),
  database: process.env.DB_NAME || 'mediflow',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

const results = [];

function pass(name, detail = '') {
  results.push({ ok: true, name, detail });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  results.push({ ok: false, name, detail });
  console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, opts = {}) {
  const { headers: extraHeaders, ...rest } = opts;
  const res = await fetch(`${API}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

async function login(email, password, companyCode) {
  const { status, body } = await api('/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password, companyCode }),
  });
  if (status !== 200 || !body?.token) {
    throw new Error(`Login failed ${email}: ${status} ${JSON.stringify(body)}`);
  }
  return body.token;
}

async function main() {
  console.log('=== SaaS feature verification ===\n');
  console.log(`API: ${API}\n`);

  // 0. API up
  try {
    const plans = await api('/tenants/plans');
    if (plans.status === 200 && Array.isArray(plans.body)) {
      pass('Public subscription plans', `${plans.body.length} plans`);
    } else {
      fail('Public subscription plans', `status ${plans.status}`);
    }
  } catch (e) {
    fail('API reachable', e.message);
    console.log('\nStart server: cd server; npm run dev');
    process.exit(1);
  }

  // 1. DB schema
  const cols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants'
      AND column_name IN ('approved_at', 'plan_valid_until')
  `);
  if (cols.rows.length >= 2) pass('Migration columns on tenants');
  else fail('Migration columns on tenants', `found ${cols.rows.length}/2`);

  const inv = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'tenant_subscription_invoices'`
  );
  if (inv.rows.length) pass('tenant_subscription_invoices table');
  else fail('tenant_subscription_invoices table');

  const notif = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'tenant_platform_notifications'`
  );
  if (notif.rows.length) pass('tenant_platform_notifications table');
  else fail('tenant_platform_notifications table');

  const statusCheck = await pool.query(`
    SELECT conname FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'tenants' AND c.conname = 'tenants_status_check'
  `);
  if (statusCheck.rows.length) pass('tenants status constraint exists');
  else fail('tenants status constraint');

  // 2. Platform operator login
  let platformToken;
  try {
    platformToken = await login('admin@mediflow.com', 'admin123', 'DEFAULT-6a92');
    pass('Platform operator login (admin@mediflow.com)');
  } catch (e) {
    fail('Platform operator login', e.message);
  }

  if (platformToken) {
    const me = await api('/auth/me', {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    if (me.body?.is_platform_operator) pass('/auth/me is_platform_operator');
    else fail('/auth/me is_platform_operator', JSON.stringify(me.body));

    const dash = await api('/saas-admin/dashboard', {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    if (dash.status === 200 && dash.body?.active_tenants != null) {
      pass('Super-admin dashboard', `pending=${dash.body.pending_approval_tenants ?? '?'}`);
    } else fail('Super-admin dashboard', `status ${dash.status}`);

    const saasPlans = await api('/saas-admin/plans', {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    if (saasPlans.status === 200 && Array.isArray(saasPlans.body)) {
      pass('Super-admin list plans', `${saasPlans.body.length} plans`);
    } else fail('Super-admin list plans');

    const saasUsers = await api('/saas-admin/users?limit=5', {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    if (saasUsers.status === 200 && Array.isArray(saasUsers.body)) {
      pass('Super-admin list users');
    } else fail('Super-admin list users');
  }

  // 3. Register pending org
  const testEmail = `saas-verify-${Date.now()}@test.local`;
  const testOrg = `Verify Pharmacy ${Date.now()}`;
  let pendingTenantId;
  let ownerToken;

  const reg = await api('/tenants/register', {
    method: 'POST',
    body: JSON.stringify({
      organizationName: testOrg,
      email: testEmail,
      password: 'testpass123',
      displayName: 'Verify Owner',
    }),
  });

  if (reg.status === 201 && reg.body?.tenant?.id) {
    pendingTenantId = reg.body.tenant.id;
    ownerToken = reg.body.token;
    const st = reg.body.tenant.status;
    if (st === 'pending_approval') pass('Org signup → pending_approval');
    else fail('Org signup status', `got ${st}`);
    if (reg.body.pending_approval) pass('Signup response pending_approval flag');
  } else {
    fail('Org signup', `${reg.status} ${JSON.stringify(reg.body)}`);
  }

  if (ownerToken && pendingTenantId) {
    // Pending blocks inventory
    const invBlocked = await api('/inventory/medicines?limit=1', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (invBlocked.status === 403 && invBlocked.body?.code === 'TENANT_PENDING_APPROVAL') {
      pass('Pending org blocked from business API');
    } else {
      fail('Pending org API block', `status ${invBlocked.status} code=${invBlocked.body?.code}`);
    }

    // Billing allowed while pending
    const billing = await api('/billing/subscription', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (billing.status === 200) pass('Pending org can read billing/subscription');
    else fail('Billing while pending', `status ${billing.status}`);

    const tenantNotif = await api('/tenant-notifications', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (tenantNotif.status === 200) pass('Pending org can read tenant-notifications');
    else fail('Tenant notifications while pending', `status ${tenantNotif.status}`);

    const current = await api('/tenants/current', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (current.status === 200 && current.body?.member_role === 'owner') {
      pass('Owner member_role on /tenants/current');
    } else {
      fail('Owner member_role', JSON.stringify(current.body));
    }
  }

  // 4. Approve tenant
  if (platformToken && pendingTenantId) {
    const approve = await api(`/saas-admin/tenants/${pendingTenantId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    if (approve.status === 200 && approve.body?.tenant?.status === 'active') {
      pass('Super-admin approve organization');
    } else {
      fail('Approve organization', `${approve.status} ${JSON.stringify(approve.body)}`);
    }

    if (ownerToken) {
      const invOk = await api('/inventory/medicines?limit=1', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      if (invOk.status === 200) pass('Approved org can access inventory API');
      else fail('Approved org inventory', `status ${invOk.status}`);
    }

    // Allocate plan + invoice
    const alloc = await api(`/saas-admin/tenants/${pendingTenantId}/allocate-plan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${platformToken}` },
      body: JSON.stringify({
        plan_code: 'starter',
        period_months: 1,
        amount: 99,
        payment_method: 'pending',
        reference_no: 'VERIFY-001',
      }),
    });
    if (alloc.status === 200) pass('Allocate package to tenant');
    else fail('Allocate package', `${alloc.status} ${JSON.stringify(alloc.body)}`);

    if (ownerToken) {
      const bill2 = await api('/billing/subscription', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const pendingCount = bill2.body?.pending_payments?.length ?? 0;
      const invCount = bill2.body?.subscription_invoices?.length ?? 0;
      if (bill2.status === 200 && pendingCount > 0 && invCount > 0) {
        pass('Billing shows pending + invoices', `pending=${pendingCount} invoices=${invCount}`);
      } else {
        fail('Billing pending/invoices', `pending=${pendingCount} invoices=${invCount}`);
      }
    }
  }

  // 5. Transfer owner (create staff, transfer)
  if (ownerToken && pendingTenantId && platformToken) {
    const staffEmail = `staff-${Date.now()}@test.local`;
    const staffPass = 'staffpass123';
    const hashed = await bcrypt.hash(staffPass, 10);
    const userIns = await pool.query(
      `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, created_at, updated_at)
       VALUES ($1,$2,NOW(),NOW(),NOW()) RETURNING id`,
      [staffEmail, hashed]
    );
    const staffId = userIns.rows[0].id;
    await pool.query(
      `INSERT INTO public.tenant_members (tenant_id, user_id, member_role, status, is_default)
       VALUES ($1,$2,'tenant_admin','active',FALSE)`,
      [pendingTenantId, staffId]
    );
    pass('Created staff member for transfer test');

    const transfer = await api('/tenants/current/transfer-owner', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ user_id: String(staffId) }),
    });
    if (transfer.status === 200) pass('Transfer mother account (owner)');
    else fail('Transfer owner', `${transfer.status} ${JSON.stringify(transfer.body)}`);

    const owners = await pool.query(
      `SELECT member_role FROM public.tenant_members WHERE tenant_id = $1 AND user_id = $2`,
      [pendingTenantId, staffId]
    );
    if (owners.rows[0]?.member_role === 'owner') pass('New owner role in DB');
    else fail('New owner role in DB', owners.rows[0]?.member_role);
  }

  // Cleanup test data
  if (pendingTenantId) {
    await pool.query('DELETE FROM public.tenant_platform_notifications WHERE tenant_id = $1', [
      pendingTenantId,
    ]);
    await pool.query('DELETE FROM public.tenant_subscription_invoices WHERE tenant_id = $1', [
      pendingTenantId,
    ]);
    await pool.query('DELETE FROM public.tenant_subscription_orders WHERE tenant_id = $1', [
      pendingTenantId,
    ]);
    await pool.query('DELETE FROM public.tenant_members WHERE tenant_id = $1', [pendingTenantId]);
    await pool.query('DELETE FROM public.locations WHERE tenant_id = $1', [pendingTenantId]);
    await pool.query('DELETE FROM public.tenants WHERE id = $1', [pendingTenantId]);
    console.log('\n(cleaned up test tenant)');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    console.log('\nFailed:');
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
