import assert from "node:assert/strict";

export function assertOrderedSnippets(source: string, snippets: string[], context: string): void {
  let fromIndex = 0;
  for (const snippet of snippets) {
    const foundAt = source.indexOf(snippet, fromIndex);
    assert.notEqual(
      foundAt,
      -1,
      `Expected ${context} to include snippet in order: ${JSON.stringify(snippet)}`,
    );
    fromIndex = foundAt + snippet.length;
  }
}
