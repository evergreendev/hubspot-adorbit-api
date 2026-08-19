import cookieParser from 'cookie-parser';
import express from 'express';
import logger from 'morgan';
import path from 'node:path';

import indexRouter from './routes/index';
import usersRouter from './routes/users';

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.resolve(process.cwd(), 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

export default app;
