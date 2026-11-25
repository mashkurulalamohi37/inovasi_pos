import express from 'express';
import bcrypt from 'bcryptjs';
import { query, getClient } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { isPlatformAdmin } from '../lib/tenant-context.js';
import { generateUniqueCompanyCode, slugifySubdomain } from '../lib/company-code.js';
import { ensureUniqueTenantSlug } from '../lib/tenant-context.js';
import { getSafeErrorMessage } from '../lib/errors.js';
import { writeAuditLog } from '../lib/audit-log.js';
import { resolveUserRoleEnumLabel } from '../lib/user-role-enum.js';

const router = express.Router();

async function requirePlatformAdmin(req: express.Request, res: express.Response): Promise<boolean> {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  if (!(await isPlatformAdmin(userId))) {
    res.status(403).json({ error: 'Platform admin access required' });
    return false;
  }
  return true;
}

/** Dashboard metrics */
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    if (!(await requirePlatformAdmin(req, res))) return;
    const stats = await query(`
      SELECT
        (SELECT COUNT(*)::int FROM public.tenants WHERE status = 'active') AS active_tenants,
        (SELECT COUNT(*)::int FROM public.tenants WHERE status = 'suspended') AS suspended_tenants,
        (SELECT COUNT(*)::int FROM public.tenant_members WHERE status = 'active') AS active_employees,
        (SELECT COUNT(*)::int FROM public.tenants WHERE plan_code = 'trial') AS trial_tenants,
        (SELECT COUNT(*)::int FROM public.tenants WHERE status = 'pending_approval') AS pending_approval_tenants
    `);
    res.json(stats.rows[0]);
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to load dashboard') });
  }
});

