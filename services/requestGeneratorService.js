import Request from '../models/Request.js';
import Simulation from '../models/Simulation.js';
import schedulerService from './schedulerService.js';
import { io } from '../server.js';

class RequestGeneratorService {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  start(frequency = 5) {
    if (this.isRunning) {
      this.stop();
    }

    this.isRunning = true;
    const interval = (60 / frequency) * 1000; // Convert to milliseconds
    
    this.intervalId = setInterval(async () => {
      if (!this.isRunning) return;

      const simulation = await Simulation.findOne({ simulationId: 'default_simulation' });
      if (!simulation || !simulation.isRunning) return;

      const request = await this.generateRandomRequest();
      io.emit('requestGenerated', request);
    }, interval);

    console.log(`Request generator started with ${frequency} requests per minute`);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('Request generator stopped');
  }

  updateFrequency(frequency) {
    if (this.isRunning) {
      this.start(frequency);
    }
  }

  async generateRandomRequest(isPeakTraffic = false) {
    const simulation = await Simulation.findOne({ simulationId: 'default_simulation' });
    const numberOfFloors = simulation.config.numberOfFloors;
    
    let originFloor, destinationFloor;
    
    if (isPeakTraffic && simulation.config.peakTrafficMode) {
      // Peak traffic: 70% from lobby to upper floors
      if (Math.random() < 0.7) {
        originFloor = simulation.config.peakTrafficConfig.lobbyFloor;
        destinationFloor = this.getRandomFloor(1, numberOfFloors - 1);
      } else {
        originFloor = this.getRandomFloor(0, numberOfFloors - 1);
        destinationFloor = this.getRandomFloor(0, numberOfFloors - 1);
        while (destinationFloor === originFloor) {
          destinationFloor = this.getRandomFloor(0, numberOfFloors - 1);
        }
      }
    } else {
      // Normal traffic: random floors
      originFloor = this.getRandomFloor(0, numberOfFloors - 1);
      destinationFloor = this.getRandomFloor(0, numberOfFloors - 1);
      while (destinationFloor === originFloor) {
        destinationFloor = this.getRandomFloor(0, numberOfFloors - 1);
      }
    }

    const direction = destinationFloor > originFloor ? 'UP' : 'DOWN';
    const type = Math.random() > 0.5 ? 'EXTERNAL' : 'INTERNAL';

    const request = new Request({
      originFloor,
      destinationFloor,
      type,
      direction,
      isRushHour: simulation.config.peakTrafficMode,
      isPeakTraffic: isPeakTraffic && originFloor === simulation.config.peakTrafficConfig.lobbyFloor
    });

    await request.save();

    // Update simulation metrics
    await Simulation.findOneAndUpdate(
      { simulationId: 'default_simulation' },
      { $inc: { 'metrics.totalRequests': 1 } }
    );

    // Assign to elevator
    await schedulerService.assignRequest(request);

    return request;
  }

  getRandomFloor(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async generateBatch(count) {
    const requests = [];
    for (let i = 0; i < count; i++) {
      const request = await this.generateRandomRequest();
      requests.push(request);
    }
    return requests;
  }
}

// Create singleton instance
const requestGeneratorService = new RequestGeneratorService();
export default requestGeneratorService;