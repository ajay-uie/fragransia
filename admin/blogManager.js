const express = require('express');
const {
  createBlogPost,
  getAllBlogPosts,
  getBlogPostBySlug,
  updateBlogPost,
  deleteBlogPost
} = require('../database/blogPosts');
const { requireAdminAuth } = require('../auth/adminAuthCheck');

const router = express.Router();

// Apply admin authentication to all routes
router.use(requireAdminAuth);

// Get all blog posts for admin
router.get('/', getAllBlogPosts);

// Get blog post by slug
router.get('/:slug', getBlogPostBySlug);

// Create new blog post
router.post('/', createBlogPost);

// Update blog post
router.put('/:postId', updateBlogPost);

// Delete blog post
router.delete('/:postId', deleteBlogPost);

// Bulk blog post operations
router.patch('/bulk', async (req, res) => {
  try {
    const { postIds, action, data } = req.body;

    if (!postIds || !Array.isArray(postIds) || postIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid post IDs',
        message: 'Post IDs array is required'
      });
    }

    const admin = require('firebase-admin');
    const db = admin.firestore();
    const batch = db.batch();
    const userId = req.user.uid;

    switch (action) {
      case 'publish':
        postIds.forEach(postId => {
          const postRef = db.collection('blog_posts').doc(postId);
          batch.update(postRef, {
            status: 'published',
            publishDate: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: userId
          });
        });
        break;

      case 'draft':
        postIds.forEach(postId => {
          const postRef = db.collection('blog_posts').doc(postId);
          batch.update(postRef, {
            status: 'draft',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: userId
          });
        });
        break;

      case 'archive':
        postIds.forEach(postId => {
          const postRef = db.collection('blog_posts').doc(postId);
          batch.update(postRef, {
            status: 'archived',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: userId
          });
        });
        break;

      case 'update_category':
        if (!data.category) {
          return res.status(400).json({
            error: 'Category is required for update_category action'
          });
        }

        postIds.forEach(postId => {
          const postRef = db.collection('blog_posts').doc(postId);
          batch.update(postRef, {
            category: data.category,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: userId
          });
        });
        break;

      default:
        return res.status(400).json({
          error: 'Invalid action',
          message: 'Action must be publish, draft, archive, or update_category'
        });
    }

    await batch.commit();

    // Log admin activity
    await db.collection('admin_activity').add({
      userId,
      action: `bulk_${action}_blog_posts`,
      resourceType: 'blog_post',
      details: {
        postIds,
        action,
        data: data || null,
        count: postIds.length
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: `Bulk ${action} completed successfully`,
      affectedPosts: postIds.length
    });

  } catch (error) {
    console.error('Bulk blog post operation error:', error);
    res.status(500).json({
      error: 'Failed to perform bulk operation',
      message: error.message
    });
  }
});

// Get blog categories
router.get('/categories/list', async (req, res) => {
  try {
    const admin = require('firebase-admin');
    const db = admin.firestore();

    // Get all blog posts to extract categories
    const postsSnapshot = await db.collection('blog_posts').get();
    const categories = new Set();

    postsSnapshot.forEach(doc => {
      const post = doc.data();
      if (post.category) {
        categories.add(post.category);
      }
    });

    // Get category counts
    const categoryStats = {};
    for (const category of categories) {
      const categoryPosts = await db.collection('blog_posts')
        .where('category', '==', category)
        .where('status', '==', 'published')
        .get();
      
      categoryStats[category] = categoryPosts.size;
    }

    const categoriesArray = Array.from(categories).map(category => ({
      name: category,
      postCount: categoryStats[category] || 0
    }));

    res.status(200).json({
      success: true,
      categories: categoriesArray.sort((a, b) => b.postCount - a.postCount)
    });

  } catch (error) {
    console.error('Get blog categories error:', error);
    res.status(500).json({
      error: 'Failed to fetch blog categories',
      message: error.message
    });
  }
});

