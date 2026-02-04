import { Component } from 'react'
import { Button } from './ui/Button'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Error caught by boundary:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100">
          <div className="bg-white rounded-2xl shadow-2xl p-12 max-w-md text-center border-2 border-red-300">
            <div className="text-7xl mb-6">⚠️</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Something went wrong</h2>
            <p className="text-gray-600 text-lg leading-relaxed mb-6">
              {this.state.error?.message || 'An unexpected error occurred. Please try refreshing the page.'}
            </p>
            <Button
              onClick={() => window.location.reload()}
              variant="primary"
              size="lg"
            >
              Refresh Page
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}