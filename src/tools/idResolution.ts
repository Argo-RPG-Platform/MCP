/**
 * Resolves user-supplied mnemon ID references to canonical hex entryIds.
 *
 * LLM clients almost never see hex IDs: list responses are formatted with the
 * hex stashed in a hidden [id-map] footnote. So write tools routinely receive
 * a *title* where the WebAPI expects an `entryId`. WebAPI silently accepts the
 * bad value and the post-create sync detaches the entry — making it look like
 * the create succeeded while the result is invisible to players.
 *
 * This module forces resolution at the MCP boundary: hex IDs pass through; any
 * other string is looked up against `list_mnemons` and rejected with a clear
 * error on miss / ambiguity.
 */

import { listMnemons, type MnemonSummary } from "./mnemon.js";

export const HEX_ENTRY_ID_RE = /^[0-9A-Fa-f]{32}$/;

export function isHexEntryId(value: string): boolean {
  return HEX_ENTRY_ID_RE.test(value);
}

export class MnemonResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MnemonResolutionError";
  }
}

export interface ResolveOptions {
  /** Restricts candidates to a specific mnemon type (e.g. "Player", "Location"). */
  type?: string;
  /** Field name surfaced in error messages (e.g. "partyId", "sourceEntryId"). */
  fieldLabel: string;
}

/**
 * Caches one `list_mnemons` call per campaign for the lifetime of the
 * resolver. A single tool invocation may resolve many fields; we never want to
 * make more than one extra GET regardless of how many references we touch.
 */
export class MnemonResolver {
  private cache?: Promise<MnemonSummary[]>;

  constructor(private readonly campaignId: string) {}

  private list(): Promise<MnemonSummary[]> {
    if (!this.cache) {
      this.cache = listMnemons({ campaignId: this.campaignId });
    }
    return this.cache;
  }

  async resolve(value: string, options: ResolveOptions): Promise<string> {
    if (isHexEntryId(value)) {
      return value.toUpperCase();
    }

    const entries = await this.list();
    const typeMatch = (e: MnemonSummary): boolean => !options.type || e.type === options.type;

    const exact = entries.filter((e) => e.title === value && typeMatch(e));
    if (exact.length === 1) return exact[0].entryId;
    if (exact.length > 1) {
      throw this.ambiguous(value, options, exact);
    }

    const ci = entries.filter(
      (e) => e.title.toLowerCase() === value.toLowerCase() && typeMatch(e)
    );
    if (ci.length === 1) return ci[0].entryId;
    if (ci.length > 1) {
      throw this.ambiguous(value, options, ci);
    }

    throw new MnemonResolutionError(
      `${options.fieldLabel}: no mnemon found with title ${JSON.stringify(value)}` +
        (options.type ? ` of type ${JSON.stringify(options.type)}` : "") +
        ` in campaign ${this.campaignId}. Pass the entryId explicitly.`
    );
  }

  async resolveOptional(
    value: string | undefined,
    options: ResolveOptions
  ): Promise<string | undefined> {
    if (value === undefined) return undefined;
    return this.resolve(value, options);
  }

  async resolveArray(
    values: string[] | undefined,
    options: ResolveOptions
  ): Promise<string[] | undefined> {
    if (values === undefined) return undefined;
    return Promise.all(
      values.map((v, i) =>
        this.resolve(v, { ...options, fieldLabel: `${options.fieldLabel}[${i}]` })
      )
    );
  }

  private ambiguous(
    value: string,
    options: ResolveOptions,
    matches: MnemonSummary[]
  ): MnemonResolutionError {
    const ids = matches.map((m) => m.entryId).join(", ");
    return new MnemonResolutionError(
      `${options.fieldLabel}: title ${JSON.stringify(value)} matches ${matches.length} mnemons` +
        (options.type ? ` of type ${JSON.stringify(options.type)}` : "") +
        `. Pass the entryId explicitly: ${ids}`
    );
  }
}
