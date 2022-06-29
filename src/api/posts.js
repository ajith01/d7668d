const express = require('express');
const { Post, UserPost } = require('../db/models');

const router = express.Router();

const sortByOptions = ['id', 'reads', 'likes', 'popularity'];
const directionOptions = ['asc', 'desc'];
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const OK = 200;

/**
 * Create a new blog post
 * req.body is expected to contain {text: required(string), tags: optional(Array<string>)}
 */
router.post('/', async (req, res, next) => {
  try {
    // Validation
    if (!req.user) {
      return res.sendStatus(401);
    }

    const { text, tags } = req.body;

    if (!text) {
      return res
        .status(400)
        .json({ error: 'Must provide text for the new post' });
    }

    // Create new post
    const values = {
      text,
    };
    if (tags) {
      values.tags = tags.join(',');
    }
    const post = await Post.create(values);
    await UserPost.create({
      userId: req.user.id,
      postId: post.id,
    });

    res.json({ post });
  } catch (error) {
    next(error);
  }
});

/*
 * Get a list of posts
 * req.query is expected to contain { authorID: required(String), sortBy optional(string), direction optional(String)}
 */
router.get('/', async (req, res, next) => {
  try {
    //Validate user
    if (!req.user) {
      return res.send(UNAUTHORIZED).json({ message: 'Log in required' });
    }

    // check if authorIds is sent
    if (!req.query.authorIds) {
      return res.send(BAD_REQUEST).json({ error: 'Must provide authorIds' });
    }

    //authors is passed as a string, convert to array
    const authors = req.query.authorIds.split(',').map(Number);
    //if an array, make sure all elements are positive numbers
    if (!validateArrays(authors)) {
      return res
        .send(BAD_REQUEST)
        .json({ error: 'authorIds must be a positive number' });
    }

    const sortParameter = req.query.sortBy ? req.query.sortBy : 'id';
    const sortDirection = req.query.direction ? req.query.direction : 'asc';

    if (!sortByOptions.includes(sortParameter)) {
      return res
        .send(BAD_REQUEST)
        .json({ error: 'sortBy must be one of id, reads, likes, popularity' });
    }

    if (!directionOptions.includes(sortDirection)) {
      return res
        .send(BAD_REQUEST)
        .json({ error: 'direction must be one of asc, desc' });
    }

    const existingPosts = new Set();
    const posts = [];

    for (let i = 0; i < authors.length; i++) {
      // fetch posts from each author
      const authorPosts = await Post.getPostsByUserId(authors[i]);
      authorPosts.forEach((post) => {
        //check if post is already in the list if not add to list
        if (!existingPosts.has(post.id)) {
          post.tags = post.tags.split(',');
          posts.push(post.dataValues);
          existingPosts.add(post.id);
        }
      });
    }

    //sort objects
    if (sortDirection === 'asc') {
      posts.sort((a, b) => {
        return a[sortParameter] - b[sortParameter];
      });
    } else {
      posts.sort((a, b) => {
        return b[sortParameter] - a[sortParameter];
      });
    }

    return res.status(OK).json({ posts: posts });
  } catch (error) {
    next(error);
  }
});

/*
 * update a post by id
 * req.body is expected to contain {authorIds:optional(Array<Integer>) text: optional(string), tags: optional(Array<string>)}
 */
router.patch('/:postId', async (req, res, next) => {
  try {
    //Validate user
    if (!req.user) {
      return res.send(UNAUTHORIZED).json({ message: 'Log in required' });
    }

    if (isInvalidNumber(req.params.postId)) {
      return res
        .send(BAD_REQUEST)
        .json({ error: 'postId must be a positive number' });
    }

    //get the  post to be updated
    const FoundPost = await Post.findOne({ where: { Id: req.params.postId } });

    if (!FoundPost) {
      return res.send(NOT_FOUND).json({ error: 'Post not found' });
    }

    //validate if user is author of post
    const postByUser = await UserPost.findOne({
      where: {
        userId: req.user.id,
        postId: req.params.postId,
      },
    });

    if (!postByUser) {
      return res.status(FORBIDDEN).json({
        message: 'You are not authorized to edit this post',
      });
    }

    //update the post
    const { text, tags } = req.body;
    const authorIds = req.body.authorIds;

    if (authorIds) {
      //update authorIds in UserPost

      if (!Array.isArray(authorIds)) {
        //if not an array assume its a single element
        return res
          .send(BAD_REQUEST)
          .json({ error: 'authorIds must be an array' });
      }

      if (!validateArrays(authorIds)) {
        return res
          .send(BAD_REQUEST)
          .json({ error: 'authorIds must be a positive number' });
      }

      //assumes we delete all the old records for the post and create new ones with the updated authorIds
      await UserPost.destroy({ where: { postId: req.params.postId } });

      //add new records for updated authorIds
      authorIds.forEach(async (authorId) => {
        const createdRecord = await UserPost.create({
          userId: authorId,
          postId: req.params.postId,
        });
        await createdRecord.save();
      });
    }

    if (text) {
      if (typeof text !== 'string' || text.length === 0) {
        return res
          .send(BAD_REQUEST)
          .json({ error: 'text must be a non-empty string' });
      }
      //update text in Post
      FoundPost.text = text;
    }

    if (tags) {
      if (tags.length === 0) {
        return res.send(BAD_REQUEST).json({ error: 'tags must not be empty' });
      }
      //assumes that tags are replaced with new ones
      FoundPost.tags = tags.join(',');
    }

    if (tags || text) {
      //save the edited posts
      await FoundPost.save();
    }

    const post = FoundPost.get({ plain: true });
    const foundIds = await UserPost.findAll({
      attributes: ['userId'],
      where: { postId: req.params.postId },
    });

    const authors = [];
    foundIds.forEach((user) => {
      authors.push(user.dataValues.userId);
    });

    post.authorIds = authors;
    post.tags = post.tags.split(',');
    return res.status(OK).json({ post });
  } catch (error) {
    next(error);
  }
});

function isInvalidNumber(number) {
  return isNaN(number) || number < 0;
}

function validateArrays(arrays) {
  arrays.forEach((element) => {
    if (isInvalidNumber(element)) {
      return false;
    }
  });
  return true;
}

module.exports = router;
