import { fieldPctToPx } from '../../utils/coords'

export const PageLayer = ({
  pageWidth = 612,
  pageHeight = 792,
  fields = [],
  signatures = [],
  selectedFieldId = null,
  onFieldSelect,
  scale = 1,
  children,
}) => {
  return (
    <div
      className="absolute inset-0"
      style={{
        width: pageWidth * scale,
        height: pageHeight * scale,
        position: 'relative',
      }}
    >
      {/* Render fields - static display mode */}
      {fields.map((field) => {
        const pxField = fieldPctToPx(field, pageWidth, pageHeight)
        return (
          <div
            key={field.id}
            onClick={() => onFieldSelect?.(field.id)}
            className={`absolute border-2 cursor-pointer transition-all ${
              selectedFieldId === field.id
                ? 'border-blue-500 bg-blue-100 bg-opacity-30'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            style={{
              left: pxField.x * scale,
              top: pxField.y * scale,
              width: pxField.width * scale,
              height: pxField.height * scale,
            }}
          >
            <div className="text-xs text-gray-600 px-1">
              {field.label}
            </div>
          </div>
        )
      })}

      {/* Render signatures */}
      {signatures.map((sig) => {
        const pxSig = fieldPctToPx(sig, pageWidth, pageHeight)
        return (
          <div
            key={sig.id}
            className="absolute border-2 border-green-500 bg-green-100 bg-opacity-30"
            style={{
              left: pxSig.x * scale,
              top: pxSig.y * scale,
              width: pxSig.width * scale,
              height: pxSig.height * scale,
            }}
            title={sig.signer_name}
          >
            <div className="text-xs text-green-700 px-1">
              ✓ {sig.signer_name}
            </div>
          </div>
        )
      })}

      {/* Children for draggable overlays (FieldOverlay) - NO SCALE TRANSFORM */}
      {children}
    </div>
  )
}