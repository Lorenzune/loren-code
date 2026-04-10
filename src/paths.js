import path from "node:path";
import process from "node:process";

export function getUserHomeDir() {
  return process.env.USERPROFILE || process.env.HOME || process.cwd();
}

export function getLorenHome() {
  return process.env.LOREN_HOME || path.join(getUserHomeDir(), ".lorencode");
}

export function getEnvFilePath() {
  return path.join(getLorenHome(), ".env.local");
}

export function getRuntimeDir() {
  return path.join(getLorenHome(), "runtime");
}

export function getLegacyEnvFilePath(projectRoot) {
  return path.join(projectRoot, ".env.local");
}
