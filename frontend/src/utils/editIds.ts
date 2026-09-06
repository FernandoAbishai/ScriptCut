import type { DeletedRange, EditOperation } from '../types/project';

export type EditIdPrefix = 'dr' | 'op';

let fallbackTokenCounter = 0;

function createEditToken(): string {
  const cryptoObject = globalThis.crypto;
  if (typeof cryptoObject?.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }

  if (typeof cryptoObject?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObject.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }

  fallbackTokenCounter += 1;
  return `${Date.now().toString(36)}-${fallbackTokenCounter.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createUniqueEditId(
  prefix: EditIdPrefix,
  usedIds: ReadonlySet<string>,
  tokenFactory: () => string = createEditToken,
): string {
  const token = tokenFactory().replace(/[^a-zA-Z0-9-]/g, '') || 'edit';
  let attempt = 0;

  for (;;) {
    const suffix = attempt === 0 ? token : `${token}_${attempt}`;
    const id = `${prefix}_${suffix}`;
    if (!usedIds.has(id)) return id;
    attempt += 1;
  }
}

export function collectEditIds(
  deletedRanges: readonly DeletedRange[],
  editOperations: readonly EditOperation[],
): Set<string> {
  return new Set([
    ...deletedRanges.map((range) => range.id),
    ...editOperations.map((operation) => operation.id),
  ]);
}

function reservePersistedId(
  prefix: EditIdPrefix,
  persistedId: string,
  usedIds: Set<string>,
): string {
  if (persistedId && !usedIds.has(persistedId)) {
    usedIds.add(persistedId);
    return persistedId;
  }

  const replacement = createUniqueEditId(prefix, usedIds);
  usedIds.add(replacement);
  return replacement;
}

/**
 * Keep legacy persisted IDs stable when they are unique, while repairing
 * duplicates produced by older counter-based builds. Delete operations are
 * paired back to their corresponding deleted ranges so restore semantics stay
 * intact after migration.
 */
export function normalizeLoadedEditIds(
  deletedRanges: readonly DeletedRange[],
  editOperations: readonly EditOperation[],
): { deletedRanges: DeletedRange[]; editOperations: EditOperation[] } {
  const usedIds = new Set<string>();
  const deleteIdQueues = new Map<string, string[]>();

  const normalizedDeletedRanges = deletedRanges.map((range) => {
    const originalId = range.id;
    const id = reservePersistedId('dr', originalId, usedIds);
    const queue = deleteIdQueues.get(originalId) || [];
    queue.push(id);
    deleteIdQueues.set(originalId, queue);
    return id === originalId ? { ...range } : { ...range, id };
  });

  const pendingDeleteIds = new Map<string, string[]>(
    Array.from(deleteIdQueues, ([id, queue]): [string, string[]] => [id, [...queue]]),
  );
  const matchedDeleteIds = new Set<string>();
  const normalizedOperations: EditOperation[] = [];

  for (const operation of editOperations) {
    if (operation.kind === 'delete') {
      const queue = pendingDeleteIds.get(operation.id);
      const mappedId = queue?.shift();
      if (mappedId) {
        matchedDeleteIds.add(mappedId);
        normalizedOperations.push(
          mappedId === operation.id ? { ...operation } : { ...operation, id: mappedId },
        );
        continue;
      }

      const id = reservePersistedId('dr', operation.id, usedIds);
      normalizedOperations.push(id === operation.id ? { ...operation } : { ...operation, id });
      continue;
    }

    const id = reservePersistedId('op', operation.id, usedIds);
    normalizedOperations.push(id === operation.id ? { ...operation } : { ...operation, id });
  }

  for (const range of normalizedDeletedRanges) {
    if (matchedDeleteIds.has(range.id)) continue;
    normalizedOperations.push({
      id: range.id,
      kind: 'delete',
      start: range.start,
      end: range.end,
      wordIndices: range.wordIndices,
    });
  }

  return {
    deletedRanges: normalizedDeletedRanges,
    editOperations: normalizedOperations,
  };
}
