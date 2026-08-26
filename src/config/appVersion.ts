import {
  APP_PLATFORMS,
  type AppPlatform,
  type AppVersionPolicy,
} from "../constants/appVersion";

const DEFAULT_MIN_VERSION = "1.0.0";
const DEFAULT_LATEST_VERSION = "1.0.0";
const DEFAULT_FORCE_UPDATE_MESSAGE =
  "Please update Fileam to the latest version to continue.";
const DEFAULT_SOFT_UPDATE_MESSAGE =
  "A new version of Fileam is available. Update for the best experience.";

function envKey(platform: AppPlatform, suffix: string): string {
  return `MOBILE_${platform.toUpperCase()}_${suffix}`;
}

function readPlatformPolicy(platform: AppPlatform): AppVersionPolicy {
  return {
    platform,
    minimumVersion:
      process.env[envKey(platform, "MIN_VERSION")]?.trim() ||
      DEFAULT_MIN_VERSION,
    latestVersion:
      process.env[envKey(platform, "LATEST_VERSION")]?.trim() ||
      DEFAULT_LATEST_VERSION,
    storeUrl: process.env[envKey(platform, "STORE_URL")]?.trim() || "",
    forceUpdateMessage:
      process.env.MOBILE_FORCE_UPDATE_MESSAGE?.trim() ||
      DEFAULT_FORCE_UPDATE_MESSAGE,
    softUpdateMessage:
      process.env.MOBILE_SOFT_UPDATE_MESSAGE?.trim() ||
      DEFAULT_SOFT_UPDATE_MESSAGE,
  };
}

export function getAppVersionPolicy(platform: AppPlatform): AppVersionPolicy {
  return readPlatformPolicy(platform);
}

export function getAllAppVersionPolicies(): AppVersionPolicy[] {
  return APP_PLATFORMS.map((platform) => readPlatformPolicy(platform));
}
