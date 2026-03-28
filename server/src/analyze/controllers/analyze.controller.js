import { analyzeProject } from '../services/analyze.service.js';

export async function analyzeController(req, res, next) {
  try {
    const result = await analyzeProject(req.body.path);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}
