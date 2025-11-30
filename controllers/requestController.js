import Request from '../models/Request.js';
import Elevator from '../models/Elevator.js';
import Simulation from '../models/Simulation.js';
import schedulerService from '../services/schedulerService.js';
import { io } from '../server.js';

export const createRequest = async (req, res) => {
  try {
    const { originFloor, destinationFloor, type = 'EXTERNAL' } = req.body;
    
    // Validate floors
    const simulation = await Simulation.findOne({ simulationId: 'default_simulation' });
    if (originFloor < 0 || originFloor >= simulation.config.numberOfFloors ||
        destinationFloor < 0 || destinationFloor >= simulation.config.numberOfFloors) {
      return res.status(400).json({ message: 'Invalid floor number' });
    }

    if (originFloor === destinationFloor) {
      return res.status(400).json({ message: 'Origin and destination floors cannot be the same' });
    }

    const direction = destinationFloor > originFloor ? 'UP' : 'DOWN';
    
    const request = new Request({
      originFloor,
      destinationFloor,
      type,
      direction,
      isRushHour: simulation.config.peakTrafficMode,
      isPeakTraffic: simulation.config.peakTrafficMode && 
                     originFloor === simulation.config.peakTrafficConfig.lobbyFloor &&
                     direction === simulation.config.peakTrafficConfig.peakDirection
    });

    await request.save();

    // Update simulation metrics
    await Simulation.findOneAndUpdate(
      { simulationId: 'default_simulation' },
      { $inc: { 'metrics.totalRequests': 1 } }
    );

    // Assign to elevator using scheduler
    const assignedElevatorId = await schedulerService.assignRequest(request);
    
    if (assignedElevatorId) {
      request.assignedElevatorId = assignedElevatorId;
      request.status = 'ASSIGNED';
      request.assignedTime = new Date();
      await request.save();

      // Update elevator request count
      await Elevator.findOneAndUpdate(
        { elevatorId: assignedElevatorId },
        { $inc: { requestCount: 1 } }
      );
    }

    // Real-time updates
    io.emit('requestCreated', request);
    if (assignedElevatorId) {
      const elevator = await Elevator.findOne({ elevatorId: assignedElevatorId });
      io.emit('elevatorUpdated', elevator);
    }

    res.status(201).json(request);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllRequests = async (req, res) => {
  try {
    const { status, limit = 100, sort = '-timestamp' } = req.query;
    let query = {};
    if (status) query.status = status;
    
    const requests = await Request.find(query)
      .sort(sort)
      .limit(parseInt(limit));
    
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getRequestById = async (req, res) => {
  try {
    const request = await Request.findOne({ requestId: req.params.id });
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }
    res.json(request);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateRequestStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const request = await Request.findOneAndUpdate(
      { requestId: req.params.id },
      { status },
      { new: true }
    );

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // If completed, calculate times and update metrics
    if (status === 'COMPLETED') {
      request.completionTime = new Date();
      request.travelTime = request.completionTime - request.pickupTime;
      await request.save();

      await Simulation.findOneAndUpdate(
        { simulationId: 'default_simulation' },
        { 
          $inc: { 'metrics.completedRequests': 1 },
          $set: { 
            'metrics.averageWaitTime': await calculateAverageWaitTime(),
            'metrics.averageTravelTime': await calculateAverageTravelTime()
          }
        }
      );
    }

    io.emit('requestUpdated', request);
    res.json(request);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getRequestMetrics = async (req, res) => {
  try {
    const pendingRequests = await Request.countDocuments({ status: 'PENDING' });
    const completedRequests = await Request.countDocuments({ status: 'COMPLETED' });
    
    const averageWaitTime = await Request.aggregate([
      { $match: { status: 'COMPLETED', waitTime: { $gt: 0 } } },
      { $group: { _id: null, avgWait: { $avg: '$waitTime' } } }
    ]);
    
    const averageTravelTime = await Request.aggregate([
      { $match: { status: 'COMPLETED', travelTime: { $gt: 0 } } },
      { $group: { _id: null, avgTravel: { $avg: '$travelTime' } } }
    ]);

    const maxWaitTime = await Request.aggregate([
      { $match: { status: 'COMPLETED' } },
      { $group: { _id: null, maxWait: { $max: '$waitTime' } } }
    ]);

    const longWaitingRequests = await Request.countDocuments({
      status: { $in: ['PENDING', 'ASSIGNED'] },
      timestamp: { $lt: new Date(Date.now() - 30000) } // >30 seconds
    });

    res.json({
      pendingRequests,
      completedRequests,
      longWaitingRequests,
      averageWaitTime: averageWaitTime[0]?.avgWait || 0,
      averageTravelTime: averageTravelTime[0]?.avgTravel || 0,
      maxWaitTime: maxWaitTime[0]?.maxWait || 0
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateRequestPriority = async (req, res) => {
  try {
    const { requestId } = req.params;
    const request = await Request.findOne({ requestId });
    
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // Escalate priority if waiting > 30 seconds (assignment requirement)
    const waitTime = Date.now() - new Date(request.timestamp).getTime();
    if (waitTime > 30000 && request.priority < 3) {
      request.priority = 3; // Highest priority
      request.lastPriorityUpdate = new Date();
      await request.save();
      
      // Reassign with higher priority
      await schedulerService.reassignRequest(request);
      
      io.emit('requestPriorityUpdated', request);
    }

    res.json(request);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Helper functions
const calculateAverageWaitTime = async () => {
  const result = await Request.aggregate([
    { $match: { status: 'COMPLETED', waitTime: { $gt: 0 } } },
    { $group: { _id: null, avgWait: { $avg: '$waitTime' } } }
  ]);
  return result[0]?.avgWait || 0;
};

const calculateAverageTravelTime = async () => {
  const result = await Request.aggregate([
    { $match: { status: 'COMPLETED', travelTime: { $gt: 0 } } },
    { $group: { _id: null, avgTravel: { $avg: '$travelTime' } } }
  ]);
  return result[0]?.avgTravel || 0;
};