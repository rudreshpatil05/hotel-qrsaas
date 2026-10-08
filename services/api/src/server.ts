import { app } from './app.js';
import { config } from './config.js';
import { initializeDatabase } from './db.js';
import './models/index.js';
import { createServer } from 'node:http';
import { createKitchenSocket } from './socket.js';
import { setKitchenSocket } from './app.js';
import { logInfo } from './logger.js';

await initializeDatabase();
const httpServer = createServer(app);
setKitchenSocket(createKitchenSocket(httpServer));
httpServer.listen(config.PORT, () => void logInfo('api.started', { port: config.PORT, environment: config.NODE_ENV }));
