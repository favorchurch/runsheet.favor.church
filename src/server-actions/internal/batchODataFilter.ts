'use server';

/**
 * OData has a MaxNodeCount limit of 100 in Rock.
 * Each `Field eq Value` clause uses ~3-4 nodes, plus connectors.
 * Batch size of 12 keeps us safely under the 100-node limit even when
 * combined with other filters like `IsActive eq true`.
 */
const BATCH_SIZE = 12;

export interface BatchODataFilterOptions {
  batchSize?: number;
  retryOnNodeLimit?: boolean;
}

function buildBatchFilter(ids: number[], field: string): string {
  return ids.length === 1
    ? `${field} eq ${ids[0]}`
    : `(${ids.map((id) => `${field} eq ${id}`).join(' or ')})`;
}

function isMaxNodeCountError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const msg = error.message.toLowerCase();
  return (
    msg.includes('maxnodecount') ||
    msg.includes('node count') ||
    msg.includes('nodecount')
  );
}

async function runBatch<T>(
  ids: number[],
  field: string,
  fetcher: (filter: string) => Promise<T[]>,
  retryOnNodeLimit: boolean
): Promise<T[]> {
  try {
    return await fetcher(buildBatchFilter(ids, field));
  } catch (error) {
    if (!retryOnNodeLimit || !isMaxNodeCountError(error) || ids.length === 1) {
      throw error;
    }

    console.warn(
      `[batchODataFilter] Node count limit hit for ${ids.length} IDs. Retrying with smaller batches...`
    );

    const midpoint = Math.ceil(ids.length / 2);
    const left = ids.slice(0, midpoint);
    const right = ids.slice(midpoint);
    const [leftResults, rightResults] = await Promise.all([
      runBatch(left, field, fetcher, retryOnNodeLimit),
      runBatch(right, field, fetcher, retryOnNodeLimit),
    ]);

    return [...leftResults, ...rightResults];
  }
}

/**
 * Builds an OData `or` filter for an array of IDs, batching the
 * requests when the array exceeds the safe threshold.
 *
 * @param ids - Array of numeric IDs to filter on
 * @param field - The OData field name (e.g. 'Id', 'GroupId')
 * @param fetcher - Async function that receives the $filter string and returns results
 * @returns Combined results from all batches
 */
export async function batchODataFilter<T>(
  ids: number[],
  field: string,
  fetcher: (filter: string) => Promise<T[]>,
  options?: BatchODataFilterOptions
): Promise<T[]> {
  const batchSize = options?.batchSize ?? BATCH_SIZE;
  const retryOnNodeLimit = options?.retryOnNodeLimit ?? true;

  // Filter out any invalid numbers (e.g. NaN, undefined, null) that could cause OData parsing errors
  const validIds = Array.from(new Set(ids.filter((id) => id != null && !Number.isNaN(id)))).sort((a, b) => a - b);
  if (validIds.length === 0) return [];

  const batches: number[][] = [];
  for (let i = 0; i < validIds.length; i += batchSize) {
    batches.push(validIds.slice(i, i + batchSize));
  }

  const results = await Promise.all(
    batches.map((batch) => runBatch(batch, field, fetcher, retryOnNodeLimit))
  );

  return results.flat();
}
