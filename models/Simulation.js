import mongoose from 'mongoose';

const SimulationSchema = new mongoose.Schema({
  simulationId: {
    type: String,
    unique: true,
    default: 'default_simulation'
  },
  isRunning: {
    type: Boolean,
    default: false
  },
  speed: {
    type: Number,
    default: 1,
    enum: [1, 2, 5]
  },
  config: {
    numberOfElevators: { 
      type: Number, 
      default: 3,
      min: 1,
      max: 20 
    },
    numberOfFloors: { 
      type: Number, 
      default: 10,
      min: 2,
      max: 50 
    },
    requestFrequency: { 
      type: Number, 
      default: 5,
      min: 1,
      max: 60 
    },
    peakTrafficMode: {
      type: Boolean,
      default: false
    },
    peakTrafficConfig: {
      lobbyFloor: { type: Number, default: 0 },
      peakDirection: { type: String, enum: ['UP', 'DOWN'], default: 'UP' },
      peakPercentage: { type: Number, default: 70, min: 0, max: 100 }
    }
  },
  metrics: {
    totalRequests: { type: Number, default: 0 },
    completedRequests: { type: Number, default: 0 },
    averageWaitTime: { type: Number, default: 0 },
    averageTravelTime: { type: Number, default: 0 },
    maxWaitTime: { type: Number, default: 0 },
    elevatorUtilization: [{
      elevatorId: Number,
      utilization: Number,
      passengersServed: Number
    }],
    starvationCount: { type: Number, default: 0 }
  },
  stressTest: {
    isActive: { type: Boolean, default: false },
    simultaneousRequests: { type: Number, default: 0 },
    startTime: Date
  }
}, {
  timestamps: true
});

export default mongoose.model('Simulation', SimulationSchema);