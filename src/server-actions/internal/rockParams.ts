/**
 * OData query builder for Rock RMS API.
 * Usage: buildRockParams({ filter: ..., select: ..., expand: ..., orderBy: ..., top: ..., skip: ... })
 */

type ODataOperator = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le' | 'contains' | 'startswith' | 'endswith' | 'in';

interface FilterCondition {
  field: string;
  op: ODataOperator;
  value: string | number | boolean;
}

export interface RockParams {
  filter?: (FilterCondition | string)[];
  select?: string[];
  expand?: string[];
  orderBy?: string;
  top?: number;
  skip?: number;
}

function formatFilterCondition(cond: FilterCondition | string): string {
  if (typeof cond === 'string') return cond;
  const { field, op, value } = cond as FilterCondition;

  switch (op) {
    case 'contains':
    case 'startswith':
    case 'endswith': {
      // Escape single quotes by doubling them for OData
      const escapedValue = String(value).replace(/'/g, "''");
      return `${op}(${field},'${escapedValue}')`;
    }
    case 'in':
      if (typeof value === 'string' && value.includes(',')) {
        return `(${value.split(',').map(v => `${field} eq ${v.trim()}`).join(' or ')})`;
      }
      return `${field} eq ${value}`;
    default:
      if (typeof value === 'boolean') {
        return `${field} ${op} ${value}`;
      }
      if (typeof value === 'number') {
        return `${field} ${op} ${value}`;
      }
      // Escape single quotes by doubling them for string values
      const escapedValue = String(value).replace(/'/g, "''");
      return `${field} ${op} '${escapedValue}'`;
  }
}

function buildFilterString(conditions: (FilterCondition | string)[]): string {
  return conditions.map(formatFilterCondition).join(' and ');
}

/**
 * Build Rock OData query parameters from a structured params object.
 */
export function buildRockParams(params: RockParams): Record<string, string> {
  const result: Record<string, string> = {};

  if (params.filter && params.filter.length > 0) {
    result['$filter'] = buildFilterString(params.filter);
  }

  if (params.select && params.select.length > 0) {
    result['$select'] = params.select.join(',');
  }

  if (params.expand && params.expand.length > 0) {
    result['$expand'] = params.expand.join(',');
  }

  if (params.orderBy) {
    result['$orderby'] = params.orderBy;
  }

  if (params.top !== undefined) {
    result['$top'] = String(params.top);
  }

  if (params.skip !== undefined) {
    result['$skip'] = String(params.skip);
  }

  return result;
}

/**
 * Shorthand: build just a $filter string from conditions.
 */
export function buildRockFilter(conditions: (FilterCondition | string)[]): string {
  return buildFilterString(conditions);
}

/**
 * Combine multiple filter arrays with 'and'.
 */
export function andFilters(...filterArrays: (FilterCondition | string)[][]): (FilterCondition | string)[] {
  return filterArrays.flat();
}
