//frontend/src/features/fields/components/FieldViewer.jsx
/**
 * ✅ NEW: Read-only field display (extracted from FieldEditor)
 */

import { getFieldDisplayInfo } from '../utils/fieldRules'

export const FieldViewer = ({ field, pageWidth = 612, pageHeight = 792, scale = 1 }) => {
  if (!field) return null

  const info = getFieldDisplayInfo(field.field_type)
  const x = field.x_pct * pageWidth * scale
  const y = field.y_pct * pageHeight * scale
  const width = field.width_pct * pageWidth * scale
  const height = field.height_pct * pageHeight * scale

  return (
    <div
      className="absolute border-2 border-gray-400 bg-gray-100 bg-opacity-20 flex items-center justify-center"
      style={{
        left: x,
        top: y,
        width,
        height,
        zIndex: 10,
      }}
      title={field.label}
    >
      <div className="text-center pointer-events-none">
        <div className="text-xs">{info.icon}</div>
        <div className="text-xs text-gray-600">{field.label}</div>
      </div>
    </div>
  )
}