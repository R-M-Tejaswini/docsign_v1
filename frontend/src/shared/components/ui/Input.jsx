/**
 * ✅ UNIFIED: Reusable input component
 * Used across all forms for consistency
 */

export const Input = ({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  disabled = false,
  required = false,
  error = null,
  className = '',
  ...props
}) => {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-bold text-gray-900">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`
          w-full px-4 py-2.5 border-2 rounded-lg 
          focus:outline-none focus:ring-2 focus:ring-blue-500 
          disabled:bg-gray-100 disabled:cursor-not-allowed
          transition-all duration-200
          ${error ? 'border-red-500' : 'border-gray-300 hover:border-gray-400'}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}