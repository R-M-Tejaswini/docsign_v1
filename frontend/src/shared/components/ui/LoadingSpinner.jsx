/**
 * ✅ UNIFIED: Reusable loading spinner
 */

export const LoadingSpinner = ({
  size = 'md',
  message = 'Loading...',
  fullScreen = false,
}) => {
  const sizeClasses = {
    sm: 'h-6 w-6 border-2',
    md: 'h-12 w-12 border-4',
    lg: 'h-16 w-16 border-4',
  }

  const spinner = (
    <div className="text-center">
      <div
        className={`${sizeClasses[size]} border-blue-600 border-b-transparent rounded-full animate-spin mx-auto mb-4`}
      ></div>
      {message && <p className="text-gray-600 font-medium">{message}</p>}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        {spinner}
      </div>
    )
  }

  return spinner
}