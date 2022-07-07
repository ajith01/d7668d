const express = require('express');
const { Post, UserPost } = require('../db/models');
const { Op } = require('sequelize');
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
      return res.status(UNAUTHORIZED).json({ message: 'Log in required' });
    }

    const {
      authorIds,
      sortBy = sortByOptions[0],
      direction = directionOptions[0],
    } = req.query;

    // check if authorIds is sent
    if (!authorIds) {
      return res.status(BAD_REQUEST).json({ error: 'Must provide authorIds' });
    }
    const authors = req.query.authorIds.split(',').map(Number);
    //if an array, make sure all elements are positive numbers
    if (!validateArrays(authors, isInvalidNumber)) {
      return res
        .status(BAD_REQUEST)
        .json({ error: 'authorIds must be a positive number' });
    }

    if (!sortByOptions.includes(sortBy)) {
      return res
        .status(BAD_REQUEST)
        .json({ error: 'sortBy must be one of id, reads, likes, popularity' });
    }

    if (!directionOptions.includes(direction)) {
      return res
        .status(BAD_REQUEST)
        .json({ error: 'direction must be one of asc, desc' });
    }

    const postsRaw = await Post.findAll({
      include: [
        {
          model: UserPost,
          attributes: [],
          where: {
            userId: { [Op.in]: authors },
          },
          raw: true,
        },
      ],
    });

    const posts = postsRaw.map((post) => {
      post.tags = post.tags.split(',');
      return post.dataValues;
    });

    //sort objects
    if (direction === directionOptions[0]) {
      posts.sort((a, b) => {
        return a[sortBy] - b[sortBy];
      });
    } else {
      posts.sort((a, b) => {
        return b[sortBy] - a[sortBy];
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
      return res.status(UNAUTHORIZED).json({ message: 'Log in required' });
    }

    if (isInvalidNumber(req.params.postId)) {
      return res
        .status(BAD_REQUEST)
        .json({ error: 'postId must be a positive number' });
    }

    //get the  post to be updated
    const foundPost = await Post.findOne({ where: { Id: req.params.postId } });

    if (!foundPost) {
      return res.status(NOT_FOUND).json({ error: 'Post not found' });
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
          .status(BAD_REQUEST)
          .json({ error: 'authorIds must be an array' });
      }

      if (!validateArrays(authorIds, isInvalidNumber)) {
        return res
          .status(BAD_REQUEST)
          .json({ error: 'authorIds must be a positive number' });
      }

      //find all authorIds for this post
      const existingAuthorIds = (
        await UserPost.findAll({
          attributes: ['user_id'],
          where: { postId: req.params.postId },
          raw: true,
        })
      ).map((user) => user.user_id);

      const authorIdsToAdd = authorIds.filter(
        (authorId) => !existingAuthorIds.includes(authorId)
      );

      //add all the values not already in the table
      if (authorIdsToAdd.length != 0) {
        authorIdsToAdd.forEach(async (authorId) => {
          const createdRecord = await UserPost.create({
            userId: authorId,
            postId: req.params.postId,
          });
          await createdRecord.save();
        });
      }
      //delete all the values not passed in body
      await UserPost.destroy({
        where: { postId: req.params.postId, userId: { [Op.notIn]: authorIds } },
      });
    }

    if (text) {
      if (typeof text !== 'string' || text.length === 0) {
        return res
          .status(BAD_REQUEST)
          .json({ error: 'text must be a non-empty string' });
      }
      //update text in Post
      foundPost.text = text;
    }

    if (tags) {
      if (!validateArrays(tags, isInvalidString)) {
        return res
          .status(BAD_REQUEST)
          .json({ error: 'tags must be a nonempty array of strings' });
      }

      if (tags.length === 0) {
        return res
          .status(BAD_REQUEST)
          .json({ error: 'tags must not be empty' });
      }
      //assumes that tags are replaced with new ones
      foundPost.tags = tags.join(',');
    }

    if (tags || text) {
      //save the edited posts
      await foundPost.save();
    }

    const post = foundPost.get({ plain: true });

    //find authorids from post and return it if not being updated
    if (!req.body.authorIDs) {
      const foundIds = await UserPost.findAll({
        attributes: ['userId'],
        where: { postId: req.params.postId },
      });

      const authors = [];
      foundIds.forEach((user) => {
        authors.push(user.dataValues.userId);
      });

      post.authorIds = authors;
    } else {
      //if it is being updated, just return the req.body.authorIds
      post.authorIds = req.body.authorIds;
    }

    post.tags = post.tags.split(',');
    return res.status(OK).json({ post });
  } catch (error) {
    next(error);
  }
});

function isInvalidNumber(number) {
  return isNaN(number) || number < 0;
}

function isInvalidString(string) {
  return typeof string !== 'string' || string.length === 0;
}

function validateArrays(arrays, elementValidator) {
  if (!Array.isArray(arrays)) {
    return false;
  }
  if (arrays.length === 0) {
    return false;
  } //has no ids

  //check if valid IDs
  return arrays.every((element) => !elementValidator(element));
}

module.exports = router;
