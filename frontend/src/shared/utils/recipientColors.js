/**
 * Recipient color utilities
 */

const colors = [
  { name: 'red', bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  { name: 'blue', bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  { name: 'green', bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  { name: 'purple', bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  { name: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  { name: 'pink', bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
]

/**
 * Get badge classes for a recipient based on their name
 * @param {string} recipientName - Recipient name
 * @param {array} allRecipients - Optional: all recipients for context
 * @returns {string} Tailwind classes for badge styling
 */
export const getRecipientBadgeClasses = (recipientName, allRecipients = []) => {
  if (!recipientName) return ''
  
  // Use character code to consistently map names to colors
  const index = recipientName.charCodeAt(0) % colors.length
  const color = colors[index]
  
  return `${color.bg} ${color.text} px-3 py-1 rounded-full text-xs font-bold border border-current`
}

export default colors