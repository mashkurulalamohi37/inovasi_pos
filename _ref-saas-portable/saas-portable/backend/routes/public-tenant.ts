import express from 'express';
import rateLimit from 'express-rate-limit';
import { resolveTenantByCompanyCodeOrSlug } from '../lib/tenant-context.js';
import { getSafeErrorMessage } from '../lib/errors.js';

const router = express.Router();

const brandingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

async function respondTenantBranding(code: string, res: express.Response) {
  const branding = await resolveTenantByCompanyCodeOrSlug(code);
  if (!branding) {
    return res.status(404).json({ error: 'Company not found' });
  }
  const tenantStatus = branding.tenant_status ?? 'active';
  return res.json({
    ...branding,
    company_name: branding.name,
    theme_color: branding.theme_primary,
    login_enabled: true,
    tenant_status: tenantStatus,
    pending_approval: tenantStatus === 'pending_approval',
  });
}

/**
 * Public: resolve company for branded login (no auth, no user enumeration).
 * GET /api/public/tenant-branding?code=GLP-4X9K
 * GET /api/public/tenant-branding/GLP-4X9K
 */
router.get('/tenant-branding/:companyCode', brandingLimiter, async (req, res) => {
  try {
    const code = String(req.params.companyCode || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'Company code is required' });
    }
    await respondTenantBranding(code, res);
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to load company') });
  }
});

router.get('/tenant-branding', brandingLimiter, async (req, res) => {
  try {
    const code = String(req.query.code || req.query.workspace || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'Company code is required' });
    }
    await respondTenantBranding(code, res);
  } catch (error) {
    res.status(500).json({ error: getSafeErrorMessage(error, 'Failed to load company') });
  }
});

export default router;