/** List all companies */
router.get('/tenants', authenticateToken, async (req, res) => {
  try {
    if (!(await requirePlatformAdmin(req, res))) return;
    const result = await query(
      `SELECT t.*,
        (SELECT COUNT(*)::int FROM public.tenant_members tm WHERE tm.tenant_id = t.id AND tm.status = 'active') AS employee_count,
        (SELECT COUNT(*)::int FROM public.locations l WHERE l.tenant_id = t.id) AS location_count
       FROM public.tenants t
       WHERE t.status <> 'deleted'
       ORDER BY t.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to list tenants') });
  }
});

/** Create company (full onboarding) */
router.post('/tenants', authenticateToken, async (req, res) => {
  const client = await getClient();
  try {
    if (!(await requirePlatformAdmin(req, res))) return;

    const {
      name,
      logo_url,
      contact_person,
      phone,
      email,
      address,
      company_code,
      subdomain_slug,
      plan_code,
      enabled_modules,
      feature_flags,
      status,
      billing_email,
      admin_email,
      admin_password,
      admin_display_name,
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const slug = await ensureUniqueTenantSlug(slugifySubdomain(name));
    const code =
      company_code?.trim().toUpperCase() ||
      (await generateUniqueCompanyCode(name));
    const subSlug = subdomain_slug?.trim()
      ? await ensureUniqueTenantSlug(slugifySubdomain(subdomain_slug))
      : null;

    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 14);

    await client.query('BEGIN');

    const tenantInsert = await client.query(
      `INSERT INTO public.tenants (
        name, slug, company_code, subdomain_slug, logo_url, contact_person, phone, email, address,
        plan_code, status, trial_ends_at, billing_email, enabled_modules, feature_flags
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *`,
      [
        name.trim(),
        slug,
        code,
        subSlug,
        logo_url || null,
        contact_person || null,
        phone || null,
        email || null,
        address || null,
        plan_code || 'trial',
        status || 'active',
        trialEnds.toISOString(),
        billing_email || email || null,
        JSON.stringify(enabled_modules || ['pos', 'inventory', 'purchasing', 'accounts', 'reports']),
        JSON.stringify(feature_flags || {}),
      ]
    );
    const tenant = tenantInsert.rows[0];
    const tenantId = String(tenant.id);

    await client.query(
      `INSERT INTO public.locations (id, name, is_active, tenant_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, TRUE, $2, NOW(), NOW())`,
      [`${name.trim()} — Main Store`, tenantId]
    );

    let adminUserId: string | null = null;
    if (admin_email && admin_password) {
      const normalizedEmail = String(admin_email).toLowerCase().trim();
      const hashed = await bcrypt.hash(String(admin_password), 10);
      const userResult = await client.query(
        `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW(), NOW())
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [normalizedEmail, hashed]
      );
      if (userResult.rows[0]) {
        adminUserId = String(userResult.rows[0].id);
      } else {
        const existing = await client.query('SELECT id FROM auth.users WHERE email = $1', [
          normalizedEmail,
        ]);
        adminUserId = existing.rows[0] ? String(existing.rows[0].id) : null;
      }
      if (adminUserId) {
        await client.query(
          `INSERT INTO public.profiles (id, user_id, display_name, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
           ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name`,
          [adminUserId, admin_display_name || name]
        );
        const adminLabel = await resolveUserRoleEnumLabel('admin');
        await client.query('DELETE FROM public.user_roles WHERE user_id = $1', [adminUserId]);
        await client.query(
          `INSERT INTO public.user_roles (id, user_id, role, created_at) VALUES (gen_random_uuid(), $1, $2, NOW())`,
          [adminUserId, adminLabel]
        );
        await client.query(
          `INSERT INTO public.tenant_members (tenant_id, user_id, member_role, status, is_default, joined_at)
           VALUES ($1, $2, 'tenant_admin', 'active', TRUE, NOW())
           ON CONFLICT (tenant_id, user_id) DO UPDATE SET member_role = 'tenant_admin', status = 'active'`,
          [tenantId, adminUserId]
        );
      }
    }

    await client.query('COMMIT');

    await writeAuditLog({
      tenantId,
      userId: req.user!.userId,
      action: 'tenant.created',
      resourceType: 'tenant',
      resourceId: tenantId,
      newValues: { name, company_code: code },
      req,
    });

    res.status(201).json({ tenant, company_code: code, admin_user_id: adminUserId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create tenant error:', error);
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to create company') });
  } finally {
    client.release();
  }
});

/** Approve self-registered organization → owner becomes platform_admin with all modules */
router.post('/tenants/:tenantId/approve', authenticateToken, async (req, res) => {
  try {
    if (!(await requirePlatformAdmin(req, res))) return;
    const { tenantId } = req.params;
    const { activateApprovedOrganizationOwner } = await import(
      '../lib/activate-approved-owner.js'
    );
    try {
      const { tenant } = await activateApprovedOrganizationOwner(
        tenantId,
        req.user!.userId
      );
      res.json({ tenant });
    } catch (err) {
      if (err instanceof Error && err.message === 'TENANT_NOT_PENDING') {
        const exists = await query('SELECT * FROM public.tenants WHERE id = $1', [tenantId]);
        if (exists.rows.length === 0) {
          return res.status(404).json({ error: 'Company not found' });
        }
        const row = exists.rows[0] as { status?: string };
        if (row.status === 'active') {
          const { promoteTenantOwnerToPlatformAdmin } = await import(
            '../lib/activate-approved-owner.js'
          );
          await promoteTenantOwnerToPlatformAdmin(tenantId);
          return res.json({ tenant: exists.rows[0], synced_owner_role: true });
        }
        return res.status(400).json({
          error: `Company is not pending approval (status: ${row.status})`,
        });
      }
      throw err;
    }
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to approve company') });
  }
});

router.patch('/tenants/:tenantId', authenticateToken, async (req, res) => {
  try {
    if (!(await requirePlatformAdmin(req, res))) return;
    const { tenantId } = req.params;
    const fields = [
      'name',
      'logo_url',
      'contact_person',
      'phone',
      'email',
      'address',
      'plan_code',
      'status',
      'billing_email',
      'theme_primary',
      'subdomain_slug',
    ] as const;
    const updates: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${i++}`);
        params.push(req.body[f]);
      }
    }
    if (req.body.enabled_modules !== undefined) {
      updates.push(`enabled_modules = $${i++}`);
      params.push(JSON.stringify(req.body.enabled_modules));
    }
    if (req.body.feature_flags !== undefined) {
      updates.push(`feature_flags = $${i++}`);
      params.push(JSON.stringify(req.body.feature_flags));
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    updates.push('updated_at = NOW()');
    params.push(tenantId);
    await query(
      `UPDATE public.tenants SET ${updates.join(', ')} WHERE id = $${i}`,
      params
    );
    const tenant = await query('SELECT * FROM public.tenants WHERE id = $1', [tenantId]);
    await writeAuditLog({
      tenantId,
      userId: req.user!.userId,
      action: 'tenant.updated',
      resourceType: 'tenant',
      resourceId: tenantId,
      newValues: req.body,
      req,
    });
    res.json({ tenant: tenant.rows[0] });
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to update tenant') });
  }
});

/** Employees for a tenant */
router.get('/tenants/:tenantId/employees', authenticateToken, async (req, res) => {
  try {
    if (!(await requirePlatformAdmin(req, res))) return;
    const result = await query(
      `SELECT tm.*, u.email, p.display_name, p.phone
       FROM public.tenant_members tm
       INNER JOIN auth.users u ON u.id = tm.user_id
       LEFT JOIN public.profiles p ON p.user_id = tm.user_id
       WHERE tm.tenant_id = $1
       ORDER BY tm.created_at DESC`,
      [req.params.tenantId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to list employees') });
  }
});

/** Subscription packages (plans) */
router.get('/plans', authenticateToken, async (req, res) => {
  try {
    if (!(await requirePlatformAdmin(req, res))) return;
    const result = await query(
      `SELECT code, name, max_users, max_locations, price_monthly, features, is_active, created_at
       FROM public.subscription_plans
       ORDER BY price_monthly ASC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to list plans') });
  }
});

router.post('/plans', authenticateToken, async (req, res) => {
  try {
    if (!(await requirePlatformAdmin(req, res))) return;
    const { code, name, max_users, max_locations, price_monthly, features, is_active } = req.body;
    if (!code?.trim() || !name?.trim()) {
      return res.status(400).json({ error: 'Plan code and name are required' });
    }
    const result = await query(
      `INSERT INTO public.subscription_plans (code, name, max_users, max_locations, price_monthly, features, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        String(code).trim().toLowerCase(),
        String(name).trim(),
        Number(max_users ?? 5),
        Number(max_locations ?? 1),
        Number(price_monthly ?? 0),
        JSON.stringify(features ?? {}),
        is_active !== false,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to create plan') });
  }
});

router.patch('/plans/:code', authenticateToken, async (req, res) => {
  try {
    if (!(await requirePlatformAdmin(req, res))) return;
    const { code } = req.params;
    const fields = ['name', 'max_users', 'max_locations', 'price_monthly', 'is_active'] as const;
    const updates: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${i++}`);
        params.push(req.body[f]);
      }
    }
    if (req.body.features !== undefined) {
      updates.push(`features = $${i++}`);
      params.push(JSON.stringify(req.body.features));
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    params.push(code);
    const result = await query(
      `UPDATE public.subscription_plans SET ${updates.join(', ')} WHERE code = $${i} RETURNING *`,
      params
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to update plan') });
  }
});

router.delete('/plans/:code', authenticateToken, async (req, res) => {
  try {
    if (!(await requirePlatformAdmin(req, res))) return;
    const { code } = req.params;
    const inUse = await query(
      'SELECT 1 FROM public.tenants WHERE plan_code = $1 LIMIT 1',
      [code]
    );
    if (inUse.rows.length > 0) {
      await query(
        'UPDATE public.subscription_plans SET is_active = FALSE WHERE code = $1',
        [code]
      );
      return res.json({ deactivated: true, message: 'Plan deactivated (tenants still reference it)' });
    }
    await query('DELETE FROM public.subscription_plans WHERE code = $1', [code]);
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to delete plan') });
  }
});

/** All users across tenants (super-admin directory) */
router.get('/users', authenticateToken, async (req, res) => {
  try {
    if (!(await requirePlatformAdmin(req, res))) return;
    const search = String(req.query.search || '').trim().toLowerCase();
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const params: unknown[] = [limit];
    let where = '';
    if (search) {
      where = `WHERE lower(u.email) LIKE $2 OR lower(coalesce(p.display_name, '')) LIKE $2`;
      params.push(`%${search}%`);
    }
    const result = await query(
      `SELECT u.id AS user_id, u.email, p.display_name, p.phone,
        COALESCE(
          json_agg(
            json_build_object(
              'tenant_id', t.id,
              'tenant_name', t.name,
              'company_code', t.company_code,
              'member_role', tm.member_role,
              'status', tm.status
            )
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'::json
        ) AS memberships
       FROM auth.users u
       LEFT JOIN public.profiles p ON p.user_id = u.id
       LEFT JOIN public.tenant_members tm ON tm.user_id = u.id
       LEFT JOIN public.tenants t ON t.id = tm.tenant_id AND t.status <> 'deleted'
       ${where}
       GROUP BY u.id, u.email, p.display_name, p.phone
       ORDER BY u.email
       LIMIT $1`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to list users') });
  }
});

/** Suspend or reactivate a user (all memberships or one tenant) */
router.patch('/users/:userId/membership-status', authenticateToken, async (req, res) => {
  try {
    if (!(await requirePlatformAdmin(req, res))) return;
    const { userId } = req.params;
    const { tenant_id, status } = req.body as { tenant_id?: string; status?: string };
    const nextStatus = status === 'active' ? 'active' : 'suspended';
    if (!['active', 'suspended'].includes(nextStatus)) {
      return res.status(400).json({ error: 'status must be active or suspended' });
    }
    if (tenant_id) {
      await query(
        `UPDATE public.tenant_members SET status = $1 WHERE user_id = $2 AND tenant_id = $3`,
        [nextStatus, userId, tenant_id]
      );
    } else {
      await query(
        `UPDATE public.tenant_members SET status = $1 WHERE user_id = $2`,
        [nextStatus, userId]
      );
    }
    res.json({ ok: true, status: nextStatus });
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to update user status') });
  }
});

/** Allocate / renew a subscription package for a company */
router.post('/tenants/:tenantId/allocate-plan', authenticateToken, async (req, res) => {
  const client = await getClient();
  try {
    if (!(await requirePlatformAdmin(req, res))) return;
    const { tenantId } = req.params;
    const {
      plan_code,
      period_months,
      amount,
      currency,
      payment_method,
      reference_no,
      notes,
      valid_until,
    } = req.body;

    if (!plan_code?.trim()) {
      return res.status(400).json({ error: 'plan_code is required' });
    }

    const planCheck = await query(
      'SELECT 1 FROM public.subscription_plans WHERE code = $1',
      [plan_code]
    );
    if (planCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Unknown subscription plan' });
    }

    const months = Math.max(1, Number(period_months) || 1);
    const validFrom = new Date();
    let validUntilDate = valid_until ? new Date(String(valid_until)) : new Date();
    if (!valid_until) {
      validUntilDate = new Date(validFrom);
      validUntilDate.setMonth(validUntilDate.getMonth() + months);
    }

    const payAmount = Number(amount ?? 0);
    const method = String(payment_method || 'manual').toLowerCase();
    const orderStatus =
      payAmount > 0 && (method === 'pending' || method === 'invoice') ? 'pending' : 'paid';
    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

    await client.query('BEGIN');

    await client.query(
      `UPDATE public.tenants
       SET plan_code = $1, plan_valid_until = $2, status = 'active', updated_at = NOW()
       WHERE id = $3`,
      [plan_code, validUntilDate.toISOString(), tenantId]
    );

    const order = await client.query(
      `INSERT INTO public.tenant_subscription_orders (
        tenant_id, plan_code, amount, currency, period_months,
        valid_from, valid_until, payment_method, reference_no, notes, allocated_by,
        status, invoice_number
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        tenantId,
        plan_code,
        payAmount,
        currency || 'BDT',
        months,
        validFrom.toISOString(),
        validUntilDate.toISOString(),
        payment_method || null,
        reference_no || null,
        notes || null,
        req.user!.userId,
        orderStatus,
        invoiceNumber,
      ]
    );

    const orderId = order.rows[0]?.id;
    if (payAmount > 0) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);
      await client.query(
        `INSERT INTO public.tenant_subscription_invoices (
          tenant_id, order_id, invoice_number, amount, currency, status, due_date, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          tenantId,
          orderId,
          invoiceNumber,
          payAmount,
          currency || 'BDT',
          orderStatus === 'paid' ? 'paid' : 'pending',
          dueDate.toISOString(),
          notes || null,
        ]
      );
    }

    const notifySeverity = orderStatus === 'pending' ? 'warning' : 'success';
    const notifyTitle =
      orderStatus === 'pending' ? 'Invoice issued — payment pending' : 'Subscription updated';
    const notifyMessage =
      orderStatus === 'pending'
        ? `Invoice ${invoiceNumber} for ${plan_code} (${payAmount} ${currency || 'BDT'}) is due. Plan active until ${validUntilDate.toLocaleDateString()}.`
        : `Your workspace is on the ${plan_code} plan until ${validUntilDate.toLocaleDateString()}.`;

    await client.query(
      `INSERT INTO public.tenant_platform_notifications (tenant_id, title, message, severity, source, metadata)
       VALUES ($1, $2, $3, $4, 'platform', $5)`,
      [
        tenantId,
        notifyTitle,
        notifyMessage,
        notifySeverity,
        JSON.stringify({
          plan_code,
          valid_until: validUntilDate.toISOString(),
          invoice_number: invoiceNumber,
          order_status: orderStatus,
        }),
      ]
    );

    await client.query('COMMIT');

    const tenant = await query('SELECT * FROM public.tenants WHERE id = $1', [tenantId]);
    res.json({ tenant: tenant.rows[0], order: order.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to allocate plan') });
  } finally {
    client.release();
  }
});

/** Platform notifications (per tenant or broadcast) */
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    if (!(await requirePlatformAdmin(req, res))) return;
    const tenantId = req.query.tenant_id as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const params: unknown[] = [limit];
    let filter = '';
    if (tenantId) {
      filter = 'WHERE n.tenant_id = $2';
      params.push(tenantId);
    }
    const result = await query(
      `SELECT n.*, t.name AS tenant_name, t.company_code
       FROM public.tenant_platform_notifications n
       INNER JOIN public.tenants t ON t.id = n.tenant_id
       ${filter}
       ORDER BY n.created_at DESC
       LIMIT $1`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to list notifications') });
  }
});

router.post('/notifications', authenticateToken, async (req, res) => {
  try {
    if (!(await requirePlatformAdmin(req, res))) return;
    const { tenant_id, tenant_ids, title, message, severity, broadcast_all } = req.body;
    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ error: 'Title and message are required' });
    }
    const sev = ['info', 'warning', 'success', 'error'].includes(severity) ? severity : 'info';

    let targetIds: string[] = [];
    if (broadcast_all) {
      const rows = await query(
        `SELECT id FROM public.tenants WHERE status NOT IN ('deleted', 'cancelled')`
      );
      targetIds = rows.rows.map((r) => String(r.id));
    } else if (Array.isArray(tenant_ids) && tenant_ids.length > 0) {
      targetIds = tenant_ids.map(String);
    } else if (tenant_id) {
      targetIds = [String(tenant_id)];
    } else {
      return res.status(400).json({ error: 'Specify tenant_id, tenant_ids, or broadcast_all' });
    }

    const inserted: unknown[] = [];
    for (const tid of targetIds) {
      const r = await query(
        `INSERT INTO public.tenant_platform_notifications (tenant_id, title, message, severity, source)
         VALUES ($1, $2, $3, $4, 'platform')
         RETURNING *`,
        [tid, title.trim(), message.trim(), sev]
      );
      inserted.push(r.rows[0]);
    }

    res.status(201).json({ count: inserted.length, notifications: inserted });
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to send notification') });
  }
});

router.get('/audit-logs', authenticateToken, async (req, res) => {
  try {
    if (!(await requirePlatformAdmin(req, res))) return;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const result = await query(
      `SELECT * FROM public.saas_audit_logs ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to load audit logs') });
  }
});

export default router;
