import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const checkoutSessionsRoutePath = path.resolve(testDir, "../workspace/billing/checkout-sessions/route.ts");
const checkoutSessionRoutePath = path.resolve(testDir, "../workspace/billing/checkout-sessions/[sessionId]/route.ts");
const checkoutSessionCompleteRoutePath = path.resolve(
  testDir,
  "../workspace/billing/checkout-sessions/[sessionId]/complete/route.ts",
);
const billingProvidersRoutePath = path.resolve(testDir, "../workspace/billing/providers/route.ts");
const portalSessionsRoutePath = path.resolve(testDir, "../workspace/billing/portal-sessions/route.ts");
const subscriptionCancelRoutePath = path.resolve(testDir, "../workspace/billing/subscription/cancel/route.ts");
const subscriptionResumeRoutePath = path.resolve(testDir, "../workspace/billing/subscription/resume/route.ts");
const appPath = path.resolve(testDir, "../../../../../src/app.ts");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

function assertProxyWrapperImports(source: string): void {
  assert.match(source, /export const dynamic = "force-dynamic";/);
}

function assertBillingGetHelperContract(
  source: string,
  options: {
    importPattern: RegExp;
    invocationPattern: RegExp;
  },
): void {
  assert.match(source, options.importPattern);
  assert.match(source, options.invocationPattern);
  assert.doesNotMatch(source, /proxyControlPlane\(/);
  assert.doesNotMatch(source, /resolveWorkspaceContextForServer\(/);
  assert.doesNotMatch(source, /buildBillingGetProxyInit\(\)/);
  assert.doesNotMatch(source, /body:/);
  assert.doesNotMatch(source, /idempotency-key/);
}

function assertBillingPostHelperContract(
  source: string,
  options: {
    importPattern: RegExp;
    invocationPattern: RegExp;
  },
): void {
  assert.match(source, options.importPattern);
  assert.match(source, options.invocationPattern);
  assert.doesNotMatch(source, /proxyControlPlane\(/);
  assert.doesNotMatch(source, /resolveWorkspaceContextForServer\(/);
  assert.doesNotMatch(source, /buildBillingPostProxyInit\(request\)/);
  assert.doesNotMatch(source, /buildProxyControlPlanePostInit\(/);
  assert.doesNotMatch(source, /request\.headers\.get\("content-type"\)/);
  assert.doesNotMatch(source, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(source, /body:\s*await request\.text\(\)/);
}

function assertBillingPostWrapperContract(
  source: string,
  options: {
    importPattern: RegExp;
    invocationPattern: RegExp;
  },
): void {
  assertProxyWrapperImports(source);
  assert.match(source, /export async function POST\(\s*request: Request/s);
  assertBillingPostHelperContract(source, options);
}

function assertNoDirectFetchOrBase(source: string): void {
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /getBaseUrl\(/);
}

function assertGetRouteBodyFree(source: string): void {
  assert.doesNotMatch(source, /body:/);
  assert.doesNotMatch(source, /idempotency-key/);
}

test("billing checkout session routes keep proxy wrapper path and method semantics", async () => {
  const [checkoutSessionsSource, checkoutSessionSource, checkoutSessionCompleteSource] = await Promise.all([
    readSource(checkoutSessionsRoutePath),
    readSource(checkoutSessionRoutePath),
    readSource(checkoutSessionCompleteRoutePath),
  ]);

  assertBillingPostWrapperContract(
    checkoutSessionsSource,
    {
      importPattern: /import \{ proxyWorkspaceBillingPost \} from "\.\.\/route-helpers";/,
      invocationPattern: /return proxyWorkspaceBillingPost\(request,\s*"\/checkout-sessions"\);/,
    },
  );

  assertProxyWrapperImports(checkoutSessionSource);
  assert.match(checkoutSessionSource, /export async function GET\(\s*_request: Request,\s*\{ params \}/s);
  assert.match(checkoutSessionSource, /const \{ sessionId \} = params;/);
  assertBillingGetHelperContract(checkoutSessionSource, {
    importPattern: /import \{ proxyWorkspaceBillingGet \} from "\.\.\/\.\.\/route-helpers";/,
    invocationPattern: /return proxyWorkspaceBillingGet\(`\/checkout-sessions\/\$\{sessionId\}`\);/,
  });

  assertBillingPostWrapperContract(
    checkoutSessionCompleteSource,
    {
      importPattern: /import \{ proxyWorkspaceBillingPost \} from "\.\.\/\.\.\/\.\.\/route-helpers";/,
      invocationPattern: /return proxyWorkspaceBillingPost\(request,\s*`\/checkout-sessions\/\$\{sessionId\}:complete`\);/,
    },
  );
  assert.match(checkoutSessionCompleteSource, /const \{ sessionId \} = params;/);
});

test("billing GET routes rely solely on proxyControlPlane without extra bodies", async () => {
  const [checkoutSessionSource, providersSource] = await Promise.all([
    readSource(checkoutSessionRoutePath),
    readSource(billingProvidersRoutePath),
  ]);

  assertGetRouteBodyFree(checkoutSessionSource);
  assertGetRouteBodyFree(providersSource);
  assertNoDirectFetchOrBase(checkoutSessionSource);
  assertNoDirectFetchOrBase(providersSource);
});

test("billing POST routes keep proxyControlPlane as the only upstream call", async () => {
  const [
    checkoutSessionsSource,
    checkoutSessionCompleteSource,
    portalSource,
    cancelSource,
    resumeSource,
  ] = await Promise.all([
    readSource(checkoutSessionsRoutePath),
    readSource(checkoutSessionCompleteRoutePath),
    readSource(portalSessionsRoutePath),
    readSource(subscriptionCancelRoutePath),
    readSource(subscriptionResumeRoutePath),
  ]);

  for (const source of [
    checkoutSessionsSource,
    checkoutSessionCompleteSource,
    portalSource,
    cancelSource,
    resumeSource,
  ]) {
    assertNoDirectFetchOrBase(source);
  }
});

test("billing providers, portal, and subscription routes keep proxy wrapper semantics", async () => {
  const [providersSource, portalSource, cancelSource, resumeSource] = await Promise.all([
    readSource(billingProvidersRoutePath),
    readSource(portalSessionsRoutePath),
    readSource(subscriptionCancelRoutePath),
    readSource(subscriptionResumeRoutePath),
  ]);

  assertProxyWrapperImports(providersSource);
  assert.match(providersSource, /export async function GET\(\)/);
  assertBillingGetHelperContract(providersSource, {
    importPattern: /import \{ proxyWorkspaceBillingGet \} from "\.\.\/route-helpers";/,
    invocationPattern: /return proxyWorkspaceBillingGet\("\/providers"\);/,
  });

  assertBillingPostWrapperContract(
    portalSource,
    {
      importPattern: /import \{ proxyWorkspaceBillingPost \} from "\.\.\/route-helpers";/,
      invocationPattern: /return proxyWorkspaceBillingPost\(request,\s*"\/portal-sessions"\);/,
    },
  );
  assertBillingPostWrapperContract(
    cancelSource,
    {
      importPattern: /import \{ proxyWorkspaceBillingPost \} from "\.\.\/\.\.\/route-helpers";/,
      invocationPattern: /return proxyWorkspaceBillingPost\(request,\s*"\/subscription:cancel"\);/,
    },
  );
  assertBillingPostWrapperContract(
    resumeSource,
    {
      importPattern: /import \{ proxyWorkspaceBillingPost \} from "\.\.\/\.\.\/route-helpers";/,
      invocationPattern: /return proxyWorkspaceBillingPost\(request,\s*"\/subscription:resume"\);/,
    },
  );
});

test("backend app keeps billing route handlers wired to checkout, provider, portal, and subscription endpoints", async () => {
  const source = await readSource(appPath);

  assert.match(source, /if \(request\.method === "POST" && saasWorkspaceBillingCheckoutSessionsMatch\)/);
  assert.match(source, /return createSaasWorkspaceBillingCheckoutSession\(/);

  assert.match(source, /if \(request\.method === "GET" && saasWorkspaceBillingCheckoutSessionMatch\)/);
  assert.match(source, /return getSaasWorkspaceBillingCheckoutSession\(/);

  assert.match(source, /if \(request\.method === "POST" && saasWorkspaceBillingCheckoutSessionCompleteMatch\)/);
  assert.match(source, /return completeSaasWorkspaceBillingCheckoutSession\(/);

  assert.match(source, /if \(request\.method === "GET" && saasWorkspaceBillingProvidersMatch\)/);
  assert.match(source, /return listSaasWorkspaceBillingProviders\(/);

  assert.match(source, /if \(request\.method === "POST" && saasWorkspaceBillingPortalSessionsMatch\)/);
  assert.match(source, /return createSaasWorkspaceBillingPortalSession\(/);

  assert.match(source, /if \(request\.method === "POST" && saasWorkspaceBillingSubscriptionCancelMatch\)/);
  assert.match(source, /return cancelSaasWorkspaceBillingSubscription\(/);

  assert.match(source, /if \(request\.method === "POST" && saasWorkspaceBillingSubscriptionResumeMatch\)/);
  assert.match(source, /return resumeSaasWorkspaceBillingSubscription\(/);
});

test("billing routes reuse helper init builders", async () => {
  const [
    checkoutSessionsSource,
    checkoutSessionSource,
    checkoutSessionCompleteSource,
    providersSource,
    portalSource,
    cancelSource,
    resumeSource,
  ] = await Promise.all([
    readSource(checkoutSessionsRoutePath),
    readSource(checkoutSessionRoutePath),
    readSource(checkoutSessionCompleteRoutePath),
    readSource(billingProvidersRoutePath),
    readSource(portalSessionsRoutePath),
    readSource(subscriptionCancelRoutePath),
    readSource(subscriptionResumeRoutePath),
  ]);

  for (const source of [checkoutSessionsSource, checkoutSessionCompleteSource, portalSource, cancelSource, resumeSource]) {
    const isComplete = source === checkoutSessionCompleteSource;
    const isSubscription = source === cancelSource || source === resumeSource;
    assertBillingPostHelperContract(source, {
      importPattern: isComplete
        ? /import \{ proxyWorkspaceBillingPost \} from "\.\.\/\.\.\/\.\.\/route-helpers";/
        : isSubscription
          ? /import \{ proxyWorkspaceBillingPost \} from "\.\.\/\.\.\/route-helpers";/
          : /import \{ proxyWorkspaceBillingPost \} from "\.\.\/route-helpers";/,
      invocationPattern: /proxyWorkspaceBillingPost\(request,/,
    });
  }

  for (const source of [checkoutSessionSource, providersSource]) {
    assertBillingGetHelperContract(source, {
      importPattern: source === checkoutSessionSource
        ? /import \{ proxyWorkspaceBillingGet \} from "\.\.\/\.\.\/route-helpers";/
        : /import \{ proxyWorkspaceBillingGet \} from "\.\.\/route-helpers";/,
      invocationPattern: /proxyWorkspaceBillingGet\(/,
    });
  }
});
