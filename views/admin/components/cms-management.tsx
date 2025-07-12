"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Plus, Search, Edit, Trash2, Eye, FileText, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { apiClient } from "@/lib/api"

interface CMSPage {
  id: string
  title: string
  slug: string
  content: string
  status: "published" | "draft"
  createdAt: string
  updatedAt: string
}

export default function CMSManagement() {
  const [pages, setPages] = useState<CMSPage[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [showPageForm, setShowPageForm] = useState(false)
  const [editingPage, setEditingPage] = useState<CMSPage | null>(null)

  useEffect(() => {
    fetchPages()
  }, [])

  const fetchPages = async () => {
    try {
      const data = await apiClient.getPages()
      setPages(data.pages || [])
    } catch (error) {
      console.error("Failed to fetch pages:", error)
      // Mock data for demo
      setPages([
        {
          id: "1",
          title: "About Us",
          slug: "about",
          content: "Welcome to Fragransia, your premier destination for luxury fragrances...",
          status: "published",
          createdAt: "2024-01-15T10:30:00Z",
          updatedAt: "2024-01-15T10:30:00Z",
        },
        {
          id: "2",
          title: "Privacy Policy",
          slug: "privacy-policy",
          content: "This Privacy Policy describes how we collect, use, and protect your information...",
          status: "published",
          createdAt: "2024-01-14T15:45:00Z",
          updatedAt: "2024-01-14T15:45:00Z",
        },
        {
          id: "3",
          title: "Terms & Conditions",
          slug: "terms-conditions",
          content: "By using our website, you agree to these terms and conditions...",
          status: "draft",
          createdAt: "2024-01-13T09:20:00Z",
          updatedAt: "2024-01-13T09:20:00Z",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePage = async (id: string) => {
    if (confirm("Are you sure you want to delete this page?")) {
      try {
        await apiClient.deletePage(id)
        setPages(pages.filter((p) => p.id !== id))
      } catch (error) {
        console.error("Failed to delete page:", error)
      }
    }
  }

  const handleEditPage = (page: CMSPage) => {
    setEditingPage(page)
    setShowPageForm(true)
  }

  const handlePageSaved = (page: CMSPage) => {
    if (editingPage) {
      setPages(pages.map((p) => (p.id === page.id ? page : p)))
    } else {
      setPages([page, ...pages])
    }
    setShowPageForm(false)
    setEditingPage(null)
  }

  const filteredPages = pages.filter(
    (page) =>
      page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.slug.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse"></div>
        <div className="grid grid-cols-1 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light text-gray-900">Content Management</h1>
        <Button onClick={() => setShowPageForm(true)} className="bg-black text-white flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Page
        </Button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Pages List */}
      <div className="space-y-4">
        {filteredPages.map((page, index) => (
          <motion.div
            key={page.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-medium text-gray-900">{page.title}</h3>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      page.status === "published" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {page.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-2">/{page.slug}</p>
                <p className="text-gray-600 text-sm line-clamp-2">{page.content}</p>
                <p className="text-xs text-gray-400 mt-2">Updated: {new Date(page.updatedAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <Button variant="ghost" size="sm" onClick={() => window.open(`/${page.slug}`, "_blank")}>
                  <Eye className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleEditPage(page)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => handleDeletePage(page.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {filteredPages.length === 0 && (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No pages found</p>
        </div>
      )}

      {/* Page Form Modal */}
      {showPageForm && (
        <PageForm
          page={editingPage}
          onSave={handlePageSaved}
          onClose={() => {
            setShowPageForm(false)
            setEditingPage(null)
          }}
        />
      )}
    </div>
  )
}

// Page Form Component
interface PageFormProps {
  page?: CMSPage | null
  onSave: (page: CMSPage) => void
  onClose: () => void
}

function PageForm({ page, onSave, onClose }: PageFormProps) {
  const [formData, setFormData] = useState<Omit<CMSPage, "id" | "createdAt" | "updatedAt">>({
    title: "",
    slug: "",
    content: "",
    status: "draft",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (page) {
      setFormData({
        title: page.title,
        slug: page.slug,
        content: page.content,
        status: page.status,
      })
    }
  }, [page])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      let savedPage: CMSPage
      if (page?.id) {
        savedPage = await apiClient.updatePage(page.id, formData)
      } else {
        savedPage = await apiClient.createPage(formData)
      }
      onSave(savedPage)
    } catch (error: any) {
      setError(error.message || "Failed to save page")
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))

    // Auto-generate slug from title
    if (name === "title" && !page) {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
      setFormData((prev) => ({
        ...prev,
        slug,
      }))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-light text-gray-900">{page ? "Edit Page" : "Add New Page"}</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Page Title *</label>
                <Input
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="Enter page title"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">URL Slug *</label>
                <Input name="slug" value={formData.slug} onChange={handleChange} placeholder="page-url-slug" required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status *</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                required
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Content *</label>
              <Textarea
                name="content"
                value={formData.content}
                onChange={handleChange}
                placeholder="Enter page content..."
                rows={12}
                required
              />
            </div>

            <div className="flex gap-4 pt-6">
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-black text-white hover:bg-gray-800 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {loading ? "Saving..." : "Save Page"}
              </Button>
              <Button type="button" onClick={onClose} variant="outline" className="flex-1 bg-transparent">
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
