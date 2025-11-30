import { v4 as uuidv4 } from 'uuid';

class IntelligentScheduler {
  constructor() {
    this.requestQueue = [];
    this.morningRushHour = false;
    this.metrics = {
      totalAssignments: 0,
      rushHourAssignments: 0,
      priorityEscalations: 0
    };
  }

  // Main scheduling function
  assignRequest(request, elevators) {
    // Escalate priority for long waiting requests
    this.updateRequestPriorities();
    
    // Apply traffic pattern biases
    this.applyTrafficBiases(request);
    
    // Pre-position idle elevators during peak times
    if (this.morningRushHour) {
      this.prePositionIdleElevators(elevators, [0, 5, 10]);
    }
    
    // Find best elevator
    const bestElevator = this.findBestElevator(request, elevators);
    
    if (bestElevator) {
      this.assignToElevator(request, bestElevator);
      this.metrics.totalAssignments++;
      
      if (this.morningRushHour && request.originFloor === 0) {
        this.metrics.rushHourAssignments++;
      }
      
      return bestElevator.elevatorId;
    }
    
    // If no elevator found, add to queue
    this.addToQueue(request);
    return null;
  }

  findBestElevator(request, elevators) {
    let bestElevator = null;
    let minCost = Infinity;

    elevators.forEach(elevator => {
      if (elevator.status !== 'ACTIVE') return;

      const cost = this.calculateCost(elevator, request);
      
      if (cost < minCost) {
        minCost = cost;
        bestElevator = elevator;
      }
    });

    return bestElevator;
  }

  calculateCost(elevator, request) {
    let cost = 0;
    
    // Base distance cost (weighted heavily)
    const distance = Math.abs(elevator.currentFloor - request.originFloor);
    cost += distance * 2;

    // Priority for long-waiting requests (>30s - assignment requirement)
    const waitTime = (Date.now() - new Date(request.timestamp)) / 1000;
    if (waitTime > 30) {
      cost -= 100; // Strong bias for starvation prevention
      if (request.priority < 3) {
        request.priority = 3;
        this.metrics.priorityEscalations++;
      }
    }

    // Morning rush hour: strong lobby-to-upper floors bias
    if (this.morningRushHour && request.originFloor === 0 && request.direction === 'UP') {
      cost -= 80; // Strong preference during rush hour
    }

    // Direction compatibility
    if (elevator.direction !== 'IDLE') {
      const isSameDirection = (elevator.direction === 'UP' && request.originFloor >= elevator.currentFloor) ||
                             (elevator.direction === 'DOWN' && request.originFloor <= elevator.currentFloor);
      
      if (!isSameDirection) {
        cost += 50; // Heavy penalty for wrong direction
      } else {
        cost -= 10; // Bonus for same direction
      }
    }

    // Load balancing with capacity consideration
    const utilization = elevator.passengerCount / elevator.capacity;
    cost += utilization * 30; // Stronger penalty for overcrowding

    // Prefer idle elevators for better distribution
    if (elevator.direction === 'IDLE') {
      cost -= 15;
    }

    // Consider number of existing destinations
    cost += (elevator.destinations?.length || 0) * 5;

    return Math.max(0, cost);
  }

  updateRequestPriorities() {
    const now = Date.now();
    this.requestQueue.forEach(request => {
      const waitTime = (now - new Date(request.timestamp)) / 1000;
      if (waitTime > 30 && request.priority < 2) {
        request.priority = 2;
        this.metrics.priorityEscalations++;
      }
      if (waitTime > 60 && request.priority < 3) {
        request.priority = 3;
        this.metrics.priorityEscalations++;
      }
    });
  }

  applyTrafficBiases(request) {
    // Morning rush hour bias (9 AM scenario)
    const hour = new Date().getHours();
    this.morningRushHour = (hour >= 8 && hour <= 10);
    
    if (this.morningRushHour && request.originFloor === 0 && request.direction === 'UP') {
      request.priority = Math.max(request.priority, 2);
    }
  }

  prePositionIdleElevators(elevators, trafficFloors = [0, 5, 10]) {
    // Bonus: Pre-position idle elevators near high-traffic floors
    const idleElevators = elevators.filter(e => 
      e.direction === 'IDLE' && 
      e.passengerCount === 0 &&
      e.destinations?.length === 0
    );

    idleElevators.forEach((elevator, index) => {
      if (index < trafficFloors.length) {
        const targetFloor = trafficFloors[index];
        if (elevator.currentFloor !== targetFloor) {
          elevator.destinations = [{ 
            floor: targetFloor, 
            type: 'POSITIONING',
            timestamp: new Date()
          }];
          elevator.targetFloor = targetFloor;
          elevator.direction = targetFloor > elevator.currentFloor ? 'UP' : 'DOWN';
          elevator.isHighTrafficPositioned = true;
        }
      }
    });
  }

