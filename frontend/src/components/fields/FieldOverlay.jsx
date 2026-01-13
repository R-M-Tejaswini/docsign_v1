import { Rnd } from 'react-rnd'
import { roundPct } from '../../utils/coords'
import { getFieldDisplayInfo } from '../../utils/fieldRules'

export const FieldOverlay = ({
  field,
  pageWidth = 612,
  pageHeight = 792,
  onUpdate,
  onSelect,
  isSelected = false,
  isEditing = false,
  scale = 1,
}) => {
  if (!isEditing) return null

  const info = getFieldDisplayInfo(field.field_type)
  
  // Convert percentage coordinates to pixels (relative to unscaled page)
  const x = field.x_pct * pageWidth * scale
  const y = field.y_pct * pageHeight * scale
  const width = field.width_pct * pageWidth * scale
  const height = field.height_pct * pageHeight * scale

  const handleDragStop = (e, d) => {
    // d.x and d.y are in scaled pixels, convert back to unscaled
    const newXPct = roundPct((d.x / scale) / pageWidth)
    const newYPct = roundPct((d.y / scale) / pageHeight)
    
    const updated = {
      ...field,
      x_pct: Math.max(0, Math.min(1, newXPct)),
      y_pct: Math.max(0, Math.min(1, newYPct)),
    }
    onUpdate?.(updated)
  }

  const handleResizeStop = (e, direction, ref, delta, position) => {
    // Convert scaled pixels back to percentages
    const newXPct = roundPct((position.x / scale) / pageWidth)
    const newYPct = roundPct((position.y / scale) / pageHeight)
    const newWidthPct = roundPct((ref.offsetWidth / scale) / pageWidth)
    const newHeightPct = roundPct((ref.offsetHeight / scale) / pageHeight)

    const updated = {
      ...field,
      x_pct: Math.max(0, newXPct),
      y_pct: Math.max(0, newYPct),
      width_pct: Math.min(1, newWidthPct),
      height_pct: Math.min(1, newHeightPct),
    }
    onUpdate?.(updated)
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
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.(field.id)
      }}
      className={`cursor-move select-none transition-all ${
        isSelected
          ? 'border-2 border-blue-500 shadow-lg'
          : 'border-2 border-gray-400 hover:border-gray-600'
      }`}
      style={{
        backgroundColor: info.color,
        opacity: 0.4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 'bold',
        color: 'white',
        zIndex: isSelected ? 100 : 10,
      }}
    >
      <div className="text-center pointer-events-none">
        <div>{info.icon}</div>
        <div className="text-xs">{field.label}</div>
      </div>
    </Rnd>
  )
}