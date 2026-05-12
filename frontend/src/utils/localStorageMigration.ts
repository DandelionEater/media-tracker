export function getMigratedLocalStorageItem(key: string, legacyKey: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const currentValue = window.localStorage.getItem(key);

    if (currentValue !== null) {
      return currentValue;
    }

    const legacyValue = window.localStorage.getItem(legacyKey);

    if (legacyValue !== null) {
      window.localStorage.setItem(key, legacyValue);
      window.localStorage.removeItem(legacyKey);
    }

    return legacyValue;
  } catch {
    return null;
  }
}
