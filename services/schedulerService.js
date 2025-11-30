import IntelligentScheduler from './IntelligentScheduler.js';

class SchedulerService {
  constructor() {
    this.scheduler = new IntelligentScheduler();
  }

  async assignRequest(request) {
    try {
      const Elevator = await import('../models/Elevator.js').then(m => m.default);
      const elevators = await Elevator.find({ status: 'ACTIVE' });
      
      const assignedElevatorId = this.scheduler.assignRequest(request, elevators);
      
      if (assignedElevatorId) {
        // Find the modified elevator object from the array
        const assignedElevator = elevators.find(e => e.elevatorId === assignedElevatorId);
        
        if (assignedElevator) {
          // Save the modified elevator with its new destinations
          await Elevator.findOneAndUpdate(
            { elevatorId: assignedElevatorId },
            { 
              $set: { 
                destinations: assignedElevator.destinations,
                targetFloor: assignedElevator.targetFloor,
                direction: assignedElevator.direction
              } 
            }
          );
        }
      }
      
      return assignedElevatorId;
    } catch (error) {
      console.error('Error in scheduler service:', error);
      return null;
    }
  }

  async reassignRequest(request) {
    return await this.scheduler.reassignRequest(request);
  }

  getSchedulingMetrics() {
    return this.scheduler.getSchedulingMetrics();
  }

  getElevatorDestinations(elevatorId) {
    // This would get destinations from the scheduler's internal state
    // In a real implementation, you'd maintain this in the database
    return [];
  }

  processPendingRequests() {
    // Process any requests in the queue
    const pendingRequests = this.scheduler.requestQueue;
    pendingRequests.forEach(async (request) => {
      await this.assignRequest(request);
    });
  }
}

// Create singleton instance
const schedulerService = new SchedulerService();
export default schedulerService;