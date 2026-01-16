import { useState, useEffect } from 'react'
import { Button } from '../ui/Button'
import { getRecipientBadgeClasses } from '../../utils/recipientColors'

export const FieldEditor = ({ field, onUpdate, onDelete, allRecipients = [], canEdit = true }) => {
  const [label, setLabel] = useState(field?.label || '')
  const [required, setRequired] = useState(field?.required ?? true)
  const [recipient, setRecipient] = useState(field?.recipient || '')
  const [newRecipientInput, setNewRecipientInput] = useState('')
  const [showNewRecipientInput, setShowNewRecipientInput] = useState(false)
  const [showRecipientList, setShowRecipientList] = useState(false)
  const [localRecipients, setLocalRecipients] = useState(allRecipients)

  useEffect(() => {
    if (field) {
      setLabel(field.label)
      setRequired(field.required)
      setRecipient(field.recipient || '')
    }
  }, [field])

  useEffect(() => {
    setLocalRecipients(allRecipients)
  }, [allRecipients])

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
    
    // Check if recipient already exists
    if (localRecipients.includes(newRecipient)) {
      alert('This recipient already exists')
      setNewRecipientInput('')
      return
    }
    
    // Add new recipient to local list
    const updatedRecipients = [...localRecipients, newRecipient].sort()
    setLocalRecipients(updatedRecipients)
    
    // Set as current recipient
    setRecipient(newRecipient)
    setNewRecipientInput('')
    setShowNewRecipientInput(false)
  }

  const handleSelectRecipient = (selectedRecipient) => {
    setRecipient(selectedRecipient)
    setShowRecipientList(false)
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
            <span className={getRecipientBadgeClasses(recipient, localRecipients)}>
              {recipient}
            </span>
          </div>
        )}

        {/* Recipient Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowRecipientList(!showRecipientList)}
            disabled={!canEdit}
            className="w-full px-4 py-2 bg-white border-2 border-gray-300 rounded-lg hover:border-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed text-left text-gray-700 font-medium transition-colors flex justify-between items-center"
          >
            <span>{recipient || 'Select recipient...'}</span>
            <span className="text-gray-500">{showRecipientList ? '▲' : '▼'}</span>
          </button>

          {showRecipientList && canEdit && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-300 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
              {/* Existing Recipients */}
              {localRecipients.map((r) => (
                <button
                  key={r}
                  onClick={() => handleSelectRecipient(r)}
                  className={`w-full text-left px-4 py-2 border-b border-gray-100 hover:bg-blue-50 transition-colors ${
                    recipient === r ? 'bg-blue-100 font-semibold' : ''
                  }`}
                >
                  <span className={getRecipientBadgeClasses(r, localRecipients)}>
                    {r}
                  </span>
                </button>
              ))}
              
              {/* Add New Recipient Button */}
              <button
                onClick={() => {
                  setShowNewRecipientInput(true)
                  setShowRecipientList(false)
                }}
                className="w-full text-left px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium transition-colors border-t border-gray-200 flex items-center gap-2"
              >
                <span>+ Add New Recipient</span>
              </button>
            </div>
          )}
        </div>

        {/* Add New Recipient Input */}
        {showNewRecipientInput && canEdit && (
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newRecipientInput}
              onChange={(e) => setNewRecipientInput(e.target.value)}
              placeholder="e.g., Recipient 2, Manager, etc."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onKeyPress={(e) => e.key === 'Enter' && handleAddNewRecipient()}
              autoFocus
            />
            <button
              onClick={handleAddNewRecipient}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowNewRecipientInput(false)
                setNewRecipientInput('')
              }}
              className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200"></div>

      {/* Required Toggle */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            disabled={!canEdit}
            className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed"
          />
          <span className="text-sm font-medium text-gray-900">
            Required Field
          </span>
          <span className="text-xs text-gray-500 ml-auto">
            Recipient must fill this
          </span>
        </label>
      </div>

      {/* Action Buttons */}
      {canEdit && (
        <div className="space-y-2 pt-4 border-t border-gray-200">
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