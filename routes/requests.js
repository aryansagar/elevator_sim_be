import express from 'express';
import {
  createRequest,
  getAllRequests,
  getRequestById,
  updateRequestStatus,
  getRequestMetrics,
  updateRequestPriority
} from '../controllers/requestController.js';

const router = express.Router();

router.post('/', createRequest);
router.get('/', getAllRequests);
router.get('/metrics', getRequestMetrics);
router.get('/:id', getRequestById);
router.put('/:id/status', updateRequestStatus);
router.put('/:id/priority', updateRequestPriority);

export default router;