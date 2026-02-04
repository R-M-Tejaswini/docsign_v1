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
    
    if (localRecipients.includes(newRecipient)) {
      alert('This recipient already exists')
      setNewRecipientInput('')
      return
    }
    
    const updatedRecipients = [...localRecipients, newRecipient].sort()
    setLocalRecipients(updatedRecipients)
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
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-xl p-8">
        <div className="text-center">
          <div className="text-5xl mb-4">👆</div>
          <p className="text-gray-600 font-medium">
            Select a field to edit its properties
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5 shadow-sm">
      <div className="border-b border-gray-200 pb-3">
        <h3 className="text-xl font-bold text-gray-900">Field Properties</h3>
        <p className="text-xs text-gray-600 mt-1">Configure field settings and assignment</p>
      </div>

      {/* Field Type Display */}
      <div>
        <label className="block text-xs font-bold text-gray-600 uppercase mb-2 tracking-wide">
          Field Type
        </label>
        <div className="px-4 py-3 bg-gradient-to-r from-gray-100 to-gray-50 rounded-lg text-sm font-semibold text-gray-900 capitalize border border-gray-200">
          {field.field_type}
        </div>
      </div>

      {/* Label Input */}
      <div>
        <label className="block text-xs font-bold text-gray-600 uppercase mb-2 tracking-wide">
          Label <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={!canEdit}
          placeholder="e.g., Full Name, Signature, Date Signed"
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed text-sm font-medium"
        />
      </div>

      {/* Recipient Selector */}
      <div>
        <label className="block text-xs font-bold text-gray-600 uppercase mb-2 tracking-wide">
          Assigned Recipient <span className="text-red-500">*</span>
        </label>
        
        {/* Current Recipient Badge */}
        {recipient && (
          <div className="mb-3">
            <span className={`${getRecipientBadgeClasses(recipient, localRecipients)} shadow-sm`}>
              {recipient}
            </span>
          </div>
        )}

        {/* Recipient Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowRecipientList(!showRecipientList)}
            disabled={!canEdit}
            className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg hover:border-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed text-left text-gray-700 font-semibold transition-all flex justify-between items-center shadow-sm"
          >
            <span>{recipient || 'Select recipient...'}</span>
            <span className="text-gray-500">{showRecipientList ? '▲' : '▼'}</span>
          </button>

          {showRecipientList && canEdit && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-300 rounded-lg shadow-xl z-20 max-h-56 overflow-y-auto">
              {/* Existing Recipients */}
              {localRecipients.map((r) => (
                <button
                  key={r}
                  onClick={() => handleSelectRecipient(r)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors ${
                    recipient === r ? 'bg-blue-100 font-bold' : ''
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
                className="w-full text-left px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 text-blue-700 font-bold transition-colors border-t-2 border-blue-200 flex items-center gap-2"
              >
                <span className="text-xl">➕</span>
                <span>Add New Recipient</span>
              </button>
            </div>
          )}
        </div>

        {/* Add New Recipient Input */}
        {showNewRecipientInput && canEdit && (
          <div className="mt-3 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <label className="block text-xs font-bold text-blue-900 uppercase mb-2">
              New Recipient Name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newRecipientInput}
                onChange={(e) => setNewRecipientInput(e.target.value)}
                placeholder="e.g., Recipient 2, Manager, etc."
                className="flex-1 px-3 py-2 border-2 border-blue-300 rounded-lg focus:border-blue-500 text-sm font-medium"
                onKeyPress={(e) => e.key === 'Enter' && handleAddNewRecipient()}
                autoFocus
              />
              <Button
                onClick={handleAddNewRecipient}
                variant="primary"
                size="sm"
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
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200"></div>

      {/* Required Toggle */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 border-2 border-gray-200">
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            disabled={!canEdit}
            className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed border-2 border-gray-400"
          />
          <div className="flex-1">
            <span className="text-sm font-bold text-gray-900 block">
              Required Field
            </span>
            <span className="text-xs text-gray-600">
              Recipient must fill this field before submitting
            </span>
          </div>
          {required && (
            <span className="text-red-500 text-xl">*</span>
          )}
        </label>
      </div>

      {/* Action Buttons */}
      {canEdit && (
        <div className="space-y-2 pt-4 border-t border-gray-200">
          <Button onClick={handleSave} variant="primary" className="w-full">
            <span>✓</span>
            Save Changes
          </Button>
          <Button onClick={onDelete} variant="danger" className="w-full">
            <span>🗑️</span>
            Delete Field
          </Button>
        </div>
      )}
    </div>
  )
}