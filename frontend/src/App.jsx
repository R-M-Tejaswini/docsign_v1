import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { DocumentsList } from './pages/DocumentsList'
import { DocumentEdit } from './pages/DocumentEdit'
import { TemplatesList } from './pages/TemplatesList'
import { TemplateEdit } from './pages/TemplateEdit'
import { PublicSign } from './pages/PublicSign'
import { WebhooksPage } from './pages/WebhooksPage'  // ✅ ADD

function Navigation() {
  const location = useLocation()
  
  // Hide navigation on public sign pages
  if (location.pathname.includes('/sign/')) {
    return null
  }

  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold text-blue-600">
            DocSign
          </Link>
          <div className="flex gap-4">
            <Link
              to="/templates"
              className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
            >
              Templates
            </Link>
            <Link
              to="/documents"
              className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
            >
              Documents
            </Link>
            <Link
              to="/webhooks"  // ✅ ADD
              className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
            >
              🪝 Webhooks
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        {/* Navigation - Hidden on public sign pages */}
        <Navigation />

        {/* Routes */}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/documents" element={<DocumentsList />} />
          <Route path="/documents/:id" element={<DocumentEdit />} />
          <Route path="/templates" element={<TemplatesList />} />
          <Route path="/templates/:id" element={<TemplateEdit />} />
          <Route path="/sign/:token" element={<PublicSign />} />
          <Route path="/webhooks" element={<WebhooksPage />} />  {/* ✅ ADD */}
        </Routes>
      </div>
    </Router>
  )
}

export default App
