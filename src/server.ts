import * as mongoose from 'mongoose';
import 'dotenv/config';
import App from './app';
import PostsController from './posts/posts.controller';
 
const app = new App(
  [
    new PostsController(),
  ],
  3002,
);


 
app.listen();