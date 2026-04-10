import assert from "node:assert/strict";
import test from "node:test";

import {
  applyWorkspaceSwitchOutcome,
  beginWorkspaceSwitcherSelection,
  createWorkspaceSwitcherViewState,
  syncWorkspaceSwitcherViewState,
} from "../workspace-switcher-state";

test("createWorkspaceSwitcherViewState initializes a clean idle state", () => {
  assert.deepEqual(createWorkspaceSwitcherViewState("ops"), {
    selected: "ops",
    isSaving: false,
    errorMessage: null,
    warningMessage: null,
  });
});

test("syncWorkspaceSwitcherViewState updates the selected slug and clears saving while preserving status copy", () => {
  assert.deepEqual(
    syncWorkspaceSwitcherViewState(
      {
        selected: "finance",
        isSaving: true,
        errorMessage: "switch failed",
        warningMessage: "fallback warning",
      },
      "ops",
    ),
    {
      selected: "ops",
      isSaving: false,
      errorMessage: "switch failed",
      warningMessage: "fallback warning",
    },
  );
});

test("beginWorkspaceSwitcherSelection returns null for no-op changes", () => {
  const state = createWorkspaceSwitcherViewState("ops");
  assert.equal(beginWorkspaceSwitcherSelection(state, "ops"), null);
});

test("beginWorkspaceSwitcherSelection marks the view as saving and clears transient messages", () => {
  const state = beginWorkspaceSwitcherSelection(
    {
      selected: "ops",
      isSaving: false,
      errorMessage: "old error",
      warningMessage: "old warning",
    },
    "finance",
  );

  assert.deepEqual(state, {
    selected: "finance",
    isSaving: true,
    errorMessage: null,
    warningMessage: null,
  });
});

test("applyWorkspaceSwitchOutcome keeps the new slug, warning, and refresh signal after success", () => {
  const result = applyWorkspaceSwitchOutcome({
    nextSlug: "finance",
    previousSlug: "ops",
    outcome: {
      status: "switched",
      warning: "Workspace switched using Environment fallback.",
      error: null,
    },
  });

  assert.equal(result.shouldRefresh, true);
  assert.deepEqual(result.nextState, {
    selected: "finance",
    isSaving: false,
    errorMessage: null,
    warningMessage: "Workspace switched using Environment fallback.",
  });
});

test("applyWorkspaceSwitchOutcome rolls back to the previous slug when switching fails", () => {
  const result = applyWorkspaceSwitchOutcome({
    nextSlug: "finance",
    previousSlug: "ops",
    outcome: {
      status: "failed",
      warning: null,
      error: new Error("switch failed"),
    },
  });

  assert.equal(result.shouldRefresh, false);
  assert.deepEqual(result.nextState, {
    selected: "ops",
    isSaving: false,
    errorMessage: "switch failed",
    warningMessage: null,
  });
});

test("applyWorkspaceSwitchOutcome uses a default error message for resilient failures without details", () => {
  const result = applyWorkspaceSwitchOutcome({
    nextSlug: "finance",
    previousSlug: "ops",
    outcome: {
      status: "continued_after_error",
      warning: null,
      error: null,
    },
  });

  assert.equal(result.shouldRefresh, false);
  assert.deepEqual(result.nextState, {
    selected: "ops",
    isSaving: false,
    errorMessage: "Failed to switch workspace",
    warningMessage: null,
  });
});
