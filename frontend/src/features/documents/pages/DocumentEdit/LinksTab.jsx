/**
 * ✅ EXTRACTED: All link management logic
 */

import { LinksPanel } from '../../../signing/components/LinksPanel'

export const LinksTab = ({ document }) => {
  return (
    <div className="flex-1 overflow-y-auto">
      <LinksPanel document={document} />
    </div>
  )
}