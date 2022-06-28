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
    //-----------Validations -----------//
    //Validate user
    if (!req.user) {
      return res.send(401).json({ message: 'Log in required' });
    }

    // check if authorIds is sent
    if (!req.query.authorIds) {
      return res.send(400).json({ error: 'Must provide authorIds' });
    }

    //make single element into array
    let authors = req.query.authorIds;

    //authors is passed as a string, convert to array
    //if not an array assume its a single element

    authors = authors.split(',').map(Number);
    //if an array, make sure all elements are positive numbers
    if (!validateArrays(authors)) {
      return res
        .send(400)
        .json({ error: 'authorIds must be a positive number' });
    }

    const sortVal = req.query.sortBy ? req.query.sortBy : 'id';
    const asdOrDsn = req.query.direction ? req.query.direction : 'asc';

    if (!['id', 'reads', 'likes', 'popularity'].includes(sortVal)) {
      return res
        .send(400)
        .json({ error: 'sortBy must be one of id, reads, likes, popularity' });
    }

    if (!['asc', 'desc'].includes(asdOrDsn)) {
      return res
        .send(400)
        .json({ error: 'direction must be one of asc, desc' });
    }

    //----------- End of Validations -----------//

    let existingPosts = new Set();
    let posts = [];
    for (let i = 0; i < authors.length; i++) {
      // fetch posts from each author
      let authorPosts = await Post.getPostsByUserId(authors[i]);
      authorPosts.forEach((post) => {
        //check if post is already in the list
        if (!existingPosts.has(post.id)) {
          post.tags = post.tags.split(',');
          posts.push(post.dataValues);
          existingPosts.add(post.id);
        }
      });
    }

    //sort objects
    if (asdOrDsn === 'asc') {
      posts.sort((a, b) => {
        return a[sortVal] - b[sortVal];
      });
    } else {
      posts.sort((a, b) => {
        return b[sortVal] - a[sortVal];
      });
    }

    return res.status(200).json({ posts: posts });
  } catch (error) {
    next(error);
  }
});

//Part 2: Updating a blog post

router.patch('/:postId', async (req, res, next) => {
  try {
    //-----------Validations -----------//

    //Validate user
    if (!req.user) {
      return res.send(401).json({ message: 'Log in required' });
    }

    if (isInvalidNumber(req.params.postId)) {
      return res.send(400).json({ error: 'postId must be a positive number' });
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
    const { text, tags } = req.body;
    let authorIds = req.body.authorIds;
    console.log(authorIds);
    if (authorIds) {
      //update authorIds in UserPost

      if (!Array.isArray(authorIds)) {
        //if not an array assume its a single element
        return res.send(400).json({ error: 'authorIds must be an array' });
      }

      if (!validateArrays(authorIds)) {
        return res
          .send(400)
          .json({ error: 'authorIds must be a positive number' });
      }

      //should we keep the old records? should the author be able to delete his own id?
      //if we delete the old records, the author will not be able to edit the post anymore
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
      if (text.length === 0) {
        return res.send(400).json({ error: 'text cannot be empty' });
      }
      //update text in Post
      FoundPost.text = text;
    }

    if (tags) {
      if (tags.length === 0) {
        return res.send(400).json({ error: 'tags must not be empty' });
      }
      //assumes that tags are replaced with new ones
      FoundPost.tags = tags.join(',');
    }

    if (tags || text) {
      //save the edited posts
      await FoundPost.save();
    }

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
    return res.status(200).json({ post });
  } catch (error) {
    next(error);
  }
});

function isInvalidNumber(number) {
  return isNaN(number) || number < 0;
}

function validateArrays(arrays) {
  for (let i = 0; i < arrays.length; i++) {
    if (isInvalidNumber(arrays[i])) {
      return false;
    }
  }
  return true;
}

module.exports = router;
