import type { QueryResult, QueryResultRow } from 'pg';

/** Anything that can run a parameterised query: the pool, or a client inside a transaction. */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}
