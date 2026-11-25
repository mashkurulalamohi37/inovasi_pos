import express from 'express';
import { authenticateWithTenant } from '../middleware/auth-with-tenant.js';
import { getReqTenantId } from '../lib/tenant-scope.js';
import { query } from '../config/database.js';
import { getSafeErrorMessage } from '../lib/errors.js';

const router = express.Router();

/** Tenant admin: platform messages for this organization */
router.get('/', ...authenticateWithTenant, async (req, res) => {
  try {
    const tenantId = getReqTenantId(req);
    const unreadOnly = req.query.unread === 'true';
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const result = await query(
      `SELECT id, tenant_id, title, message, severity, is_read, read_at, source, metadata, created_at
       FROM public.tenant_platform_notifications
       WHERE tenant_id = $1
       ${unreadOnly ? 'AND is_read = FALSE' : ''}
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );
    const unread = await query(
      `SELECT COUNT(*)::int AS c FROM public.tenant_platform_notifications
       WHERE tenant_id = $1 AND is_read = FALSE`,
      [tenantId]
    );
    res.json({
      notifications: result.rows,
      unread_count: Number(unread.rows[0]?.c ?? 0),
    });
  } catch (error) {
    if ((error as Error).message === 'TENANT_REQUIRED') {
      return res.status(403).json({ error: 'Organization context required', code: 'TENANT_REQUIRED' });
    }
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to load notifications') });
  }
});

router.patch('/:id/read', ...authenticateWithTenant, async (req, res) => {
  try {
    const tenantId = getReqTenantId(req);
    const userId = req.user!.userId;
    const result = await query(
      `UPDATE public.tenant_platform_notifications
       SET is_read = TRUE, read_at = NOW(), read_by_user_id = $1
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [userId, req.params.id, tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to mark notification read') });
  }
});

router.post('/read-all', ...authenticateWithTenant, async (req, res) => {
  try {
    const tenantId = getReqTenantId(req);
    const userId = req.user!.userId;
    await query(
      `UPDATE public.tenant_platform_notifications
       SET is_read = TRUE, read_at = NOW(), read_by_user_id = $1
       WHERE tenant_id = $2 AND is_read = FALSE`,
      [userId, tenantId]
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to mark all read') });
  }
});

export default router;
