// frontend/src/pages/HomePage.jsx
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'

export const HomePage = () => {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute top-40 right-10 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 py-20 sm:py-32">
          <div className="text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-lg mb-8 border border-blue-100">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
              </span>
              <span className="text-sm font-semibold text-gray-700">Simple, Secure, Professional</span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-gray-900 mb-6 leading-tight">
              Document Signing
              <span className="block bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Made Simple
              </span>
            </h1>

            <p className="text-xl sm:text-2xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed">
              Create, send, and track document signatures with enterprise-grade security.
              No complexity, just results.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Button
                onClick={() => navigate('/documents')}
                variant="primary"
                size="lg"
                className="px-8 py-4 text-lg shadow-xl"
              >
                <span>🚀</span>
                Create Document
              </Button>
              <Button
                onClick={() => navigate('/templates')}
                variant="secondary"
                size="lg"
                className="px-8 py-4 text-lg"
              >
                <span>📋</span>
                Browse Templates
              </Button>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap justify-center gap-8 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <span className="text-green-500 text-xl">✓</span>
                <span>256-bit Encryption</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-500 text-xl">✓</span>
                <span>Audit Trail</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-500 text-xl">✓</span>
                <span>Legally Binding</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Everything You Need
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Powerful features designed for modern teams
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              icon: '📄',
              title: 'Easy Document Upload',
              description: 'Upload PDFs or choose from reusable templates. Add signature fields with drag-and-drop simplicity.',
              gradient: 'from-blue-500 to-cyan-500'
            },
            {
              icon: '🔗',
              title: 'Generate Signing Links',
              description: 'Create unique, secure links for each recipient. Set expiration dates and track access in real-time.',
              gradient: 'from-indigo-500 to-purple-500'
            },
            {
              icon: '✅',
              title: 'Track & Verify',
              description: 'Monitor signing progress with live updates. Download tamper-proof audit trails for compliance.',
              gradient: 'from-purple-500 to-pink-500'
            }
          ].map((feature, idx) => (
            <div 
              key={idx} 
              className="group bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 p-8 border border-gray-100 hover:scale-105 cursor-default"
            >
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.gradient} mb-6 text-3xl shadow-lg group-hover:scale-110 transition-transform`}>
                {feature.icon}
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                {feature.title}
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-xl text-gray-600">Three simple steps to get started</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {/* Connecting Lines (hidden on mobile) */}
            <div className="hidden md:block absolute top-12 left-0 right-0 h-1 bg-gradient-to-r from-blue-200 via-indigo-200 to-purple-200"></div>

            {[
              { step: '1', title: 'Upload & Configure', desc: 'Upload your PDF and add signature fields', icon: '📤' },
              { step: '2', title: 'Generate Links', desc: 'Create secure signing links for recipients', icon: '🔗' },
              { step: '3', title: 'Track & Download', desc: 'Monitor progress and download signed docs', icon: '📥' },
            ].map((item, idx) => (
              <div key={idx} className="relative text-center">
                <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-4xl font-bold mb-6 shadow-xl z-10">
                  {item.icon}
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full flex items-center justify-center text-sm font-bold text-indigo-600 shadow-md">
                    {item.step}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="max-w-7xl mx-auto px-4 py-20">
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-3xl shadow-2xl p-12 text-center relative overflow-hidden">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
              backgroundSize: '40px 40px'
            }}></div>
          </div>

          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Ready to Get Started?
            </h2>
            <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
              Join thousands of teams who trust DocSign for their document signing needs
            </p>
            <Button
              onClick={() => navigate('/documents')}
              variant="secondary"
              size="xl"
              className="px-12 py-5 text-xl shadow-2xl hover:shadow-3xl"
            >
              Start Signing Now →
            </Button>
          </div>
        </div>
      </div>

      {/* Add blob animation styles */}
      <style>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  )
}