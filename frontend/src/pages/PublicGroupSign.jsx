// frontend/src/pages/PublicGroupSign.jsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { groupAPI } from '../services/api'
import { PublicSign } from './PublicSign' // Reusing existing component

export const PublicGroupSign = () => {
  const { token } = useParams() // Group Token
  const [currentStep, setCurrentStep] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [completed, setCompleted] = useState(false)

  // Polling / Fetching Logic
  const fetchNextStep = async () => {
    setLoading(true)
    try {
      const response = await groupAPI.getNextItem(token)
      const data = response.data
      
      if (data.status === 'COMPLETED') {
        setCompleted(true)
      } else if (data.status === 'PENDING') {
        setCurrentStep(data.next_step)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load signing session')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNextStep()
  }, [token])

  // Callback to handle single document completion
  const handleDocumentCompleted = () => {
    // Re-fetch to get the NEXT document in the sequence
    fetchNextStep()
  }

  if (loading && !currentStep) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-4 mx-auto"></div>
          <p className="text-gray-600">Loading your secure session...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="max-w-md p-8 bg-white rounded-xl shadow-lg text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Session Error</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  if (completed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <div className="max-w-md p-8 bg-white rounded-xl shadow-lg text-center">
          <div className="text-6xl mb-6">🎉</div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">All Set!</h2>
          <p className="text-xl text-gray-600 mb-8">
            You have successfully signed all documents in this package.
          </p>
          <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-500">
            A copy of the signed documents has been sent to your email.
          </div>
        </div>
      </div>
    )
  }

  // Render the EXISTING PublicSign component
  // We need to make sure PublicSign accepts a token prop directly, 
  // or we mock the URL parameter if it relies solely on useParams().
  // Assuming PublicSign can accept `token` as a prop or we key it to force remount.
  
  if (currentStep) {
    return (
      <div>
        {/* Progress Header */}
        <div className="bg-indigo-900 text-white px-6 py-3 flex justify-between items-center sticky top-0 z-50">
          <div className="font-semibold">
            Package Signing Session
          </div>
          <div className="text-sm bg-indigo-800 px-3 py-1 rounded-full">
            Document {currentStep.order + 1}
          </div>
        </div>

        {/* KEY: We pass the *Document* token (not group token) to the signer.
           We add a `key` prop to force React to destroy and recreate the component
           when the token changes (moving to next doc).
        */}
        <PublicSign 
          key={currentStep.signing_token.token} 
          tokenProp={currentStep.signing_token.token} 
          onComplete={handleDocumentCompleted} 
        />
      </div>
    )
  }

  return null
}