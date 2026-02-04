/**
 * ✅ EXTRACTED: All audit trail logic
 */

import { AuditTrailPanel } from '../../../audit/components/AuditTrailPanel'

export const AuditTab = ({ document }) => {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <AuditTrailPanel document={document} />
    </div>
  )
}