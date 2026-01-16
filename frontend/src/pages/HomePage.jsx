import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'

export const HomePage = () => {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-4">
            DocSign
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Simple, secure document signing for everyone
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button
              onClick={() => navigate('/documents')}
              variant="primary"
              className="px-8 py-3 text-lg"
            >
              Create Document
            </Button>
            <Button
              onClick={() => navigate('/templates')}
              variant="secondary"
              className="px-8 py-3 text-lg"
            >
              Browse Templates
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
          {[
            {
              icon: '📄',
              title: 'Easy Document Upload',
              description: 'Upload PDFs or choose from templates to get started quickly'
            },
            {
              icon: '🔗',
              title: 'Generate Signing Links',
              description: 'Create unique signing links for each recipient with full control'
            },
            {
              icon: '✅',
              title: 'Track Signatures',
              description: 'Monitor signing progress and view audit trails in real-time'
            }
          ].map((feature, idx) => (
            <div key={idx} className="bg-white rounded-lg shadow-md p-8 text-center hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-600">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Call to Action */}
        <div className="bg-white rounded-lg shadow-lg p-12 mt-16 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Ready to get started?
          </h2>
          <p className="text-gray-600 mb-8">
            Create your first document or template in minutes
          </p>
          <Button
            onClick={() => navigate('/documents')}
            variant="primary"
            className="px-8 py-3 text-lg"
          >
            Get Started
          </Button>
        </div>
      </div>
    </div>
  )
}