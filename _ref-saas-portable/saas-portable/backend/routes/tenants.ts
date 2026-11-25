import express from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachTenantContext, requireTenantContext } from '../middleware/tenant.js';
import { getSafeErrorMessage } from '../lib/errors.js';
import {
  assertPlanAllowsLocation,
  assertPlanAllowsUsers,
  getTenantById,
  listTenantsForUser,
  registerOrganization,
  resolveActiveTenantId,
  resolveMembershipForLogin,
  slugifyOrganizationName,
  ensureUniqueTenantSlug,
  isPlatformAdmin,
} from '../lib/tenant-context.js';
import { getPlan, listPlans } from '../lib/subscription-plans.js';
import { getClient } from '../config/database.js';

const router = express.Router();

function signToken(
  userId: string,
  email: string,
  tenantId?: string | null,
  membershipId?: string | null,
  tenantRole?: string | null
): string {
  const jwtSecret = process.env.JWT_SECRET!;
  const tokenExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
  const signOpts: SignOptions = { expiresIn: tokenExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign(
    {
      userId,
      email,
      tenantId: tenantId ?? undefined,
      membershipId: membershipId ?? undefined,
      tenantRole: tenantRole ?? undefined,
    },
    jwtSecret,
    signOpts
  );
}

/** Public: subscription plans for marketing / signup */
router.get('/plans', async (_req, res) => {
  try {
    const plans = await listPlans();
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to load plans') });
  }
});

/** Public: register a new pharmacy organization + owner account */
router.post('/register', async (req, res) => {
  try {
    const { organizationName, slug, email, password, displayName, billingEmail, logo_url, phone, address } =
      req.body;

    if (!organizationName || !email || !password) {
      return res.status(400).json({ error: 'Organization name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const existing = await query('SELECT id FROM auth.users WHERE email = $1', [
      email.toLowerCase().trim(),
    ]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists. Sign in instead.' });
    }

    const { tenantId, userId } = await registerOrganization({
      organizationName,
      slug,
      email,
      password,
      displayName,
      billingEmail,
      logo_url,
      phone,
      address,
    });

    const userResult = await query('SELECT id, email FROM auth.users WHERE id = $1', [userId]);
    const profileResult = await query('SELECT * FROM public.profiles WHERE user_id = $1', [userId]);
    const tenant = await getTenantById(tenantId);
    const membership = await resolveMembershipForLogin(userId, tenantId);
    const token = signToken(
      userId,
      userResult.rows[0].email,
      tenantId,
      membership?.membershipId ?? null,
      membership?.member_role ?? 'owner'
    );

    res.status(201).json({
      user: userResult.rows[0],
      profile: profileResult.rows[0] || null,
      role: 'admin',
      tenant,
      tenants: tenant ? [{ ...tenant, member_role: 'owner', is_default: true }] : [],
      token,
      session: { access_token: token, user: userResult.rows[0] },
      pending_approval: true,
      message:
        'Organization registered. A platform administrator will approve your workspace before full access is enabled.',
    });
  } catch (error) {
    console.error('Tenant register error:', error);
    res.status(500).json({ error: getSafeErrorMessage(error, 'Registration failed') });
  }
});

/** Check slug availability */
router.get('/slug-available/:slug', async (req, res) => {
  try {
    const slug = slugifyOrganizationName(req.params.slug);
    const existing = await query('SELECT 1 FROM public.tenants WHERE slug = $1', [slug]);
    res.json({ slug, available: existing.rows.length === 0 });
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to check slug') });
  }
});

router.get('/mine', authenticateToken, async (req, res) => {
  try {
    const tenants = await listTenantsForUser(req.user!.userId);
    res.json(tenants);
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to list organizations') });
  }
});

router.get('/current', authenticateToken, attachTenantContext, requireTenantContext, async (req, res) => {
  try {
    const tenant = await getTenantById(req.tenantId!);
    const plan = tenant ? await getPlan(tenant.plan_code) : null;
    const userCount = await query(
      'SELECT COUNT(*)::int AS c FROM public.tenant_members WHERE tenant_id = $1',
      [req.tenantId]
    );
    const locationCount = await query(
      'SELECT COUNT(*)::int AS c FROM public.locations WHERE tenant_id = $1',
      [req.tenantId]
    );
    res.json({
      tenant,
      plan,
      usage: {
        users: Number(userCount.rows[0]?.c ?? 0),
        locations: Number(locationCount.rows[0]?.c ?? 0),
      },
      member_role: req.tenantMemberRole,
    });
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to load organization') });
  }
});

router.post('/switch', authenticateToken, async (req, res) => {
  try {
    const { tenantId } = req.body as { tenantId?: string };
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const userId = req.user!.userId;
    const resolved = await resolveActiveTenantId(userId, tenantId);
    if (!resolved) {
      return res.status(403).json({ error: 'You do not have access to this organization' });
    }

    const membership = await resolveMembershipForLogin(userId, resolved);
    if (!membership) {
      return res.status(403).json({ error: 'You do not have access to this organization' });
    }

    const userResult = await query('SELECT id, email FROM auth.users WHERE id = $1', [userId]);
    const tenant = await getTenantById(resolved);
    const token = signToken(
      userId,
      userResult.rows[0].email,
      resolved,
      membership.membershipId,
      membership.member_role
    );

    await query(
      `UPDATE public.tenant_members SET is_default = FALSE WHERE user_id = $1`,
      [userId]
    );
    await query(
      `UPDATE public.tenant_members SET is_default = TRUE WHERE user_id = $1 AND tenant_id = $2`,
      [userId, resolved]
    );

    res.json({
      tenant,
      token,
      tenants: await listTenantsForUser(userId),
    });
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to switch organization') });
  }
});

/** Transfer organization mother account (owner) to another member */
router.post(
  '/current/transfer-owner',
  authenticateToken,
  attachTenantContext,
  requireTenantContext,
  async (req, res) => {
    try {
      const actorRole = req.tenantMemberRole;
      const { isPlatformOperator } = await import('../lib/platform-operator.js');
      const platformOp = await isPlatformOperator(req.user!.userId);
      if (actorRole !== 'owner' && !platformOp) {
        return res.status(403).json({
          error: 'Only the organization mother account (owner) or platform admin can transfer ownership',
        });
      }

      const { user_id: newOwnerUserId } = req.body as { user_id?: string };
      if (!newOwnerUserId) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      const memberCheck = await query(
        `SELECT id, member_role, status FROM public.tenant_members
         WHERE tenant_id = $1 AND user_id = $2`,
        [req.tenantId, newOwnerUserId]
      );
      if (memberCheck.rows.length === 0) {
        return res.status(404).json({ error: 'User is not a member of this organization' });
      }
      if (memberCheck.rows[0].status !== 'active') {
        return res.status(400).json({ error: 'User membership must be active' });
      }

      const client = await import('../config/database.js').then((m) => m.getClient());
      const db = await client;
      try {
        await db.query('BEGIN');
        await db.query(
          `UPDATE public.tenant_members SET member_role = 'tenant_admin'
           WHERE tenant_id = $1 AND member_role = 'owner'`,
          [req.tenantId]
        );
        await db.query(
          `UPDATE public.tenant_members SET member_role = 'owner'
           WHERE tenant_id = $1 AND user_id = $2`,
          [req.tenantId, newOwnerUserId]
        );
        await db.query('COMMIT');
      } catch (e) {
        await db.query('ROLLBACK');
        throw e;
      } finally {
        db.release();
      }

      res.json({ ok: true, new_owner_user_id: newOwnerUserId });
    } catch (error) {
      res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to transfer ownership') });
    }
  }
);

router.patch('/current', authenticateToken, attachTenantContext, requireTenantContext, async (req, res) => {
  try {
    const memberRole = req.tenantMemberRole;
    if (!memberRole || !['owner', 'admin'].includes(memberRole)) {
      return res.status(403).json({ error: 'Only organization owners or admins can update settings' });
    }

    const {
      name,
      billing_email,
      logo_url,
      contact_person,
      phone,
      email,
      address,
      feature_flags,
      pharmacy,
      notifications,
      security,
    } = req.body as {
      name?: string;
      billing_email?: string;
      logo_url?: string | null;
      contact_person?: string;
      phone?: string;
      email?: string;
      address?: string;
      feature_flags?: Record<string, unknown>;
      pharmacy?: Record<string, unknown>;
      notifications?: Record<string, unknown>;
      security?: Record<string, unknown>;
    };

    const updates: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (name !== undefined) {
      updates.push(`name = $${i++}`);
      params.push(name.trim());
    }
    if (billing_email !== undefined) {
      updates.push(`billing_email = $${i++}`);
      params.push(billing_email.trim() || null);
    }
    if (logo_url !== undefined) {
      const { validateTenantLogoValue } = await import('../lib/tenant-logo-upload.js');
      updates.push(`logo_url = $${i++}`);
      params.push(validateTenantLogoValue(logo_url));
    }
    if (contact_person !== undefined) {
      updates.push(`contact_person = $${i++}`);
      params.push(contact_person.trim() || null);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${i++}`);
      params.push(phone.trim() || null);
    }
    if (email !== undefined) {
      updates.push(`email = $${i++}`);
      params.push(email.trim() || null);
    }
    if (address !== undefined) {
      updates.push(`address = $${i++}`);
      params.push(address.trim() || null);
    }

    const flagPatch: Record<string, unknown> = {};
    if (pharmacy && typeof pharmacy === 'object') flagPatch.pharmacy = pharmacy;
    if (notifications && typeof notifications === 'object') flagPatch.notifications = notifications;
    if (security && typeof security === 'object') flagPatch.security = security;
    if (feature_flags && typeof feature_flags === 'object') Object.assign(flagPatch, feature_flags);

    if (Object.keys(flagPatch).length > 0) {
      updates.push(`feature_flags = COALESCE(feature_flags, '{}'::jsonb) || $${i++}::jsonb`);
      params.push(JSON.stringify(flagPatch));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    updates.push('updated_at = NOW()');
    params.push(req.tenantId);

    await query(
      `UPDATE public.tenants SET ${updates.join(', ')} WHERE id = $${i}`,
      params
    );

    const tenant = await getTenantById(req.tenantId!);
    res.json({ tenant });
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to update organization') });
  }
});

/** Organization owner: request a subscription package while pending platform approval */
router.post(
  '/current/request-plan',
  authenticateToken,
  attachTenantContext,
  requireTenantContext,
  async (req, res) => {
    try {
      if (req.tenantMemberRole !== 'owner') {
        return res.status(403).json({
          error: 'Only the organization owner can select a subscription package',
        });
      }

      const tenantId = req.tenantId!;
      const tenant = await getTenantById(tenantId);
      if (!tenant) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      if (tenant.status !== 'pending_approval') {
        return res.status(400).json({
          error: 'Package selection is only available while your organization awaits approval',
        });
      }

      const { plan_code: planCodeRaw } = req.body as { plan_code?: string };
      const planCode = planCodeRaw?.trim().toLowerCase();
      if (!planCode) {
        return res.status(400).json({ error: 'plan_code is required' });
      }
      if (planCode === 'trial') {
        return res.status(400).json({ error: 'Please select a paid subscription package' });
      }

      const plan = await getPlan(planCode);
      if (!plan) {
        return res.status(400).json({ error: 'Unknown or inactive subscription plan' });
      }

      const amount = Number(plan.price_monthly ?? 0);
      const validFrom = new Date();
      const validUntil = new Date();
      validUntil.setMonth(validUntil.getMonth() + 1);
      const invoiceNumber = `REQ-${Date.now().toString(36).toUpperCase()}`;

      const client = await getClient();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE public.tenants
           SET plan_code = $1,
               feature_flags = COALESCE(feature_flags, '{}'::jsonb) || $2::jsonb,
               updated_at = NOW()
           WHERE id = $3`,
          [
            plan.code,
            JSON.stringify({
              onboarding: {
                plan_requested: true,
                requested_plan_code: plan.code,
                requested_at: new Date().toISOString(),
              },
            }),
            tenantId,
          ]
        );
        await client.query(
          `INSERT INTO public.tenant_subscription_orders (
            tenant_id, plan_code, amount, currency, period_months,
            valid_from, valid_until, payment_method, notes, allocated_by, status, invoice_number
          ) VALUES ($1,$2,$3,'BDT',1,$4,$5,'onboarding',$6,$7,'pending',$8)`,
          [
            tenantId,
            plan.code,
            amount,
            validFrom.toISOString(),
            validUntil.toISOString(),
            'Package selected during onboarding — awaiting platform approval',
            req.user!.userId,
            invoiceNumber,
          ]
        );
        await client.query(
          `INSERT INTO public.tenant_platform_notifications (tenant_id, title, message, severity, source, metadata)
           VALUES ($1, $2, $3, 'info', 'onboarding', $4)`,
          [
            tenantId,
            'Request under review',
            `Your ${plan.name} package selection was submitted. A platform administrator will review and activate your pharmacy.`,
            JSON.stringify({ plan_code: plan.code, invoice_number: invoiceNumber }),
          ]
        );
        await client.query('COMMIT');
      } catch (txError) {
        await client.query('ROLLBACK');
        throw txError;
      } finally {
        client.release();
      }

      const updated = await getTenantById(tenantId);
      res.json({
        tenant: updated,
        message: 'Package request submitted for platform review',
      });
    } catch (error) {
      console.error('Request plan error:', error);
      res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to submit plan request') });
    }
  }
);

/** Platform operator: list all tenants */
router.get('/platform/all', authenticateToken, async (req, res) => {
  try {
    if (!(await isPlatformAdmin(req.user!.userId))) {
      return res.status(403).json({ error: 'Platform admin access required' });
    }
    const result = await query(
      `SELECT t.*,
        (SELECT COUNT(*)::int FROM public.tenant_members tm WHERE tm.tenant_id = t.id) AS user_count,
        (SELECT COUNT(*)::int FROM public.locations l WHERE l.tenant_id = t.id) AS location_count
       FROM public.tenants t
       ORDER BY t.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to list tenants') });
  }
});

router.patch('/platform/:tenantId/status', authenticateToken, async (req, res) => {
  try {
    if (!(await isPlatformAdmin(req.user!.userId))) {
      return res.status(403).json({ error: 'Platform admin access required' });
    }
    const { status } = req.body as { status?: string };
    if (!status || !['active', 'suspended', 'cancelled', 'pending_approval'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const tenantId = req.params.tenantId;
    if (status === 'active') {
      const existing = await getTenantById(tenantId);
      if (existing?.status === 'pending_approval') {
        const { activateApprovedOrganizationOwner } = await import(
          '../lib/activate-approved-owner.js'
        );
        const { tenant } = await activateApprovedOrganizationOwner(
          tenantId,
          req.user!.userId
        );
        return res.json({ tenant });
      }
    }

    await query(
      `UPDATE public.tenants SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, tenantId]
    );
    const tenant = await getTenantById(tenantId);
    res.json({ tenant });
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to update tenant status') });
  }
});

router.patch('/platform/:tenantId/plan', authenticateToken, async (req, res) => {
  try {
    if (!(await isPlatformAdmin(req.user!.userId))) {
      return res.status(403).json({ error: 'Platform admin access required' });
    }
    const { plan_code } = req.body as { plan_code?: string };
    if (!plan_code) {
      return res.status(400).json({ error: 'plan_code is required' });
    }
    const plan = await getPlan(plan_code);
    if (!plan) {
      return res.status(400).json({ error: 'Unknown plan' });
    }
    await query(
      `UPDATE public.tenants SET plan_code = $1, updated_at = NOW() WHERE id = $2`,
      [plan_code, req.params.tenantId]
    );
    const tenant = await getTenantById(req.params.tenantId);
    res.json({ tenant, plan });
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to update plan') });
  }
});

export default router;