// Get blog statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const admin = require('firebase-admin');
    const db = admin.firestore();

    const [
      totalPosts,
      publishedPosts,
      draftPosts,
      archivedPosts
    ] = await Promise.all([
      db.collection('blog_posts').get(),
      db.collection('blog_posts').where('status', '==', 'published').get(),
      db.collection('blog_posts').where('status', '==', 'draft').get(),
      db.collection('blog_posts').where('status', '==', 'archived').get()
    ]);

    // Get most viewed posts
    const mostViewedQuery = await db.collection('blog_posts')
      .where('status', '==', 'published')
      .orderBy('views', 'desc')
      .limit(5)
      .get();

    const mostViewedPosts = [];
    mostViewedQuery.forEach(doc => {
      const post = doc.data();
      mostViewedPosts.push({
        id: doc.id,
        title: post.title,
        views: post.views || 0,
        likes: post.likes || 0,
        publishDate: post.publishDate?.toDate()?.toISOString()
      });
    });

    // Get recent posts
    const recentPostsQuery = await db.collection('blog_posts')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    const recentPosts = [];
    recentPostsQuery.forEach(doc => {
      const post = doc.data();
      recentPosts.push({
        id: doc.id,
        title: post.title,
        status: post.status,
        authorName: post.authorName,
        createdAt: post.createdAt?.toDate()?.toISOString()
      });
    });

    res.status(200).json({
      success: true,
      stats: {
        totalPosts: totalPosts.size,
        publishedPosts: publishedPosts.size,
        draftPosts: draftPosts.size,
        archivedPosts: archivedPosts.size
      },
      mostViewedPosts,
      recentPosts
    });

  } catch (error) {
    console.error('Get blog stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch blog statistics',
      message: error.message
    });
  }
});

// Schedule blog post
router.patch('/:postId/schedule', async (req, res) => {
  try {
    const { postId } = req.params;
    const { publishDate } = req.body;

    if (!publishDate) {
      return res.status(400).json({
        error: 'Publish date is required'
      });
    }

    const scheduledDate = new Date(publishDate);
    if (scheduledDate <= new Date()) {
      return res.status(400).json({
        error: 'Publish date must be in the future'
      });
    }

    const admin = require('firebase-admin');
    const db = admin.firestore();

    // Check if post exists
    const postDoc = await db.collection('blog_posts').doc(postId).get();
    if (!postDoc.exists) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    // Update post with scheduled publish date
    await db.collection('blog_posts').doc(postId).update({
      status: 'scheduled',
      publishDate: scheduledDate,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    });

    // Log admin activity
    await db.collection('admin_activity').add({
      userId: req.user.uid,
      action: 'schedule_blog_post',
      resourceType: 'blog_post',
      resourceId: postId,
      details: {
        publishDate: scheduledDate.toISOString()
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Blog post scheduled successfully',
      publishDate: scheduledDate.toISOString()
    });

  } catch (error) {
    console.error('Schedule blog post error:', error);
    res.status(500).json({
      error: 'Failed to schedule blog post',
      message: error.message
    });
  }
});

// Duplicate blog post
router.post('/:postId/duplicate', async (req, res) => {
  try {
    const { postId } = req.params;
    const { title } = req.body;

    const admin = require('firebase-admin');
    const db = admin.firestore();
    const { generateID } = require('../utils/generateID');

    // Get source post
    const sourcePostDoc = await db.collection('blog_posts').doc(postId).get();
    if (!sourcePostDoc.exists) {
      return res.status(404).json({ error: 'Source blog post not found' });
    }

    const sourcePost = sourcePostDoc.data();
    const newPostId = generateID.generateBlogPostId();
    const newTitle = title || `${sourcePost.title} (Copy)`;
    const newSlug = newTitle.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Check if slug exists
    const existingSlugQuery = await db.collection('blog_posts')
      .where('slug', '==', newSlug)
      .get();

    let finalSlug = newSlug;
    if (!existingSlugQuery.empty) {
      finalSlug = `${newSlug}-${Date.now()}`;
    }

    // Create duplicate post
    const duplicatePost = {
      ...sourcePost,
      id: newPostId,
      title: newTitle,
      slug: finalSlug,
      status: 'draft',
      publishDate: null,
      views: 0,
      likes: 0,
      shares: 0,
      authorId: req.user.uid,
      authorName: `${req.user.firstName} ${req.user.lastName}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('blog_posts').doc(newPostId).set(duplicatePost);

    // Log admin activity
    await db.collection('admin_activity').add({
      userId: req.user.uid,
      action: 'duplicate_blog_post',
      resourceType: 'blog_post',
      resourceId: newPostId,
      details: {
        sourcePostId: postId,
        sourceTitle: sourcePost.title,
        newTitle: newTitle
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: 'Blog post duplicated successfully',
      postId: newPostId,
      post: {
        id: newPostId,
        title: newTitle,
        slug: finalSlug,
        status: 'draft'
      }
    });

  } catch (error) {
    console.error('Duplicate blog post error:', error);
    res.status(500).json({
      error: 'Failed to duplicate blog post',
      message: error.message
    });
  }
});

module.exports = router;
