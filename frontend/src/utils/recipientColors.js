/**
 * Utility functions for recipient color coding
 */

const RECIPIENT_COLORS = [
  { bg: 'bg-blue-100', border: 'border-blue-500', text: 'text-blue-700', color: '#3b82f6' },
  { bg: 'bg-green-100', border: 'border-green-500', text: 'text-green-700', color: '#10b981' },
  { bg: 'bg-purple-100', border: 'border-purple-500', text: 'text-purple-700', color: '#8b5cf6' },
  { bg: 'bg-orange-100', border: 'border-orange-500', text: 'text-orange-700', color: '#f97316' },
  { bg: 'bg-pink-100', border: 'border-pink-500', text: 'text-pink-700', color: '#ec4899' },
  { bg: 'bg-indigo-100', border: 'border-indigo-500', text: 'text-indigo-700', color: '#6366f1' },
  { bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-700', color: '#ef4444' },
  { bg: 'bg-yellow-100', border: 'border-yellow-500', text: 'text-yellow-700', color: '#eab308' },
]

/**
 * Get color scheme for a recipient
 */
export const getRecipientColor = (recipient, allRecipients = []) => {
  if (!recipient) return RECIPIENT_COLORS[0]
  
  // Get index of recipient in sorted list
  const sortedRecipients = [...new Set(allRecipients)].sort()
  const index = sortedRecipients.indexOf(recipient)
  
  if (index === -1) return RECIPIENT_COLORS[0]
  
  return RECIPIENT_COLORS[index % RECIPIENT_COLORS.length]
}

/**
 * Get badge classes for recipient
 */
export const getRecipientBadgeClasses = (recipient, allRecipients = []) => {
  const colors = getRecipientColor(recipient, allRecipients)
  return `${colors.bg} ${colors.text} px-2 py-1 rounded text-xs font-medium`
}

/**
 * Get border color for recipient field
 */
export const getRecipientBorderColor = (recipient, allRecipients = []) => {
  const colors = getRecipientColor(recipient, allRecipients)
  return colors.color
}