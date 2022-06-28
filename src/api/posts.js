const express = require('express');
const { Post, UserPost } = require('../db/models');

const router = express.Router();

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

//Part 1: Fetching blog posts
router.get('/', async (req, res, next) => {
  try {
    //Validate user
    if (!req.user) {
      return res.send(401).json({ message: 'Log in required' });
    }

    // check if authorIds is sent
    if (!req.body.authorIds) {
      res.send(400).json({ error: 'Must provide authorIds' });
    }

    //make single element into array
    let authors = req.body.authorIds;
    if (!Array.isArray(authors)) {
      authors = [authors];
    }
    let existingPosts = new Set();
    let posts = [];
    for (let i = 0; i < authors.length; i++) {
      const author = authors[i];
      // fetch posts from each author
      let authorPosts = await Post.getPostsByUserId(author);
      authorPosts.forEach((post) => {
        //check if post is already in the list
        if (!existingPosts.has(post.id)) {
          post.tags = post.tags.split(',');
          posts.push(post.dataValues);
          existingPosts.add(post.id);
        }
      });
    }
    const sortVal = req.body.sortBy ? req.body.sortBy : 'Id';
    const asdOrDdn = req.body.direction ? req.body.direction : 'asc';

    //sort objects
    if (asdOrDdn === 'asc') {
      posts.sort((a, b) => {
        return a[sortVal] - b[sortVal];
      });
    } else {
      posts.sort((a, b) => {
        return b[sortVal] - a[sortVal];
      });
    }
    //TODO: Test says this is sending a random object at the end? why?
    //Postman is not able to see it

    res.json({ posts });
  } catch (error) {
    next(error);
  }
});

//Part 2: Updating a blog post

router.patch('/:postId', async (req, res, next) => {
  try {
    //Validate user
    if (!req.user) {
      return res.send(401).json({ message: 'Log in required' });
    }

    //validate if user is author of post
    const postByUser = await UserPost.findOne({
      where: {
        userId: req.user.id,
        postId: req.params.postId,
      },
    });

    if (!postByUser) {
      return res.status(401).json({
        message:
          'You are not authorized to edit this post or the post does not exist',
      });
    }

    //get the  post to be updated
    const FoundPost = await Post.findOne({ where: { Id: req.params.postId } });
    //the post should exist as it was validated before

    //update the post
    const { authorIds, text, tags } = req.body;

    if (authorIds) {
      //update authorIds in UserPost

      //should we keep the old records? should the author be able to delete his own id?
      //if we delete the old records, the author will not be able to edit the post anymore
      //assumes we delete all the old records for the post and create new ones with the updated authorIds
      await UserPost.destroy({ where: { postId: req.params.postId } });

      authorIds.forEach(async (authorId) => {
        const createdRecord = await UserPost.create({
          userId: authorId,
          postId: req.params.postId,
        });
        await createdRecord.save();
      });
    }
    if (text) {
      //update text in Post
      FoundPost.text = text;
    }

    if (tags) {
      //assumes that tags are replaced with new ones
      FoundPost.tags = tags.join(',');
    }

    if (tags || text) {
      await FoundPost.save();
    }

    // let post = await Post.findOne(
    //   { where: { Id: req.params.postId }, plain: true }
    // );

    let post = FoundPost.get({ plain: true });
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
    res.status(200).json({ post });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
