import mongoose from 'mongoose';

const RequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    unique: true,
    default: () => `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  originFloor: {
    type: Number,
    required: true
  },
  destinationFloor: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['EXTERNAL', 'INTERNAL'],
    required: true
  },
  direction: {
    type: String,
    enum: ['UP', 'DOWN'],
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'ASSIGNED', 'PICKED_UP', 'COMPLETED', 'CANCELLED'],
    default: 'PENDING'
  },
  assignedElevatorId: {
    type: Number,
    default: null
  },
  // Performance metrics
  waitTime: { 
    type: Number, 
    default: 0 
  },
  travelTime: { 
    type: Number, 
    default: 0 
  },
  priority: { 
    type: Number, 
    default: 1,
    min: 1,
    max: 3 
  },
  isRushHour: { 
    type: Boolean, 
    default: false 
  },
  isPeakTraffic: {
    type: Boolean,
    default: false
  },
  // Timestamps for metrics
  pickupTime: Date,
  completionTime: Date,
  assignedTime: Date,
  lastPriorityUpdate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
RequestSchema.index({ status: 1, timestamp: 1 });
RequestSchema.index({ assignedElevatorId: 1, status: 1 });
RequestSchema.index({ priority: -1, timestamp: 1 });

export default mongoose.model('Request', RequestSchema);