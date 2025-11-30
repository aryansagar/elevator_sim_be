import Simulation from '../models/Simulation.js';
import Elevator from '../models/Elevator.js';
import Request from '../models/Request.js';
import requestGeneratorService from '../services/requestGeneratorService.js';
import simulationEngine from '../services/simulationEngine.js';
import { io } from '../server.js';

export const getSimulationState = async (req, res) => {
  try {
    let simulation = await Simulation.findOne({ simulationId: 'default_simulation' });
    
    if (!simulation) {
      simulation = await Simulation.create({ simulationId: 'default_simulation' });
    }
    
    res.json(simulation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const startSimulation = async (req, res) => {
  try {
    const { autoGenerate = true } = req.body;
    
    const simulation = await Simulation.findOneAndUpdate(
      { simulationId: 'default_simulation' },
      { 
        isRunning: true,
        'stressTest.startTime': req.body.stressTest ? new Date() : undefined,
        'stressTest.isActive': !!req.body.stressTest
      },
      { new: true }
    );

    // Initialize elevators if not exists
    const elevatorCount = await Elevator.countDocuments();
    if (elevatorCount === 0) {
      await initializeElevators(simulation.config.numberOfElevators);
    }

    // Start simulation engine
    simulationEngine.start(simulation.speed);

    // Start request generator if auto-mode
    if (autoGenerate) {
      requestGeneratorService.start(simulation.config.requestFrequency);
    }

    io.emit('simulationStarted', simulation);
    res.json(simulation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const stopSimulation = async (req, res) => {
  try {
    const simulation = await Simulation.findOneAndUpdate(
      { simulationId: 'default_simulation' },
      { isRunning: false },
      { new: true }
    );

    simulationEngine.stop();
    requestGeneratorService.stop();
    
    io.emit('simulationStopped', simulation);
    res.json(simulation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateSimulationConfig = async (req, res) => {
  try {
    const { numberOfElevators, numberOfFloors, requestFrequency, peakTrafficMode } = req.body;
    
    const updateData = {};
    if (numberOfElevators !== undefined) updateData['config.numberOfElevators'] = numberOfElevators;
    if (numberOfFloors !== undefined) updateData['config.numberOfFloors'] = numberOfFloors;
    if (requestFrequency !== undefined) updateData['config.requestFrequency'] = requestFrequency;
    if (peakTrafficMode !== undefined) updateData['config.peakTrafficMode'] = peakTrafficMode;

    const simulation = await Simulation.findOneAndUpdate(
      { simulationId: 'default_simulation' },
      updateData,
      { new: true }
    );

    // Reinitialize elevators if count changed
    if (numberOfElevators !== undefined) {
      await Elevator.deleteMany({});
      await initializeElevators(numberOfElevators);
    }

    // Update request generator frequency
    if (requestFrequency !== undefined) {
      requestGeneratorService.updateFrequency(requestFrequency);
    }

    io.emit('simulationConfigUpdated', simulation);
    res.json(simulation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const initializeSimulation = async (req, res) => {
  try {
    // Map frontend parameters to backend expected format
    if (req.body.numElevators) req.body.numberOfElevators = req.body.numElevators;
    if (req.body.numFloors) req.body.numberOfFloors = req.body.numFloors;
    
    // Reuse update configuration logic
    return updateSimulationConfig(req, res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateSimulationSpeed = async (req, res) => {
  try {
    const { speed } = req.body;
    
    if (speed < 1 || speed > 5) {
      return res.status(400).json({ message: 'Speed must be between 1 and 5' });
    }

    const simulation = await Simulation.findOneAndUpdate(
      { simulationId: 'default_simulation' },
      { speed },
      { new: true }
    );

    simulationEngine.updateSpeed(speed);
    
    io.emit('simulationSpeedUpdated', simulation);
    res.json(simulation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const resetSimulation = async (req, res) => {
  try {
    await Request.deleteMany({});
    await Elevator.deleteMany({});
    
    const simulation = await Simulation.findOneAndUpdate(
      { simulationId: 'default_simulation' },
      { 
        isRunning: false,
        speed: 1,
        'metrics.totalRequests': 0,
        'metrics.completedRequests': 0,
        'metrics.averageWaitTime': 0,
        'metrics.averageTravelTime': 0,
        'metrics.maxWaitTime': 0,
        'metrics.starvationCount': 0,
        'metrics.elevatorUtilization': [],
        'stressTest.isActive': false,
        'stressTest.simultaneousRequests': 0,
        'stressTest.startTime': null
      },
      { new: true }
    );

    await initializeElevators(simulation.config.numberOfElevators);
    simulationEngine.stop();
    requestGeneratorService.stop();

    io.emit('simulationReset', simulation);
    res.json(simulation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const stressTest = async (req, res) => {
  try {
    const { simultaneousRequests = 100 } = req.body;
    
    // Generate multiple requests at once
    const requests = [];
    const simulation = await Simulation.findOne({ simulationId: 'default_simulation' });
    
    for (let i = 0; i < simultaneousRequests; i++) {
      const request = await requestGeneratorService.generateRandomRequest(true);
      requests.push(request);
    }
    
    await Request.insertMany(requests);
    
    const updatedSimulation = await Simulation.findOneAndUpdate(
      { simulationId: 'default_simulation' },
      { 
        'stressTest.isActive': true,
        'stressTest.simultaneousRequests': simultaneousRequests,
        'stressTest.startTime': new Date()
      },
      { new: true }
    );

    io.emit('stressTestStarted', { 
      simulation: updatedSimulation, 
      requestCount: simultaneousRequests 
    });
    
    res.json({ 
      message: `Stress test started with ${simultaneousRequests} requests`,
      simulation: updatedSimulation
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPerformanceMetrics = async (req, res) => {
  try {
    const simulation = await Simulation.findOne({ simulationId: 'default_simulation' });
    const elevatorMetrics = await Elevator.aggregate([
      {
        $group: {
          _id: null,
          totalTravelTime: { $sum: '$totalTravelTime' },
          totalPassengersServed: { $sum: '$totalPassengersServed' },
          averageUtilization: { $avg: { $divide: ['$passengerCount', '$capacity'] } }
        }
      }
    ]);

    const requestMetrics = await Request.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const metrics = {
      simulation: simulation.metrics,
      elevators: elevatorMetrics[0] || {},
      requests: requestMetrics.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {})
    };

    res.json(metrics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Helper function
async function initializeElevators(count) {
  const elevators = [];
  for (let i = 1; i <= count; i++) {
    elevators.push({
      elevatorId: i,
      currentFloor: 0,
      status: 'ACTIVE',
      direction: 'IDLE',
      doorState: 'CLOSED',
      passengerCount: 0
    });
  }
  await Elevator.insertMany(elevators);
  return elevators;
}