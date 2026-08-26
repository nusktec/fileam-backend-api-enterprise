import {
  getAllAppVersionPolicies,
  getAppVersionPolicy,
} from "../../config/appVersion";
import type {
  AppPlatform,
  AppVersionCheckResult,
  AppVersionPolicy,
} from "../../constants/appVersion";
import { isVersionBelow } from "../../utils/appVersion";

function buildCheckResult(
  policy: AppVersionPolicy,
  clientVersion?: string,
): AppVersionCheckResult {
  const forceUpdate = clientVersion
    ? isVersionBelow(clientVersion, policy.minimumVersion)
    : false;
  const updateAvailable = clientVersion
    ? isVersionBelow(clientVersion, policy.latestVersion)
    : false;

  return {
    ...policy,
    clientVersion: clientVersion ?? null,
    forceUpdate,
    updateAvailable,
  };
}

export const appVersionService = {
  getPolicy(platform: AppPlatform): AppVersionPolicy {
    return getAppVersionPolicy(platform);
  },

  getAllPolicies(): AppVersionPolicy[] {
    return getAllAppVersionPolicies();
  },

  checkVersion(
    platform: AppPlatform,
    clientVersion?: string,
  ): AppVersionCheckResult {
    return buildCheckResult(getAppVersionPolicy(platform), clientVersion);
  },

  checkAll(clientVersion?: string): AppVersionCheckResult[] {
    return getAllAppVersionPolicies().map((policy) =>
      buildCheckResult(policy, clientVersion),
    );
  },
};
