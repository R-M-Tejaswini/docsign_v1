/**
 * ✅ NEW: Interactive field overlay on PDF for editing
 */

import { useState } from 'react'

// ✅ FIXED: Import from pdf utils, not fields utils
import { pctToPx } from '../utils/coords'

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
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  if (!field) return null

  const x = field.x_pct * pageWidth * scale
  const y = field.y_pct * pageHeight * scale
  const width = field.width_pct * pageWidth * scale
  const height = field.height_pct * pageHeight * scale

  const handleMouseDown = (e) => {
    if (!isEditing) return
    setIsDragging(true)
    setOffset({
      x: e.clientX - x,
      y: e.clientY - y,
    })
  }

  const handleMouseMove = (e) => {
    if (!isDragging || !isEditing) return

    const newX = Math.max(0, (e.clientX - offset.x) / (pageWidth * scale))
    const newY = Math.max(0, (e.clientY - offset.y) / (pageHeight * scale))

    onUpdate({
      ...field,
      x_pct: Math.min(newX, 1 - field.width_pct),
      y_pct: Math.min(newY, 1 - field.height_pct),
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  return (
    <div
      className={`absolute border-2 flex items-center justify-center cursor-move transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-100 bg-opacity-30'
          : 'border-gray-400 bg-gray-100 bg-opacity-10 hover:border-gray-500'
      } ${!isEditing && 'cursor-default'}`}
      style={{
        left: x,
        top: y,
        width,
        height,
        zIndex: isSelected ? 20 : 10,
      }}
      onClick={() => onSelect?.(field.id)}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="text-center pointer-events-none select-none">
        <div className="text-xs font-bold text-gray-700">{field.label}</div>
        <div className="text-xs text-gray-600">{field.field_type}</div>
      </div>

      {/* Resize handle */}
      {isEditing && isSelected && (
        <div
          className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 cursor-se-resize"
          onMouseDown={(e) => {
            e.stopPropagation()
            setIsResizing(true)
          }}
          onMouseUp={() => setIsResizing(false)}
        />
      )}
    </div>
  )
}