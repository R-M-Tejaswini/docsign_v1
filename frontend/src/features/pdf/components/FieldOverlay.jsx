/**
 * ✅ NEW: Interactive field overlay on PDF for editing
 */

import { useState } from 'react'
import { Rnd } from 'react-rnd'

// ✅ FIXED: Import from pdf utils, not fields utils
import { pctToPx } from '../utils/coords'
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
      disableDragging={!isEditing}
      disableResizing={!isEditing}
      enableResizing={isEditing}
      className={`border-2 flex items-center justify-center select-none ${
        isSelected
          ? 'border-blue-500 bg-blue-100 bg-opacity-40 shadow-lg'
          : 'border-gray-400 bg-gray-100 bg-opacity-20 hover:border-gray-500'
      } ${!isEditing && 'cursor-default'}`}
      style={{
        zIndex: isSelected ? 20 : 10,
        cursor: isEditing ? 'move' : 'default',
        userSelect: 'none',
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.(field.id)
      }}
    >
      <div className="text-center pointer-events-none">
        <div className="text-2xl">{info.icon}</div>
        <div className="text-xs font-bold text-gray-700 mt-1">{field.label}</div>
        <div className="text-xs text-gray-600">{field.field_type}</div>
      </div>
    </Rnd>
  )
}