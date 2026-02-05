/**
 * ✅ SPLIT: Thin container for PublicSign
 * - Token validation
 * - Route to appropriate sub-component
 * - Handle errors
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApi } from '../../../../shared/hooks/useApi'
import { useToast } from '../../../../shared/hooks/useToast'
import { publicAPI } from '../../api'
import { SigningForm } from './SigningForm'
import { ViewOnlyDisplay } from './ViewOnlyDisplay'
import { SignaturePreview } from './SignaturePreview'
import { Toast } from '../../../../shared/components/ui/Toast'

export const PublicSign = () => {
  const { token } = useParams()
  const navigate = useNavigate()
  const [pageData, setPageData] = useState(null)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const { toasts, addToast } = useToast()

  const { execute: getSignPage } = useApi(() => publicAPI.getSignPage(token))

  useEffect(() => {
    loadSignPage()
  }, [token])

  const loadSignPage = async () => {
    setIsLoading(true)
    try {
      const response = await getSignPage()
      // ✅ FIXED: Extract .data from axios response
      const data = response.data || response
      console.log('✅ PublicSign loaded pageData:', data)
      setPageData(data)
      setError(null)
    } catch (err) {
      const errorData = err.response?.data || {}
      console.error('❌ PublicSign load error:', err)
      setPageData(null)
      setError({
        message: errorData.error || 'Invalid or expired token',
        type: errorData.errorType || 'invalid',
      })
      addToast('Invalid or expired token', 'error')
      setTimeout(() => navigate('/'), 2000)
    } finally {
      setIsLoading(false)
    }
  }

  // ✅ GUARD: Show loading while fetching
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-4"></div>
          <p className="text-gray-600 font-medium">Loading signing page...</p>
        </div>
      </div>
    )
  }

  // ✅ GUARD: Show error if failed
  if (error) {
    return <ErrorDisplay error={error} />
  }

  // ✅ GUARD: Ensure pageData exists and has document
  if (!pageData?.document) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center bg-white p-8 rounded-lg border-2 border-red-300">
          <p className="text-6xl mb-4">❌</p>
          <p className="text-gray-600 font-medium">No document data available</p>
        </div>
      </div>
    )
  }

  console.log('📄 PublicSign rendering with pageData:', {
    document: pageData.document?.id,
    isEditable: pageData.is_editable,
    scope: pageData.scope,
    used: pageData.used,
  })

  // Show appropriate component based on document state
  if (pageData.used || pageData.scope === 'view') {
    console.log('📄 Showing ViewOnlyDisplay')
    return <ViewOnlyDisplay pageData={pageData} />
  }

  if (pageData.is_editable && pageData.scope === 'sign') {
    console.log('📄 Showing SigningForm')
    return <SigningForm token={token} pageData={pageData} onSuccess={loadSignPage} addToast={addToast} />
  }

  console.log('📄 Showing SignaturePreview (fallback)')
  return <SignaturePreview pageData={pageData} />
}

function ErrorDisplay({ error }) {
  let icon = '❌'
  let title = 'Access Denied'
  let description = error.message
  let bgGradient = 'from-red-50 to-red-100'

  if (error.type === 'revoked') {
    icon = '🔗'
    title = 'Link Revoked'
    description = 'This signing link has been revoked.'
    bgGradient = 'from-gray-50 to-gray-100'
  } else if (error.type === 'expired') {
    icon = '⏰'
    title = 'Link Expired'
    description = 'This signing link has expired. Please request a new one.'
    bgGradient = 'from-yellow-50 to-yellow-100'
  } else if (error.type === 'used') {
    icon = '✓'
    title = 'Already Signed'
    description = 'This document has already been signed with this link.'
    bgGradient = 'from-green-50 to-green-100'
  }

  return (
    <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br ${bgGradient}`}>
      <div className="bg-white rounded-2xl shadow-2xl p-12 max-w-md text-center border-2 border-gray-200">
        <div className="text-7xl mb-6">{icon}</div>
        <h2 className="text-3xl font-bold text-gray-900 mb-3">{title}</h2>
        <p className="text-gray-600 text-lg leading-relaxed">{description}</p>
      </div>
    </div>
  )
}