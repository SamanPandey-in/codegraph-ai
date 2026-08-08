import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  validateAnalyzeBody,
  validateBranchQuery,
  validateLocalPathBody,
  validatePublicRepoBody,
  validateRepoBrowserQuery,
  validateRepoFileQuery,
  validateRepoFileUpdateBody,
} from '../middleware/validate.middleware.js';
import {
  getRepositoryFileController,
  listBranchesController,
  listRepositoryDirectoryController,
  listRepositoryStructureController,
  listOwnedReposController,
  resolvePublicRepoController,
  updateRepositoryFileController,
} from '../githubBrowser/githubBrowser.controller.js';
import {
  createPrCommitController,
} from '../prCommit/prCommit.controller.js';
import {
  listAnalysisHistoryController,
} from '../history/history.controller.js';
import {
  browseLocalPathController,
  localPickerCapabilitiesController,
  validateLocalPathController,
} from '../localPicker/localPicker.controller.js';
import { analyzeController } from '../upload/upload.controller.js';
import {
  isWatching,
  stopLocalWatch,
} from '../services/localWatcher.service.js';

const router = Router();

const analyzeLimiter = rateLimit({
  windowMs:       60 * 1000,
  max:            30,
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { error: 'Too many requests. Please wait a moment and try again.' },
});

router.post('/', analyzeLimiter, validateAnalyzeBody, analyzeController);
router.get('/local/picker-capabilities', analyzeLimiter, localPickerCapabilitiesController);
router.get('/history', analyzeLimiter, listAnalysisHistoryController);
router.get('/local/browse', analyzeLimiter, browseLocalPathController);
router.post('/local/validate', analyzeLimiter, validateLocalPathBody, validateLocalPathController);
router.delete('/local/:repoId/watch', analyzeLimiter, (req, res) => {
  const repoId = String(req.params?.repoId || '').trim();

  if (!repoId) {
    return res.status(400).json({ error: 'repoId is required.' });
  }

  if (!isWatching(repoId)) {
    return res.status(404).json({ error: `No active watcher found for repoId: ${repoId}` });
  }

  stopLocalWatch(repoId);
  return res.status(200).json({ success: true, repoId, watching: false });
});
router.post('/github/public/resolve', analyzeLimiter, validatePublicRepoBody, resolvePublicRepoController);
router.get('/github/repos', analyzeLimiter, listOwnedReposController);
router.get('/github/branches', analyzeLimiter, validateBranchQuery, listBranchesController);
router.get('/github/structure', analyzeLimiter, validateRepoBrowserQuery, listRepositoryStructureController);
router.get('/github/contents', analyzeLimiter, validateRepoBrowserQuery, listRepositoryDirectoryController);
router.get('/github/file', analyzeLimiter, validateRepoFileQuery, getRepositoryFileController);
router.put('/github/file', analyzeLimiter, validateRepoFileUpdateBody, updateRepositoryFileController);
router.post('/commit', analyzeLimiter, createPrCommitController);

export default router;
