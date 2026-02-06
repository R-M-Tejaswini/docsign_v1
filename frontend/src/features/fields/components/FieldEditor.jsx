//frontend/src/features/fields/components/FieldEditor.jsx
/**
 * ✅ FIXED: Field editor with proper save handling
 */

import { useState, useEffect } from 'react'
import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'
import { getRecipientBadgeClasses } from '../../../shared/utils/recipientColors'

export const FieldEditor = ({ 
  field, 
  onUpdate, 
  onDelete, 
  allRecipients = [], 
  canEdit = false 
}) => {
  const [label, setLabel] = useState(field?.label || '')
  const [required, setRequired] = useState(field?.required ?? true)
  const [recipient, setRecipient] = useState(field?.recipient || '')
  const [newRecipientInput, setNewRecipientInput] = useState('')
  const [showNewRecipientInput, setShowNewRecipientInput] = useState(false)
  const [showRecipientList, setShowRecipientList] = useState(false)
  const [localRecipients, setLocalRecipients] = useState(allRecipients)

  // ✅ Prefilled text fields
  const [prefillValue, setPrefillValue] = useState(field?.prefill_value || '')
  const [isEditablePrefill, setIsEditablePrefill] = useState(field?.is_editable_prefill ?? false)
  
  // ✅ ADD: Loading state
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (field) {
      setLabel(field.label || '')
      setRequired(field.required ?? true)
      setRecipient(field.recipient || '')
      setPrefillValue(field.prefill_value || '')
      setIsEditablePrefill(field.is_editable_prefill ?? false)
    }
  }, [field])

  useEffect(() => {
    setLocalRecipients(allRecipients)
  }, [allRecipients])

  // ✅ FIXED: Proper save handler
  const handleSave = async () => {
    if (!label.trim()) {
      alert('Label is required')
      return
    }

    setIsSaving(true)
    try {
      const updates = {
        id: field.id,  // ✅ CRITICAL: Include field ID
        label: label.trim(),
        required,
        recipient: isEditablePrefill ? recipient : (recipient || null),  // Optional for static
        prefill_value: field?.field_type === 'prefilled_text' ? prefillValue : undefined,
        is_editable_prefill: field?.field_type === 'prefilled_text' ? isEditablePrefill : false,
      }
      
      console.log('📝 Saving field updates:', updates)
      
      // ✅ Call onUpdate with the updates
      await onUpdate(updates)
      
      console.log('✅ Field saved successfully')
    } catch (error) {
      console.error('❌ Error saving field:', error)
      alert(`Failed to save field: ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddNewRecipient = () => {
    if (newRecipientInput.trim()) {
      setLocalRecipients([...localRecipients, newRecipientInput])
      setRecipient(newRecipientInput)
      setNewRecipientInput('')
      setShowNewRecipientInput(false)
    }
  }

  const handleSelectRecipient = (selectedRecipient) => {
    setRecipient(selectedRecipient)
    setShowRecipientList(false)
  }

  if (!field) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">Select a field to edit</p>
      </div>
    )
  }

  const isPrefilled = field.field_type === 'prefilled_text'

  return (
    <div className="space-y-4">
      {/* Field Label */}
      <Input
        label="Field Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="e.g., Signature, Date, etc."
        disabled={!canEdit || isSaving}
      />

      {/* ✅ Prefilled Text Fields - LIGHTER styling */}
      {isPrefilled && (
        <div className="space-y-4 p-3 bg-gray-50 border-2 border-gray-200 rounded-lg">
          <h4 className="text-sm font-bold text-gray-900">Prefilled Text</h4>
          
          {/* Prefill Value */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2">
              Default Text
            </label>
            <textarea
              value={prefillValue}
              onChange={(e) => setPrefillValue(e.target.value)}
              placeholder="Text to pre-fill..."
              rows={2}
              disabled={!canEdit || isSaving}
              className={`
                w-full px-3 py-2 border-2 border-gray-300 rounded
                focus:outline-none focus:ring-2 focus:ring-blue-500
                text-sm disabled:bg-gray-100 disabled:cursor-not-allowed
              `}
            />
          </div>

          {/* Editable Toggle - SIMPLE */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isEditablePrefill}
              onChange={(e) => setIsEditablePrefill(e.target.checked)}
              disabled={!canEdit || isSaving}
              className="w-4 h-4 rounded border-2 border-gray-300"
            />
            <span className="text-sm font-semibold text-gray-900">
              Recipient can edit
            </span>
          </label>

          {/* Mode Info - MINIMAL */}
          <div className="text-xs text-gray-600 border-l-4 border-gray-300 pl-2">
            {isEditablePrefill ? (
              'Text can be modified during signing'
            ) : (
              'Text is locked and will appear on final PDF'
            )}
          </div>
        </div>
      )}

      {/* Recipient Selector */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-900">
          Recipient
          {isPrefilled && !isEditablePrefill ? (
            <span className="text-xs text-gray-600 font-normal ml-1">(Optional for static)</span>
          ) : (
            <span className="text-red-500 ml-1">*</span>
          )}
        </label>

        <div className="relative">
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            onClick={() => setShowRecipientList(!showRecipientList)}
            disabled={!canEdit || isSaving || (isPrefilled && !isEditablePrefill)}
            placeholder="Select or type a recipient..."
            className={`
              w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-blue-500
              ${!canEdit || isSaving || (isPrefilled && !isEditablePrefill) ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
            `}
          />

          {/* Recipient Dropdown */}
          {showRecipientList && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
              {localRecipients.map((r) => (
                <button
                  key={r}
                  onClick={() => handleSelectRecipient(r)}
                  className={`w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-2 ${
                    recipient === r ? 'bg-blue-100' : ''
                  }`}
                  type="button"
                >
                  <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
                    {r}
                  </span>
                </button>
              ))}
              <div className="border-t border-gray-200 p-2">
                {!showNewRecipientInput ? (
                  <button
                    onClick={() => setShowNewRecipientInput(true)}
                    className="w-full text-left text-xs text-blue-600 hover:text-blue-800 font-semibold py-1"
                    type="button"
                  >
                    ➕ Add new recipient
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRecipientInput}
                      onChange={(e) => setNewRecipientInput(e.target.value)}
                      placeholder="New recipient..."
                      autoFocus
                      className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded"
                    />
                    <button
                      onClick={handleAddNewRecipient}
                      className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                      type="button"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Required Checkbox - Hidden for static prefilled fields */}
      {!(isPrefilled && !isEditablePrefill) && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            disabled={!canEdit || isSaving}
            className="w-4 h-4"
          />
          <span className="text-sm font-semibold text-gray-900">
            This field is required
          </span>
        </label>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4 border-t border-gray-200">
        <button
          onClick={handleSave}
          disabled={!canEdit || !label.trim() || isSaving}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? '💾 Saving...' : '💾 Save'}
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            disabled={!canEdit || isSaving}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            🗑️ Delete
          </button>
        )}
      </div>
    </div>
  )
}