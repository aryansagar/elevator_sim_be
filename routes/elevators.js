import express from 'express';
import {
  getAllElevators,
  getElevatorById,
  updateElevator,
  moveElevator,
  updateDoorState,
  getElevatorMetrics,
  resetElevators
} from '../controllers/elevatorController.js';

const router = express.Router();

router.get('/', getAllElevators);
router.get('/metrics', getElevatorMetrics);
router.get('/:id', getElevatorById);
router.put('/:id', updateElevator);
router.post('/:id/move', moveElevator);
router.put('/:id/door', updateDoorState);
router.post('/reset', resetElevators);

export default router;