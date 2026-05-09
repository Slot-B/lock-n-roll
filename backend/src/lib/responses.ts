export function ok<T>(data: T, nextCursor: string | null = null) {
  return {
    data,
    meta: {
      ts: new Date().toISOString(),
      ...(nextCursor !== null ? { next_cursor: nextCursor } : {}),
    },
  };
}
