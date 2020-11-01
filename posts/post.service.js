const Post = require('./post.model');
const { Image, Resources } = require('../images/image.model');
const catchAsync = require('../util/catchAsync');
const isTruthy = require('../util/isTruthy');
const AppError = require('../util/appError');
const Votes = require('../images/votes.model');

const populateResources = async (voted, post) => {
  if (voted) {
    await post
      .populate({
        path: 'resources',
        model: 'resources',
        select: '-_id -__v',
        populate: {
          path: 'images',
          model: 'image',
          select: 'name url',
          populate: {
            path: 'votes',
            model: 'Votes',
            select: 'count  updatedAt'
          }
        }
      })
      .execPopulate();
  } else {
    await post
      .populate({
        path: 'resources',
        model: 'resources',
        select: '-_id -__v',
        populate: {
          path: 'images',
          model: 'image',
          select: 'name url'
        }
      })
      .execPopulate();
  }
  return post;
};

const isVotedByCurrUser = async (userId, post) => {
  for (const i in post.resources.images) {
    const userVotedImage = await Votes.findOne({
      image: post.resources.images[i]._id,
      voters: { $in: userId }
    }).select('image');
    if (userVotedImage) {
      post.resources.images[i].votedByUser = true;
      continue;
    }
  }
  return post;
};

const setPostBusinessProperties = async (post, user) => {
  post.setVoted(user);
  post = await populateResources(post.Voted, post);
  post = post.toJSON();
  post = await isVotedByCurrUser(user._id, post);
  return post;
};

exports.postService = {
  create() {
    return catchAsync(async (req, res, next) => {
      if (!req.files.images) {
        return next(new AppError('Please Upload atleast one image', 400));
      }
      const images = req.files.images.map(image => {
        return new Image({
          name: image.originalname.replace(' ', ''),
          url: image.path,
          provider: 'cloudinary'
        });
      });

      const imagesIds = images.map(image => image._id);
      const resources = await Resources.create({ images: imagesIds });
      const { isAnonymous, caption } = req.body;
      const isAnonymousBoolean = isTruthy(isAnonymous);
      const user = req.user.mongouser;

      const post = await Post.create({
        caption,
        resources: resources._id,
        author: user._id,
        isAnonymous: isAnonymousBoolean
      });
      req.user.mongouser.posts.push(post._id);
      await req.user.mongouser.save();

      images.forEach(async img => {
        img.postId = post._id;
        await img.save();
      });
      res.status(201).json({
        status: 'success',
        post
      });
    });
  },
  get() {
    return catchAsync(async (req, res, next) => {
      let post = await Post.findById(req.params.id);

      if (!post) {
        return next(new AppError('No document found with that ID', 404));
      }

      if (post.author) {
        await post.populate('author', 'name email').execPopulate();
      }
      post = await setPostBusinessProperties(post, req.user.mongouser);

      res.status(200).json({
        status: 'success',
        post
      });
    });
  },
  update() {
    return catchAsync(async (req, res, next) => {
      const post = await Post.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true
      });
      if (!post) {
        return next(new AppError('No document found with that ID', 404));
      }
      res.status(200).json({
        status: 'success',
        data: post
      });
    });
  },
  delete() {
    return catchAsync(async (req, res, next) => {
      const doc = await Post.deleteOne({ _id: req.params.id });
      if (!doc.deletedCount)
        return next(new AppError('cannot find doc with that id', 404));
      res.status(204).send();
    });
  },
  getAll(options) {
    return catchAsync(async (req, res, next) => {
      let posts = Post.find();

      if (options.getRecentFirst) {
        posts.sort('-createdAt');
      }
      if (options.populateAuthor) {
        posts.populate('author', 'name email');
      }
      posts = await posts;
      
      posts = await Promise.all(
        posts.map(async post => {
          return setPostBusinessProperties(post, req.user.mongouser);
        })
      );
      res.status(200).json({ data: posts });
    });
  }
};
