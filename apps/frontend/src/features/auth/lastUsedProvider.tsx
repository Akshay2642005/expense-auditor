type Provider = "google" | "github" | "email";

const KEY = "ea-last-provider";

export function getLastUsedProvider(): Provider | null {
  return (localStorage.getItem(KEY) as Provider | null);
}

export function setLastUsedProvider(p: Provider): void {
  localStorage.setItem(KEY, p);
}
