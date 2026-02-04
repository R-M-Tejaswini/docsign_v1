/**
 * ✅ CENTRALIZED: Re-export all API modules from one place
 * This is the single import point for all API endpoints
 */

export { documentAPI } from '../../features/documents/api'
export { templateAPI } from '../../features/templates/api'
export { tokenAPI, publicAPI } from '../../features/signing/api'
export { signatureAPI } from '../../features/audit/api'
export { webhookAPI } from '../../features/webhooks/api'