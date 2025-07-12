const admin = require('firebase-admin');
const { validateInput } = require('../utils/validateInput');
const { generateID } = require('../utils/generateID');

// Create blog post
const createBlogPost = async (req, res) => {
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
      title,
      content,
      excerpt,
      featuredImage,
      category,
      tags,
      status = 'draft',
      publishDate,
      metaTitle,
      metaDescription,
      slug
    } = req.body;

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['title', 'content']
      });
    }

    // Generate slug if not provided
    const postSlug = slug || title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Check if slug already exists
    const existingPost = await db.collection('blog_posts')
      .where('slug', '==', postSlug)
      .get();

    if (!existingPost.empty) {
      return res.status(409).json({
        error: 'Slug already exists',
        message: 'Choose a different slug or title'
      });
    }

    const postId = generateID.generateBlogPostId();

    const postData = {
      id: postId,
      title,
      content,
      excerpt: excerpt || content.substring(0, 200) + '...',
      featuredImage: featuredImage || null,
      category: category || 'general',
      tags: tags || [],
      status,
      publishDate: publishDate ? new Date(publishDate) : null,
      slug: postSlug,
      seo: {
        title: metaTitle || title,
        description: metaDescription || excerpt || content.substring(0, 160),
        keywords: tags || []
      },
      views: 0,
      likes: 0,
      shares: 0,
      authorId: userId,
      authorName: `${userDoc.data().firstName} ${userDoc.data().lastName}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('blog_posts').doc(postId).set(postData);

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'create_blog_post',
      resourceType: 'blog_post',
      resourceId: postId,
      details: {
        title,
        status,
        category
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: 'Blog post created successfully',
      post: {
        id: postId,
        title,
        slug: postSlug,
        status
      }
    });

  } catch (error) {
    console.error('Create blog post error:', error);
    res.status(500).json({
      error: 'Failed to create blog post',
      message: error.message
    });
  }
};

// Get all blog posts
const getAllBlogPosts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      category,
      tag,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const db = admin.firestore();
    let query = db.collection('blog_posts');

    // Public users only see published posts
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

    // Apply filters
    if (!isAdmin) {
      query = query.where('status', '==', 'published');
    } else if (status) {
      query = query.where('status', '==', status);
    }

    if (category) {
      query = query.where('category', '==', category);
    }

    if (tag) {
      query = query.where('tags', 'array-contains', tag);
    }

    // Apply sorting
    const validSortFields = ['createdAt', 'publishDate', 'views', 'title'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    
    query = query.orderBy(sortField, sortDirection);

    const snapshot = await query.get();
    let posts = [];

    snapshot.forEach(doc => {
      const postData = doc.data();
      
      // Apply search filtering
      let includePost = true;
      if (search) {
        const searchTerm = search.toLowerCase();
        const searchableText = `${postData.title} ${postData.excerpt} ${postData.content} ${postData.tags?.join(' ')}`.toLowerCase();
        
        if (!searchableText.includes(searchTerm)) {
          includePost = false;
        }
      }

      // Only show published posts that are past their publish date for public users
      if (!isAdmin && postData.publishDate && new Date(postData.publishDate.seconds * 1000) > new Date()) {
        includePost = false;
      }

      if (includePost) {
        posts.push({
          id: doc.id,
          ...postData,
          content: isAdmin ? postData.content : undefined, // Don't send full content for list view
          createdAt: postData.createdAt?.toDate()?.toISOString(),
          updatedAt: postData.updatedAt?.toDate()?.toISOString(),
          publishDate: postData.publishDate?.toDate()?.toISOString()
        });
      }
    });

    // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedPosts = posts.slice(startIndex, endIndex);

    // Get categories for filtering
    const categories = [...new Set(posts.map(p => p.category))].filter(Boolean);

    res.status(200).json({
      success: true,
      posts: paginatedPosts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(posts.length / parseInt(limit)),
        totalPosts: posts.length,
        hasNextPage: endIndex < posts.length,
        hasPrevPage: parseInt(page) > 1
      },
      filters: {
        categories
      }
    });

  } catch (error) {
    console.error('Get all blog posts error:', error);
    res.status(500).json({
      error: 'Failed to fetch blog posts',
      message: error.message
    });
  }
};

// Get blog post by slug
const getBlogPostBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const db = admin.firestore();

    const postQuery = await db.collection('blog_posts')
      .where('slug', '==', slug)
      .limit(1)
      .get();

    if (postQuery.empty) {
      return res.status(404).json({
        error: 'Blog post not found',
        message: 'The requested blog post does not exist'
      });
    }

    const postDoc = postQuery.docs[0];
    const post = postDoc.data();

    // Check if user is admin or post is published
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

    // Check access permissions
    if (!isAdmin) {
      if (post.status !== 'published') {
        return res.status(404).json({ error: 'Blog post not found' });
      }
      
      if (post.publishDate && new Date(post.publishDate.seconds * 1000) > new Date()) {
        return res.status(404).json({ error: 'Blog post not found' });
      }
    }

    // Increment view count for published posts
    if (post.status === 'published' && (!post.publishDate || new Date(post.publishDate.seconds * 1000) <= new Date())) {
      await db.collection('blog_posts').doc(postDoc.id).update({
        views: admin.firestore.FieldValue.increment(1)
      });
    }

    // Get related posts
    const relatedQuery = await db.collection('blog_posts')
      .where('category', '==', post.category)
      .where('status', '==', 'published')
      .limit(4)
      .get();

    const relatedPosts = [];
    relatedQuery.forEach(doc => {
      if (doc.id !== postDoc.id) {
        const relatedPost = doc.data();
        relatedPosts.push({
          id: doc.id,
          title: relatedPost.title,
          slug: relatedPost.slug,
          excerpt: relatedPost.excerpt,
          featuredImage: relatedPost.featuredImage,
          publishDate: relatedPost.publishDate?.toDate()?.toISOString()
        });
      }
    });

    res.status(200).json({
      success: true,
      post: {
        id: postDoc.id,
        ...post,
        createdAt: post.createdAt?.toDate()?.toISOString(),
        updatedAt: post.updatedAt?.toDate()?.toISOString(),
        publishDate: post.publishDate?.toDate()?.toISOString()
      },
      relatedPosts
    });

  } catch (error) {
    console.error('Get blog post by slug error:', error);
    res.status(500).json({
      error: 'Failed to fetch blog post',
      message: error.message
    });
  }
};

// Update blog post
const updateBlogPost = async (req, res) => {
  try {
    const { postId } = req.params;
    
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

    // Check if post exists
    const postDoc = await db.collection('blog_posts').doc(postId).get();
    if (!postDoc.exists) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    const updateData = { ...req.body };

    // Update slug if title changed
    if (updateData.title && updateData.title !== postDoc.data().title) {
      const newSlug = updateData.slug || updateData.title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      // Check if new slug already exists
      const existingPost = await db.collection('blog_posts')
        .where('slug', '==', newSlug)
        .get();

      if (!existingPost.empty && existingPost.docs[0].id !== postId) {
        return res.status(409).json({
          error: 'Slug already exists',
          message: 'Choose a different slug or title'
        });
      }

      updateData.slug = newSlug;
    }

    // Convert date strings to Date objects
    if (updateData.publishDate) {
      updateData.publishDate = new Date(updateData.publishDate);
    }

    // Update SEO data if provided
    if (updateData.metaTitle || updateData.metaDescription) {
      updateData.seo = {
        ...postDoc.data().seo,
        title: updateData.metaTitle || postDoc.data().seo?.title,
        description: updateData.metaDescription || postDoc.data().seo?.description,
        keywords: updateData.tags || postDoc.data().tags || []
      };
      
      delete updateData.metaTitle;
      delete updateData.metaDescription;
    }

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Add update metadata
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    updateData.updatedBy = userId;

    // Update post
    await db.collection('blog_posts').doc(postId).update(updateData);

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'update_blog_post',
      resourceType: 'blog_post',
      resourceId: postId,
      details: {
        updatedFields: Object.keys(updateData),
        title: updateData.title || postDoc.data().title
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Blog post updated successfully',
      postId
    });

  } catch (error) {
    console.error('Update blog post error:', error);
    res.status(500).json({
      error: 'Failed to update blog post',
      message: error.message
    });
  }
};

// Delete blog post
const deleteBlogPost = async (req, res) => {
  try {
    const { postId } = req.params;
    
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

    // Check if post exists
    const postDoc = await db.collection('blog_posts').doc(postId).get();
    if (!postDoc.exists) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    const post = postDoc.data();

    // Soft delete - update status to deleted
    await db.collection('blog_posts').doc(postId).update({
      status: 'deleted',
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedBy: userId
    });

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: 'delete_blog_post',
      resourceType: 'blog_post',
      resourceId: postId,
      details: {
        title: post.title,
        category: post.category
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Blog post deleted successfully',
      postId
    });

  } catch (error) {
    console.error('Delete blog post error:', error);
    res.status(500).json({
      error: 'Failed to delete blog post',
      message: error.message
    });
  }
};

module.exports = {
  createBlogPost,
  getAllBlogPosts,
  getBlogPostBySlug,
  updateBlogPost,
  deleteBlogPost
};
