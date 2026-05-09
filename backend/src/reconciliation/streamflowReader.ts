/**
 * Streamflow live-state reader.
 *
 * The real implementation will use `@streamflow/stream@8.4.0` to fetch the
 * Contract account. Until the program is on Devnet and the package can be
 * exercised end-to-end, we use the same interface with a stub that returns
 * `MissingMetadata` for any address — which exercises the missing-metadata
 * branch of the checks code path.
 *
 * Plug the real fetcher into `RealStreamflowReader.read()` when ready.
 */

export type StreamflowSnapshot =
  | { kind: "ok"; ownerOk: boolean; version: number; recipient: string; mint: string; vestingAmountRaw: bigint; closed: boolean }
  | { kind: "missing"; reason: string };

export interface StreamflowReader {
  read(streamflowMetadata: string): Promise<StreamflowSnapshot>;
}

export class StubStreamflowReader implements StreamflowReader {
  async read(_meta: string): Promise<StreamflowSnapshot> {
    return { kind: "missing", reason: "stub: real @streamflow/stream wiring pending" };
  }
}

export class MockStreamflowReader implements StreamflowReader {
  constructor(private fixtures: Map<string, StreamflowSnapshot>) {}
  async read(meta: string): Promise<StreamflowSnapshot> {
    return this.fixtures.get(meta) ?? { kind: "missing", reason: "not in mock fixture" };
  }
}

// Default reader used by the cron. Swap to the real impl when @streamflow/stream
// integration is wired up.
export const defaultReader: StreamflowReader = new StubStreamflowReader();