  assignToElevator(request, elevator) {
    // Add to elevator's destination queue
    if (!elevator.destinations) {
      elevator.destinations = [];
    }

    // Add pickup point
    elevator.destinations.push({
      floor: request.originFloor,
      type: 'PICKUP',
      requestId: request.requestId,
      priority: request.priority,
      timestamp: new Date()
    });

    // Add dropoff point
    elevator.destinations.push({
      floor: request.destinationFloor,
      type: 'DROPOFF',
      requestId: request.requestId,
      priority: request.priority,
      timestamp: new Date()
    });

    // Sort destinations for efficiency
    this.optimizeDestinationOrder(elevator);
    
    // Update elevator target
    if (elevator.destinations.length > 0) {
      elevator.targetFloor = elevator.destinations[0].floor;
      elevator.direction = elevator.targetFloor > elevator.currentFloor ? 'UP' : 'DOWN';
    }

    request.status = 'ASSIGNED';
    request.assignedElevatorId = elevator.elevatorId;

    // Remove from queue if it was there
    this.removeFromQueue(request.requestId);
  }

  optimizeDestinationOrder(elevator) {
    if (!elevator.destinations || elevator.destinations.length === 0) return;

    // Separate high priority requests
    const highPriority = elevator.destinations.filter(dest => 
      dest.priority >= 2 || (Date.now() - new Date(dest.timestamp)) / 1000 > 30
    );
    
    const normalPriority = elevator.destinations.filter(dest => 
      !highPriority.includes(dest)
    );

    // Sort high priority by proximity to current floor
    highPriority.sort((a, b) => 
      Math.abs(a.floor - elevator.currentFloor) - Math.abs(b.floor - elevator.currentFloor)
    );

    // Sort normal priority using SCAN algorithm
    if (elevator.direction === 'UP') {
      normalPriority.sort((a, b) => a.floor - b.floor);
    } else if (elevator.direction === 'DOWN') {
      normalPriority.sort((a, b) => b.floor - a.floor);
    } else {
      // If idle, sort by proximity
      normalPriority.sort((a, b) => 
        Math.abs(a.floor - elevator.currentFloor) - Math.abs(b.floor - elevator.currentFloor)
      );
    }

    // Combine: high priority first, then optimized route
    elevator.destinations = [...highPriority, ...normalPriority];
  }

  addToQueue(request) {
    this.requestQueue.push(request);
  }

  removeFromQueue(requestId) {
    this.requestQueue = this.requestQueue.filter(req => req.requestId !== requestId);
  }

  async reassignRequest(request) {
    const Elevator = await import('../models/Elevator.js').then(m => m.default);
    const elevators = await Elevator.find({ status: 'ACTIVE' });
    
    // Remove from current elevator if assigned
    if (request.assignedElevatorId) {
      const currentElevator = elevators.find(e => e.elevatorId === request.assignedElevatorId);
      if (currentElevator) {
        currentElevator.destinations = currentElevator.destinations.filter(
          dest => dest.requestId !== request.requestId
        );
        await currentElevator.save();
      }
    }
    
    // Reassign with higher priority
    return this.assignRequest(request, elevators);
  }

  getSchedulingMetrics() {
    return {
      ...this.metrics,
      queueLength: this.requestQueue.length,
      longWaitingInQueue: this.requestQueue.filter(req => 
        (Date.now() - new Date(req.timestamp)) / 1000 > 30
      ).length,
      morningRushHour: this.morningRushHour
    };
  }

  // Simulate 70% lobby requests during peak (assignment requirement)
  simulatePeakTraffic(requests) {
    const lobbyRequests = requests.filter(req => req.originFloor === 0);
    const totalRequests = requests.length;
    
    const lobbyPercentage = (lobbyRequests.length / totalRequests) * 100;
    
    if (lobbyPercentage < 70) {
      // Generate additional lobby requests to reach ~70%
      const additionalNeeded = Math.ceil((totalRequests * 0.7) - lobbyRequests.length);
      for (let i = 0; i < additionalNeeded; i++) {
        this.generateLobbyRequest();
      }
    }
  }

  generateLobbyRequest() {
    const request = {
      requestId: uuidv4(),
      timestamp: new Date(),
      originFloor: 0,
      destinationFloor: Math.floor(Math.random() * 10) + 1, // Upper floors
      type: 'EXTERNAL',
      direction: 'UP',
      status: 'PENDING',
      isPeakTraffic: true,
      priority: 1
    };
    
    this.addToQueue(request);
    return request;
  }
}

export default IntelligentScheduler;