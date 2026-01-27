// frontend/src/components/links/GroupGenerateLinkModal.jsx
import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useApi } from '../../hooks/useApi'
import { useClipboard } from '../../hooks/useClipboard'
import { groupAPI } from '../../services/api'
import { getRecipientBadgeClasses } from '../../utils/recipientColors'

export const GroupGenerateLinkModal = ({ isOpen, onClose, group }) => {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(false)
  
  // Calculate unique recipients from all group items
  // We use flatMap to get all recipients from all items, then Set to deduplicate
  const allRecipients = Array.from(new Set(
    group?.items?.flatMap(item => item.recipients || []) || []
  )).sort()

  const { execute: generateLinks } = useApi((recipients) => 
    groupAPI.generateLinks(group.id, recipients)
  )

  const { copy, copied } = useClipboard()

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setLinks([]) 
    }
  }, [isOpen])

  const handleGenerate = async () => {
    try {
      setLoading(true)
      const response = await generateLinks(allRecipients)
      // Handle potential axios data wrapping
      const results = response.data || response
      setLinks(results)
    } catch (err) {
      alert('Failed to generate links: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Group Signing Package">
      <div className="space-y-6">
        
        {/* State 1: Pre-generation */}
        {!links.length && (
          <div className="text-center space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg text-blue-800 text-sm">
              <span className="font-bold block mb-1">📦 How this works</span>
              Generating links will create a unique <strong>Package URL</strong> for each recipient. 
              This single link will guide them through all documents in the sequence automatically.
            </div>
            
            <div className="border border-gray-200 rounded-lg p-4 text-left">
              <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Recipients in this package</h4>
              {allRecipients.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No recipients found in these documents.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allRecipients.map(r => (
                    <span key={r} className={getRecipientBadgeClasses(r, allRecipients)}>
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <Button 
              onClick={handleGenerate} 
              variant="primary" 
              size="lg" 
              className="w-full"
              disabled={loading || allRecipients.length === 0}
            >
              {loading ? 'Generating...' : '⚡ Generate Links for All'}
            </Button>
          </div>
        )}

        {/* State 2: Links Display */}
        {links.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-green-600 font-bold text-center">
              ✅ Links generated successfully!
            </p>
            
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {links.map((linkData) => (
                <div key={linkData.recipient} className="border-2 border-gray-200 rounded-lg p-3 bg-white">
                  <div className="flex justify-between items-center mb-2">
                    <span className={getRecipientBadgeClasses(linkData.recipient, allRecipients)}>
                      {linkData.recipient}
                    </span>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      Package Link
                    </span>
                  </div>
                  
                  <div className="flex gap-2">
                    <input 
                      readOnly 
                      value={linkData.url} 
                      className="flex-1 text-xs bg-gray-50 border border-gray-300 rounded px-2 py-2 font-mono text-gray-600 truncate focus:ring-2 focus:ring-blue-500 outline-none"
                      onClick={(e) => e.target.select()}
                    />
                    <Button 
                      size="sm" 
                      variant="secondary" 
                      onClick={() => copy(linkData.url)}
                    >
                      {copied ? '✓' : 'Copy'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t">
              <Button onClick={onClose} variant="secondary" className="w-full">
                Done
              </Button>
            </div>
          </div>
        )}

      </div>
    </Modal>
  )
}