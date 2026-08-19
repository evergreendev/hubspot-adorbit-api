#!/usr/bin/env node

import debugFactory from 'debug';
import http from 'node:http';

import app from '../app';

const debug = debugFactory('hubspot-adorbit-api:server');
const port = normalizePort(process.env.PORT ?? '3000');

app.set('port', port);

const server = http.createServer(app);

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

function normalizePort(value: string): number | string | false {
  const parsedPort = Number.parseInt(value, 10);

  if (Number.isNaN(parsedPort)) {
    return value;
  }

  return parsedPort >= 0 ? parsedPort : false;
}

function onError(error: NodeJS.ErrnoException): void {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;

  switch (error.code) {
    case 'EACCES':
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function onListening(): void {
  const address = server.address();
  if (address === null) {
    return;
  }

  const bind = typeof address === 'string' ? `pipe ${address}` : `port ${address.port}`;
  debug(`Listening on ${bind}`);
}
