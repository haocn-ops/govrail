import { headers as nextHeaders } from "next/headers";

type HeaderAccessor = Pick<Headers, "get">;
const forwardedHeaderNames = [
  "cookie",
  "x-workspace-id",
  "x-workspace-slug",
  "x-authenticated-subject",
  "x-authenticated-roles",
  "cf-access-authenticated-user-email",
  "cf-access-authenticated-user-groups",
] as const;

export function buildServerBaseUrl(requestHeaders: HeaderAccessor): string | null {
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) {
    return null;
  }
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export function buildControlPlanePageRequestHeaders(requestHeaders: HeaderAccessor): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
  };

  for (const name of forwardedHeaderNames) {
    const value = requestHeaders.get(name);
    if (value) {
      headers[name] = value;
    }
  }

  return headers;
}

export async function requestControlPlanePageData<T>(
  path: string,
  options?: {
    getHeaders?: () => HeaderAccessor;
    fetchImpl?: typeof fetch;
  },
): Promise<T | null> {
  const getHeaders = options?.getHeaders ?? nextHeaders;
  const requestHeaders = getHeaders();
  const baseUrl = buildServerBaseUrl(requestHeaders);
  if (!baseUrl) {
    return null;
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const response = await fetchImpl(`${baseUrl}${path}`, {
    cache: "no-store",
    headers: buildControlPlanePageRequestHeaders(requestHeaders),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { data?: T };
  return payload.data ?? null;
}
