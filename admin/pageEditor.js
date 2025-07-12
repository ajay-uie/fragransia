const admin = require('firebase-admin');
const { validateInput } = require('../utils/validateInput');
const { generateID } = require('../utils/generateID');

// Create/Update page
const savePage = async (req, res) => {
  try {
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'manager'].includes(userDoc.data().role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    const {
      pageId,
      title,
      slug,
      content,
      metaTitle,
      metaDescription,
      metaKeywords,
      status = 'draft', // draft, published, archived
      template = 'default',
      customCSS,
      customJS,
      isHomepage = false,
      sections
    } = req.body;

    // Validate required fields
    if (!title || !slug) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['title', 'slug']
      });
    }

    // Validate slug format
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) {
      return res.status(400).json({
        error: 'Invalid slug format',
        message: 'Slug can only contain lowercase letters, numbers, and hyphens'
      });
    }

    const finalPageId = pageId || generateID.generatePageId();

    // Check if slug is unique (excluding current page if updating)
    const existingPageQuery = await db.collection('pages')
      .where('slug', '==', slug)
      .get();

    if (!existingPageQuery.empty) {
      const existingPage = existingPageQuery.docs[0];
      if (existingPage.id !== finalPageId) {
        return res.status(409).json({
          error: 'Slug already exists',
          message: 'Choose a different slug'
        });
      }
    }

    // If setting as homepage, unset current homepage
    if (isHomepage) {
      const currentHomepageQuery = await db.collection('pages')
        .where('isHomepage', '==', true)
        .get();

      const batch = db.batch();
      currentHomepageQuery.forEach(doc => {
        if (doc.id !== finalPageId) {
          batch.update(doc.ref, { isHomepage: false });
        }
      });
      await batch.commit();
    }

    const pageData = {
      id: finalPageId,
      title,
      slug,
      content: content || '',
      sections: sections || [],
      template,
      customCSS: customCSS || '',
      customJS: customJS || '',
      status,
      isHomepage,
      seo: {
        title: metaTitle || title,
        description: metaDescription || '',
        keywords: metaKeywords || [],
        canonicalUrl: `/${slug}`
      },
      analytics: {
        views: 0,
        uniqueViews: 0,
        avgTimeOnPage: 0,
        bounceRate: 0
      },
      lastPublished: status === 'published' ? admin.firestore.FieldValue.serverTimestamp() : null,
      createdBy: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Check if page exists
    const existingPageDoc = await db.collection('pages').doc(finalPageId).get();
    
    if (existingPageDoc.exists) {
      // Update existing page
      const updateData = { ...pageData };
      delete updateData.createdAt;
      delete updateData.createdBy;
      updateData.updatedBy = userId;

      await db.collection('pages').doc(finalPageId).update(updateData);

      // Log admin activity
      await db.collection('admin_activity').add({
        userId,
        action: 'update_page',
        resourceType: 'page',
        resourceId: finalPageId,
        details: {
          title,
          slug,
          status
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      res.status(200).json({
        success: true,
        message: 'Page updated successfully',
        pageId: finalPageId
      });
    } else {
      // Create new page
      await db.collection('pages').doc(finalPageId).set(pageData);

      // Log admin activity
      await db.collection('admin_activity').add({
        userId,
        action: 'create_page',
        resourceType: 'page',
        resourceId: finalPageId,
        details: {
          title,
          slug,
          status
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      res.status(201).json({
        success: true,
        message: 'Page created successfully',
        pageId: finalPageId
      });
    }

  } catch (error) {
    console.error('Save page error:', error);
    res.status(500).json({
      error: 'Failed to save page',
      message: error.message
    });
  }
};

// Get all pages
const getAllPages = async (req, res) => {
  try {
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'manager', 'staff'].includes(userDoc.data().role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    const {
      page = 1,
      limit = 20,
      status,
      template,
      search,
      sortBy = 'updatedAt',
      sortOrder = 'desc'
    } = req.query;

    let query = db.collection('pages');

    // Apply filters
    if (status) {
      query = query.where('status', '==', status);
    }

    if (template) {
      query = query.where('template', '==', template);
    }

    // Apply sorting
    const validSortFields = ['createdAt', 'updatedAt', 'title', 'lastPublished'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'updatedAt';
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    
    query = query.orderBy(sortField, sortDirection);

    const snapshot = await query.get();
    let pages = [];

    snapshot.forEach(doc => {
      const pageData = doc.data();
      
      // Apply search filtering
      let includePage = true;
      if (search) {
        const searchTerm = search.toLowerCase();
        const searchableText = `${pageData.title} ${pageData.slug} ${pageData.content}`.toLowerCase();
        
        if (!searchableText.includes(searchTerm)) {
          includePage = false;
        }
      }

      if (includePage) {
        pages.push({
          id: doc.id,
          title: pageData.title,
          slug: pageData.slug,
          status: pageData.status,
          template: pageData.template,
          isHomepage: pageData.isHomepage,
          analytics: pageData.analytics,
          lastPublished: pageData.lastPublished?.toDate()?.toISOString(),
          createdAt: pageData.createdAt?.toDate()?.toISOString(),
          updatedAt: pageData.updatedAt?.toDate()?.toISOString()
        });
      }
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedPages = pages.slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      pages: paginatedPages,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(pages.length / parseInt(limit)),
        totalPages: pages.length,
        hasNextPage: endIndex < pages.length,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get all pages error:', error);
    res.status(500).json({
      error: 'Failed to fetch pages',
      message: error.message
    });
  }
};

// Get page by ID or slug
const getPage = async (req, res) => {
  try {
    const { identifier } = req.params; // Can be ID or slug
    const { preview = false } = req.query;

    const db = admin.firestore();

    let pageDoc;

    // Try to get by ID first, then by slug
    pageDoc = await db.collection('pages').doc(identifier).get();
    
    if (!pageDoc.exists) {
      // Try to find by slug
      const slugQuery = await db.collection('pages')
        .where('slug', '==', identifier)
        .limit(1)
        .get();

      if (slugQuery.empty) {
        return res.status(404).json({
          error: 'Page not found'
        });
      }

      pageDoc = slugQuery.docs[0];
    }

    const page = pageDoc.data();

    // Check if user can view this page
    const authHeader = req.headers.authorization;
    let isAdmin = false;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        isAdmin = userDoc.exists && ['admin', 'manager', 'staff'].includes(userDoc.data().role);
      } catch (error) {
        // Invalid token, treat as public user
      }
    }

    // Only show published pages to non-admin users (unless preview mode)
    if (!isAdmin && !preview && page.status !== 'published') {
      return res.status(404).json({
        error: 'Page not found'
      });
    }

    // Track page view (only for published pages and non-preview mode)
    if (page.status === 'published' && !preview) {
      await db.collection('pages').doc(pageDoc.id).update({
        'analytics.views': admin.firestore.FieldValue.increment(1)
      });

      // Log page view
      await db.collection('page_analytics').add({
        pageId: pageDoc.id,
        slug: page.slug,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        referrer: req.get('Referrer') || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.status(200).json({
      success: true,
      page: {
        id: pageDoc.id,
        ...page,
        createdAt: page.createdAt?.toDate()?.toISOString(),
        updatedAt: page.updatedAt?.toDate()?.toISOString(),
        lastPublished: page.lastPublished?.toDate()?.toISOString()
      }
    });

  } catch (error) {
    console.error('Get page error:', error);
    res.status(500).json({
      error: 'Failed to fetch page',
      message: error.message
    });
  }
};

// Delete page
const deletePage = async (req, res) => {
  try {
    const { pageId } = req.params;
    
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete pages' });
    }

    // Check if page exists
    const pageDoc = await db.collection('pages').doc(pageId).get();
    if (!pageDoc.exists) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const page = pageDoc.data();

    // Prevent deletion of homepage
    if (page.isHomepage) {
      return res.status(400).json({
        error: 'Cannot delete homepage',
        message: 'Set another page as homepage before deleting this page'
      });
    }

    // Soft delete - archive the page
    await db.collection('pages').doc(pageId).update({
      status: 'archived',
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedBy: userId
    });

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'delete_page',
      resourceType: 'page',
      resourceId: pageId,
      details: {
        title: page.title,
        slug: page.slug
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Page deleted successfully',
      pageId
    });

  } catch (error) {
    console.error('Delete page error:', error);
    res.status(500).json({
      error: 'Failed to delete page',
      message: error.message
    });
  }
};

// Duplicate page
const duplicatePage = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { title, slug } = req.body;
    
    // Check admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = admin.firestore();
    
    // Verify admin role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'manager'].includes(userDoc.data().role)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }

    // Check if source page exists
    const sourcePageDoc = await db.collection('pages').doc(pageId).get();
    if (!sourcePageDoc.exists) {
      return res.status(404).json({ error: 'Source page not found' });
    }

    const sourcePage = sourcePageDoc.data();
    const newPageId = generateID.generatePageId();
    const newSlug = slug || `${sourcePage.slug}-copy`;

    // Check if new slug is unique
    const existingSlugQuery = await db.collection('pages')
      .where('slug', '==', newSlug)
      .get();

    if (!existingSlugQuery.empty) {
      return res.status(409).json({
        error: 'Slug already exists',
        message: 'Choose a different slug'
      });
    }

    // Create duplicate page
    const duplicatePageData = {
      ...sourcePage,
      id: newPageId,
      title: title || `${sourcePage.title} (Copy)`,
      slug: newSlug,
      status: 'draft',
      isHomepage: false, // Never duplicate as homepage
      analytics: {
        views: 0,
        uniqueViews: 0,
        avgTimeOnPage: 0,
        bounceRate: 0
      },
      lastPublished: null,
      createdBy: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('pages').doc(newPageId).set(duplicatePageData);

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'duplicate_page',
      resourceType: 'page',
      resourceId: newPageId,
      details: {
        sourcePageId: pageId,
        sourceTitle: sourcePage.title,
        newTitle: duplicatePageData.title,
        newSlug: newSlug
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: 'Page duplicated successfully',
      pageId: newPageId,
      page: {
        id: newPageId,
        title: duplicatePageData.title,
        slug: newSlug,
        status: 'draft'
      }
    });

  } catch (error) {
    console.error('Duplicate page error:', error);
    res.status(500).json({
      error: 'Failed to duplicate page',
      message: error.message
    });
  }
};

// Get page templates
const getPageTemplates = async (req, res) => {
  try {
    const templates = [
      {
        id: 'default',
        name: 'Default Page',
        description: 'Basic page template with header and footer',
        thumbnail: '/templates/default.jpg',
        sections: ['header', 'content', 'footer']
      },
      {
        id: 'landing',
        name: 'Landing Page',
        description: 'Conversion-focused landing page template',
        thumbnail: '/templates/landing.jpg',
        sections: ['hero', 'features', 'testimonials', 'cta']
      },
      {
        id: 'about',
        name: 'About Page',
        description: 'Company information and team showcase',
        thumbnail: '/templates/about.jpg',
        sections: ['hero', 'story', 'team', 'values']
      },
      {
        id: 'contact',
        name: 'Contact Page',
        description: 'Contact form and business information',
        thumbnail: '/templates/contact.jpg',
        sections: ['hero', 'contact_form', 'map', 'info']
      }
    ];

    res.status(200).json({
      success: true,
      templates
    });

  } catch (error) {
    console.error('Get page templates error:', error);
    res.status(500).json({
      error: 'Failed to fetch page templates',
      message: error.message
    });
  }
};

module.exports = {
  savePage,
  getAllPages,
  getPage,
  deletePage,
  duplicatePage,
  getPageTemplates
};
