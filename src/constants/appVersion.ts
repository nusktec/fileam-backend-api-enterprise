export const APP_PLATFORMS = ["ios", "android"] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

export type AppVersionPolicy = {
  platform: AppPlatform;
  minimumVersion: string;
  latestVersion: string;
  storeUrl: string;
  forceUpdateMessage: string;
  softUpdateMessage: string;
};

export type AppVersionCheckResult = AppVersionPolicy & {
  clientVersion: string | null;
  forceUpdate: boolean;
  updateAvailable: boolean;
};
