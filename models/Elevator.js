import mongoose from 'mongoose';

const ElevatorSchema = new mongoose.Schema({
  elevatorId: {
    type: Number,
    required: true,
    unique: true
  },
  currentFloor: {
    type: Number,
    required: true,
    default: 0
  },
  targetFloor: {
    type: Number,
    default: null
  },
  direction: {
    type: String,
    enum: ['UP', 'DOWN', 'IDLE'],
    default: 'IDLE'
  },
  doorState: {
    type: String,
    enum: ['OPEN', 'CLOSED'],
    default: 'CLOSED'
  },
  passengerCount: {
    type: Number,
    default: 0,
    min: 0
  },
  capacity: {
    type: Number,
    default: 8
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'MAINTENANCE'],
    default: 'ACTIVE'
  },
  destinations: [{
    floor: Number,
    requestId: String,
    type: {
      type: String,
      enum: ['PICKUP', 'DROPOFF', 'POSITIONING']
    },
    priority: {
      type: Number,
      default: 1,
      min: 1,
      max: 3
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  // Performance metrics
  totalTravelTime: { 
    type: Number, 
    default: 0 
  },
  totalPassengersServed: { 
    type: Number, 
    default: 0 
  },
  lastActive: Date,
  isRushHourOptimized: { 
    type: Boolean, 
    default: false 
  },
  currentTripStart: Date,
  requestCount: { 
    type: Number, 
    default: 0 
  },
  isHighTrafficPositioned: { 
    type: Boolean, 
    default: false 
  }
}, {
  timestamps: true
});

// Index for performance
ElevatorSchema.index({ elevatorId: 1 });
ElevatorSchema.index({ status: 1, direction: 1 });

export default mongoose.model('Elevator', ElevatorSchema);