import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

// Optional: point at an existing Chromium/headless-shell instead of downloading one (CI, sandboxes).
if (process.env['REMOTION_BROWSER_EXECUTABLE']) Config.setBrowserExecutable(process.env['REMOTION_BROWSER_EXECUTABLE']);
