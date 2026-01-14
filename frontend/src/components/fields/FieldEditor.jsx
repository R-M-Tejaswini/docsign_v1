import { useState, useEffect } from 'react'
import { Button } from '../ui/Button'
import { getRecipientColor, getRecipientBadgeClasses } from '../../utils/recipientColors'

export const FieldEditor = ({ field, onUpdate, onDelete, allRecipients = [], canEdit = true }) => {
  const [label, setLabel] = useState(field?.label || '')
  const [required, setRequired] = useState(field?.required ?? true)
  const [recipient, setRecipient] = useState(field?.recipient || '')
  const [newRecipientInput, setNewRecipientInput] = useState('')
  const [showNewRecipientInput, setShowNewRecipientInput] = useState(false)

  useEffect(() => {
    if (field) {
      setLabel(field.label)
      setRequired(field.required)
      setRecipient(field.recipient || '')
    }
  }, [field])

  const handleSave = () => {
    if (!label.trim()) {
      alert('Label is required')
      return
    }
    
    if (!recipient.trim()) {
      alert('Please assign a recipient')
      return
    }

    onUpdate?.({
      ...field,
      label: label.trim(),
      required,
      recipient: recipient.trim(),
    })
  }

  const handleAddNewRecipient = () => {
    if (!newRecipientInput.trim()) {
      alert('Please enter a recipient name')
      return
    }
    
    const newRecipient = newRecipientInput.trim()
    setRecipient(newRecipient)
    setNewRecipientInput('')
    setShowNewRecipientInput(false)
  }

  if (!field) {
    return (
      <div className="bg-white border rounded-lg p-6">
        <p className="text-sm text-gray-500 text-center">
          Select a field to edit its properties
        </p>
      </div>
    )
  }

  const recipientColor = getRecipientColor(recipient, allRecipients)

  return (
    <div className="bg-white border rounded-lg p-6 space-y-4">
      <h3 className="text-lg font-semibold">Field Properties</h3>

      {/* Field Type Display */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Field Type
        </label>
        <div className="px-3 py-2 bg-gray-100 rounded text-sm capitalize">
          {field.field_type}
        </div>
      </div>

      {/* Label Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Label
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={!canEdit}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
      </div>

      {/* Recipient Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Assigned Recipient *
        </label>
        
        {/* Current Recipient Badge */}
        {recipient && (
          <div className="mb-2">
            <span className={getRecipientBadgeClasses(recipient, allRecipients)}>
              {recipient}
            </span>
          </div>
        )}

        {/* Recipient Dropdown */}
        {!showNewRecipientInput ? (
          <div className="space-y-2">
            <select
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            >
              <option value="">-- Select Recipient --</option>
              {allRecipients.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            
            {canEdit && (
              <Button
                onClick={() => setShowNewRecipientInput(true)}
                variant="secondary"
                size="sm"
                className="w-full"
              >
                + Add New Recipient
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={newRecipientInput}
              onChange={(e) => setNewRecipientInput(e.target.value)}
              placeholder="e.g., Recipient 3"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && handleAddNewRecipient()}
            />
            <div className="flex gap-2">
              <Button
                onClick={handleAddNewRecipient}
                variant="primary"
                size="sm"
                className="flex-1"
              >
                Add
              </Button>
              <Button
                onClick={() => {
                  setShowNewRecipientInput(false)
                  setNewRecipientInput('')
                }}
                variant="secondary"
                size="sm"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Required Checkbox */}
      <div>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            disabled={!canEdit}
            className="rounded text-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed"
          />
          <span className="ml-2 text-sm text-gray-700">Required field</span>
        </label>
      </div>

      {/* Position Info (Read-only) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Position (Page {field.page_number})
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
          <div>X: {(field.x_pct * 100).toFixed(1)}%</div>
          <div>Y: {(field.y_pct * 100).toFixed(1)}%</div>
          <div>W: {(field.width_pct * 100).toFixed(1)}%</div>
          <div>H: {(field.height_pct * 100).toFixed(1)}%</div>
        </div>
      </div>

      {/* Action Buttons */}
      {canEdit && (
        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleSave} variant="primary" className="flex-1">
            Save Changes
          </Button>
          <Button onClick={onDelete} variant="danger" className="flex-1">
            Delete Field
          </Button>
        </div>
      )}
    </div>
  )
}