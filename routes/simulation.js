import express from 'express';
import {
  getSimulationState,
  startSimulation,
  stopSimulation,
  updateSimulationConfig,
  updateSimulationSpeed,
  resetSimulation,
  stressTest,
  getPerformanceMetrics,
  initializeSimulation
} from '../controllers/simulationController.js';

const router = express.Router();

router.get('/', getSimulationState);
router.get('/metrics', getPerformanceMetrics);
router.post('/initialize', initializeSimulation);
router.post('/start', startSimulation);
router.post('/stop', stopSimulation);
router.put('/config', updateSimulationConfig);
router.put('/speed', updateSimulationSpeed);
router.post('/reset', resetSimulation);
router.post('/stress-test', stressTest);

export default router;