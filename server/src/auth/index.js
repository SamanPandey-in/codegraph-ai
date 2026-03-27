import authRouter from './routes/auth.routes.js';
import { configureGitHubPassport } from './middlewares/passportGithub.middleware.js';

export { authRouter, configureGitHubPassport };
