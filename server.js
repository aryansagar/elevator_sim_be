import express from 'express';
import mongoose from 'mongoose';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import elevatorRoutes from './routes/elevators.js';
import requestRoutes from './routes/requests.js';
import simulationRoutes from './routes/simulation.js';
import errorHandler from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/elevators', elevatorRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/simulation', simulationRoutes);

// Error handling
app.use(errorHandler);

// MongoDB connection
mongoose.connect('mongodb+srv://aryansagar1996_db_user:User1234@cluster0.zv8x0mb.mongodb.net/?appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.on('connected', () => {
  console.log('Connected to MongoDB');
  initializeSimulation();
});

// Socket.io for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('floorRequest', (data) => {
    console.log('Floor request received:', data);
    // Handle external floor button presses
    io.emit('floorRequestUpdate', data);
  });
  
  socket.on('destinationRequest', (data) => {
    console.log('Destination request received:', data);
    // Handle internal elevator destination buttons
    io.emit('destinationRequestUpdate', data);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Store io instance for use in other files
app.set('io', io);

// Initialize simulation state
const initializeSimulation = async () => {
  try {
    const Simulation = await import('./models/Simulation.js').then(m => m.default);
    let simulation = await Simulation.findOne({ simulationId: 'default_simulation' });
    if (!simulation) {
      simulation = await Simulation.create({ simulationId: 'default_simulation' });
      console.log('Default simulation created');
    }
  } catch (error) {
    console.error('Error initializing simulation:', error);
  }
};

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { io, app };