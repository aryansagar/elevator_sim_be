import Elevator from '../models/Elevator.js';
import { io } from '../server.js';

export const getAllElevators = async (req, res) => {
  try {
    const elevators = await Elevator.find().sort({ elevatorId: 1 });
    res.json(elevators);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getElevatorById = async (req, res) => {
  try {
    const elevator = await Elevator.findOne({ elevatorId: req.params.id });
    if (!elevator) {
      return res.status(404).json({ message: 'Elevator not found' });
    }
    res.json(elevator);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateElevator = async (req, res) => {
  try {
    const elevator = await Elevator.findOneAndUpdate(
      { elevatorId: req.params.id },
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!elevator) {
      return res.status(404).json({ message: 'Elevator not found' });
    }

    io.emit('elevatorUpdated', elevator);
    res.json(elevator);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const moveElevator = async (req, res) => {
  try {
    const { targetFloor } = req.body;
    const elevator = await Elevator.findOne({ elevatorId: req.params.id });
    
    if (!elevator) {
      return res.status(404).json({ message: 'Elevator not found' });
    }

    elevator.targetFloor = targetFloor;
    elevator.direction = targetFloor > elevator.currentFloor ? 'UP' : 'DOWN';
    await elevator.save();

    io.emit('elevatorMoved', elevator);
    res.json(elevator);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateDoorState = async (req, res) => {
  try {
    const { doorState } = req.body;
    const elevator = await Elevator.findOneAndUpdate(
      { elevatorId: req.params.id },
      { doorState },
      { new: true }
    );

    if (!elevator) {
      return res.status(404).json({ message: 'Elevator not found' });
    }

    io.emit('elevatorDoorStateChanged', elevator);
    res.json(elevator);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getElevatorMetrics = async (req, res) => {
  try {
    const elevators = await Elevator.find();
    const metrics = elevators.map(elevator => ({
      elevatorId: elevator.elevatorId,
      utilization: elevator.totalPassengersServed > 0 
        ? (elevator.totalPassengersServed / (elevator.capacity * 10)) * 100 
        : 0,
      totalTravelTime: elevator.totalTravelTime,
      passengersServed: elevator.totalPassengersServed,
      efficiency: elevator.totalPassengersServed > 0 
        ? elevator.totalTravelTime / elevator.totalPassengersServed 
        : 0,
      requestCount: elevator.requestCount
    }));

    res.json(metrics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const resetElevators = async (req, res) => {
  try {
    await Elevator.updateMany({}, {
      currentFloor: 0,
      targetFloor: null,
      direction: 'IDLE',
      doorState: 'CLOSED',
      passengerCount: 0,
      destinations: [],
      totalTravelTime: 0,
      totalPassengersServed: 0,
      requestCount: 0
    });

    const elevators = await Elevator.find();
    io.emit('elevatorsReset', elevators);
    res.json({ message: 'All elevators reset to initial state' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};