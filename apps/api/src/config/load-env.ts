// Loads apps/api/.env regardless of the process working directory.
// Variables already present in the environment (CI, shell, tests) take precedence.
import { resolve } from 'node:path';

import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../.env') });
