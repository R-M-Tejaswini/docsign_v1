import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { TemplatesList } from './pages/TemplatesList'
import { TemplateEdit } from './pages/TemplateEdit'
import { DocumentsList } from './pages/DocumentsList'
import { DocumentEdit } from './pages/DocumentEdit'
import { PublicSign } from './pages/PublicSign'

function App() {
  const [count, setCount] = useState(0)

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        {/* Navigation */}
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex justify-between items-center">
              <Link to="/" className="text-2xl font-bold text-blue-600">
                DocSign
              </Link>
              <div className="flex gap-4">
                <Link
                  to="/templates"
                  className="text-gray-600 hover:text-gray-900 font-medium"
                >
                  Templates
                </Link>
                <Link
                  to="/documents"
                  className="text-gray-600 hover:text-gray-900 font-medium"
                >
                  Documents
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Routes */}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/templates" element={<TemplatesList />} />
          <Route path="/templates/:id/edit" element={<TemplateEdit />} />
          <Route path="/documents" element={<DocumentsList />} />
          <Route path="/documents/:id/edit" element={<DocumentEdit />} />
          <Route path="/sign/:token" element={<PublicSign />} />
        </Routes>
      </div>
    </Router>
  )
}

function HomePage() {
  return (
    <div className="max-w-6xl mx-auto py-16 px-4 text-center">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">Welcome to DocSign</h1>
      <p className="text-xl text-gray-600 mb-8">
        Create templates, generate documents, and manage signing workflows
      </p>
      <div className="grid md:grid-cols-2 gap-8">
        <Link
          to="/templates"
          className="bg-white rounded-lg shadow-md p-8 hover:shadow-lg transition-shadow"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-2">📋 Templates</h2>
          <p className="text-gray-600">
            Upload and manage PDF templates with predefined field locations
          </p>
        </Link>
        <Link
          to="/documents"
          className="bg-white rounded-lg shadow-md p-8 hover:shadow-lg transition-shadow"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-2">📄 Documents</h2>
          <p className="text-gray-600">
            Create documents from templates and manage signing workflows
          </p>
        </Link>
      </div>
    </div>
  )
}

export default App
