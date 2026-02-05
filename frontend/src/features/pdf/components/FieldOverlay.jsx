//frontend/src/features/pdf/components/FieldOverlay.jsx
/**
 * ✅ FIXED: Field overlay with proper react-rnd props
 */

import { useState } from 'react'
import { Rnd } from 'react-rnd'
import { getFieldDisplayInfo } from '../../fields/utils/fieldRules'

export const FieldOverlay = ({
  field,
  pageWidth = 612,
  pageHeight = 792,
  scale = 1,
  onUpdate,
  onSelect,
  isSelected,
  isEditing = false,
}) => {
  if (!field) return null

  const x = field.x_pct * pageWidth * scale
  const y = field.y_pct * pageHeight * scale
  const width = field.width_pct * pageWidth * scale
  const height = field.height_pct * pageHeight * scale

  const info = getFieldDisplayInfo(field.field_type)

  const handleDragStop = (e, d) => {
    const newXPct = d.x / (pageWidth * scale)
    const newYPct = d.y / (pageHeight * scale)

    onUpdate({
      ...field,
      x_pct: Math.max(0, Math.min(newXPct, 1 - field.width_pct)),
      y_pct: Math.max(0, Math.min(newYPct, 1 - field.height_pct)),
    })
  }

  const handleResizeStop = (e, direction, ref, delta, position) => {
    const newWidth = ref.offsetWidth / (pageWidth * scale)
    const newHeight = ref.offsetHeight / (pageHeight * scale)

    onUpdate({
      ...field,
      x_pct: Math.max(0, position.x / (pageWidth * scale)),
      y_pct: Math.max(0, position.y / (pageHeight * scale)),
      width_pct: Math.min(newWidth, 1),
      height_pct: Math.min(newHeight, 1),
    })
  }

  // ✅ For static prefilled fields, show preview of the text
  const showPrefillPreview =
    field.field_type === 'prefilled_text' &&
    !field.is_editable_prefill &&
    field.prefill_value

  return (
    <Rnd
      default={{
        x,
        y,
        width,
        height,
      }}
      position={{ x, y }}
      size={{ width, height }}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      // ✅ FIXED: Use enableResizing (not disableResizing)
      enableResizing={isEditing}
      // ✅ FIXED: Use onDragStart/onDragStop to control dragging
      dragEnabled={isEditing}
      resizeEnabled={isEditing}
      className={`
        border-2 flex flex-col items-center justify-center select-none
        ${isSelected
          ? `${info.borderColor} ${info.color} bg-opacity-40 shadow-lg`
          : `border-gray-400 bg-gray-100 bg-opacity-20 hover:border-gray-500`
        }
      `}
      style={{
        zIndex: isSelected ? 20 : 10,
        cursor: isEditing ? 'move' : 'default',
        userSelect: 'none',
        padding: '4px',
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.(field.id)
      }}
    >
      {/* ✅ Prefill preview for static fields */}
      {showPrefillPreview ? (
        <div className="text-center pointer-events-none overflow-hidden text-clip">
          <div className="text-xs font-bold text-gray-700 mb-1">{field.label}</div>
          <div className="text-xs text-gray-600 leading-tight line-clamp-2">
            {field.prefill_value}
          </div>
        </div>
      ) : (
        <div className="text-center pointer-events-none">
          <div className="text-2xl">{info.icon}</div>
          <div className="text-xs font-bold text-gray-700 mt-1">{field.label}</div>
          <div className="text-xs text-gray-600">{field.field_type}</div>
          {/* Show editable badge for editable prefilled fields */}
          {field.field_type === 'prefilled_text' && field.is_editable_prefill && (
            <div className="text-xs text-teal-600 font-semibold mt-1">✏️ Editable</div>
          )}
        </div>
      )}
    </Rnd>
  )
}