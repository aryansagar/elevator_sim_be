import Elevator from '../models/Elevator.js';
import Request from '../models/Request.js';
import { io } from '../server.js';

class SimulationEngine {
  constructor() {
    this.intervalId = null;
    this.speed = 1;
    this.isRunning = false;
  }

  start(speed = 1) {
    if (this.isRunning) {
      this.stop();
    }

    this.isRunning = true;
    this.speed = speed;
    
    // Process elevator movement every second (adjusted by speed)
    this.intervalId = setInterval(() => {
      this.processElevatorMovement();
    }, 1000 / this.speed);

    // Emit consolidated simulation updates every 2 seconds
    this.updateIntervalId = setInterval(() => {
      this.emitSimulationUpdate();
    }, 2000);

    console.log(`Simulation engine started with speed ${this.speed}x`);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
    console.log('Simulation engine stopped');
  }

  updateSpeed(speed) {
    this.speed = speed;
    if (this.isRunning) {
      this.start(speed);
    }
  }

  async processElevatorMovement() {
    try {
      const elevators = await Elevator.find({ status: 'ACTIVE' });
      
      for (const elevator of elevators) {
        await this.processSingleElevator(elevator);
      }
    } catch (error) {
      console.error('Error in simulation engine:', error);
    }
  }

  async processSingleElevator(elevator) {
    // If elevator has destinations, move towards the next one
    if (elevator.destinations && elevator.destinations.length > 0) {
      const nextDestination = elevator.destinations[0];
      
      if (elevator.currentFloor === nextDestination.floor) {
        // Reached destination - handle pickup/dropoff
        await this.handleDestinationReached(elevator, nextDestination);
      } else {
        // Move towards destination
        await this.moveElevatorTowardsTarget(elevator, nextDestination.floor);
      }
    } else {
      // No destinations - set to idle
      if (elevator.direction !== 'IDLE') {
        elevator.direction = 'IDLE';
        elevator.targetFloor = null;
        await elevator.save();
        io.emit('elevatorUpdated', elevator);
      }
    }
  }

  async moveElevatorTowardsTarget(elevator, targetFloor) {
    const movement = targetFloor > elevator.currentFloor ? 1 : -1;
    elevator.currentFloor += movement;
    
    // Update travel time metrics
    if (elevator.currentTripStart) {
      elevator.totalTravelTime += (1000 / this.speed);
    }

    await elevator.save();
    
    // Emit real-time update
    io.emit('elevatorMoved', elevator);
  }

  async handleDestinationReached(elevator, destination) {
    console.log(`Elevator ${elevator.elevatorId} reached floor ${destination.floor} for ${destination.type}`);
    
    // Open doors
    elevator.doorState = 'OPEN';
    await elevator.save();
    io.emit('elevatorDoorStateChanged', elevator);

    // Handle based on destination type
    if (destination.type === 'PICKUP') {
      await this.handlePickup(elevator, destination);
    } else if (destination.type === 'DROPOFF') {
      await this.handleDropoff(elevator, destination);
    }

    // Remove completed destination
    elevator.destinations.shift();
    
    // Save the elevator with removed destination
    await elevator.save();
    io.emit('elevatorUpdated', elevator);
    
    // Close doors after processing
    setTimeout(async () => {
      try {
        const Elevator = await import('../models/Elevator.js').then(m => m.default);
        const currentElevator = await Elevator.findOne({ elevatorId: elevator.elevatorId });
        if (currentElevator) {
          currentElevator.doorState = 'CLOSED';
          await currentElevator.save();
          io.emit('elevatorDoorStateChanged', currentElevator);
        }
      } catch (error) {
        console.error('Error closing doors:', error);
      }
    }, 2000 / this.speed); // 2 seconds door open time
  }

  async handlePickup(elevator, destination) {
    const request = await Request.findOne({ requestId: destination.requestId });
    if (request) {
      request.status = 'PICKED_UP';
      request.pickupTime = new Date();
      request.waitTime = request.pickupTime - new Date(request.timestamp);
      await request.save();

      // Add passenger to elevator
      elevator.passengerCount += 1;
      elevator.lastActive = new Date();
      
      if (!elevator.currentTripStart) {
        elevator.currentTripStart = new Date();
      }

      io.emit('requestUpdated', request);
      console.log(`Passenger picked up by elevator ${elevator.elevatorId}`);
    }
  }

  async handleDropoff(elevator, destination) {
    const request = await Request.findOne({ requestId: destination.requestId });
    if (request) {
      request.status = 'COMPLETED';
      request.completionTime = new Date();
      
      // Calculate travel time only if pickupTime exists
      if (request.pickupTime) {
        request.travelTime = request.completionTime - request.pickupTime;
      } else {
        // If no pickup time, estimate based on current time
        request.travelTime = 0;
        request.pickupTime = request.completionTime;
      }
      
      await request.save();

      // Remove passenger from elevator
      elevator.passengerCount = Math.max(0, elevator.passengerCount - 1);
      elevator.totalPassengersServed += 1;
      
      // Update simulation metrics
      const Simulation = await import('../models/Simulation.js').then(m => m.default);
      await Simulation.findOneAndUpdate(
        { simulationId: 'default_simulation' },
        { 
          $inc: { 'metrics.completedRequests': 1 },
          $set: { 
            'metrics.averageWaitTime': await this.calculateAverageWaitTime(),
            'metrics.averageTravelTime': await this.calculateAverageTravelTime()
          }
        }
      );

      // Reset trip if elevator is empty
      if (elevator.passengerCount === 0) {
        elevator.currentTripStart = null;
      }

      io.emit('requestUpdated', request);
      console.log(`Passenger dropped off by elevator ${elevator.elevatorId}`);
    }
  }

  async calculateAverageWaitTime() {
    const result = await Request.aggregate([
      { $match: { status: 'COMPLETED', waitTime: { $gt: 0 } } },
      { $group: { _id: null, avgWait: { $avg: '$waitTime' } } }
    ]);
    return result[0]?.avgWait || 0;
  }

  async calculateAverageTravelTime() {
    const result = await Request.aggregate([
      { $match: { status: 'COMPLETED', travelTime: { $gt: 0 } } },
      { $group: { _id: null, avgTravel: { $avg: '$travelTime' } } }
    ]);
    return result[0]?.avgTravel || 0;
  }

  async emitSimulationUpdate() {
    try {
      const elevators = await Elevator.find({ status: 'ACTIVE' });
      const Simulation = await import('../models/Simulation.js').then(m => m.default);
      const simulation = await Simulation.findOne({ simulationId: 'default_simulation' });
      
      if (simulation) {
        io.emit('simulation_update', {
          elevators: elevators,
          metrics: simulation.metrics
        });
      }
    } catch (error) {
      console.error('Error emitting simulation update:', error);
    }
  }
}

// Create singleton instance
const simulationEngine = new SimulationEngine();
export default simulationEngine;