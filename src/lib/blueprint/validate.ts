import { BlueprintSchema, type Blueprint, type Evidence } from "./schema";

export type ValidationResult =
  | { ok: true; blueprint: Blueprint }
  | { ok: false; errors: string[] };

/**
 * Parse + structurally validate a blueprint, then check every cross reference
 * (pageId, assetId, suggestionId, connection targets, evidence urls).
 * A blueprint with dangling references is rejected rather than half-rendered.
 */
export function validateBlueprint(input: unknown): ValidationResult {
  const parsed = BlueprintSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const bp = parsed.data;
  const errors = referenceErrors(bp);
  return errors.length ? { ok: false, errors } : { ok: true, blueprint: bp };
}

export function referenceErrors(bp: Blueprint): string[] {
  const errors: string[] = [];
  const pages = new Map(bp.pages.map((p) => [p.id, p]));
  const assets = new Set(bp.conversionAssets.map((a) => a.id));
  const suggestions = new Set(bp.suggestedExperiences.map((s) => s.id));

  const dupes = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const i of ids) {
      if (seen.has(i)) errors.push(`duplicate ${label} id "${i}"`);
      seen.add(i);
    }
  };
  dupes("page", bp.pages.map((p) => p.id));
  dupes("asset", bp.conversionAssets.map((a) => a.id));
  dupes("suggestion", bp.suggestedExperiences.map((s) => s.id));
  dupes("claim", bp.businessClaims.map((c) => c.id));
  dupes("touchpoint", bp.suggestedExperiences.flatMap((s) => s.touchpoints.map((t) => t.id)));

  const page = (ref: string, where: string) => {
    if (!pages.has(ref)) errors.push(`${where}: unknown pageId "${ref}"`);
  };
  const asset = (ref: string | undefined, where: string) => {
    if (ref && !assets.has(ref)) errors.push(`${where}: unknown assetId "${ref}"`);
  };
  const evidence = (ev: Evidence[], where: string) =>
    ev.forEach((e, i) => {
      const p = pages.get(e.pageId);
      if (!p) errors.push(`${where}.evidence[${i}]: unknown pageId "${e.pageId}"`);
      else if (p.url !== e.url) errors.push(`${where}.evidence[${i}]: url does not match page "${e.pageId}"`);
    });

  bp.pageGroups.forEach((g) => g.crawledPageIds.forEach((p) => page(p, `pageGroup ${g.id}`)));
  bp.services.forEach((s) => s.pageIds.forEach((p) => page(p, `service ${s.id}`)));
  bp.businessClaims.forEach((c) => evidence(c.evidence, `claim ${c.id}`));
  bp.conversionAssets.forEach((a) => {
    if (a.targetPageId) page(a.targetPageId, `asset ${a.id}.target`);
    a.occurrences.forEach((o) => page(o.pageId, `asset ${a.id}.occurrence`));
    evidence(a.evidence, `asset ${a.id}`);
  });
  evidence(bp.conversionStrategy.evidence, "conversionStrategy");
  bp.coverage.forEach((c) => c.assetIds.forEach((a) => asset(a, `coverage ${c.capability}`)));
  bp.journeys.forEach((j) => {
    j.steps.forEach((s) => {
      s.pageIds.forEach((p) => page(p, `journey ${j.id}.${s.id}`));
      asset(s.assetId, `journey ${j.id}.${s.id}`);
    });
    evidence(j.evidence, `journey ${j.id}`);
  });
  bp.suggestedExperiences.forEach((s) => {
    s.pageContexts.forEach((c) => page(c.pageId, `suggestion ${s.id}.pageContext`));
    s.touchpoints.forEach((t) => {
      page(t.pageId, `suggestion ${s.id}.touchpoint ${t.id}`);
      asset(t.assetId, `suggestion ${s.id}.touchpoint ${t.id}`);
      if (t.positionVerified && t.bboxes.length === 0) errors.push(`suggestion ${s.id}.touchpoint ${t.id}: positionVerified without measured bbox`);
    });
    asset(s.conversionTargetAssetId, `suggestion ${s.id}.conversionTarget`);
    evidence(s.evidence, `suggestion ${s.id}`);
  });
  bp.assetActions.forEach((a) => {
    asset(a.assetId, `assetAction ${a.id}`);
    page(a.pageId, `assetAction ${a.id}`);
    if (a.relatedSuggestionId && !suggestions.has(a.relatedSuggestionId))
      errors.push(`assetAction ${a.id}: unknown suggestion "${a.relatedSuggestionId}"`);
  });
  bp.suggestedConnections.forEach((c) => {
    if (!suggestions.has(c.fromSuggestionId)) errors.push(`connection ${c.id}: unknown from "${c.fromSuggestionId}"`);
    if (c.to.kind === "suggestion" && !suggestions.has(c.to.id)) errors.push(`connection ${c.id}: unknown to "${c.to.id}"`);
    if (c.to.kind === "existing_asset") asset(c.to.id, `connection ${c.id}.to`);
    // Connections are planning only in V1: never "active".
    evidence(c.evidence, `connection ${c.id}`);
  });
  bp.unsupportedOpportunities.forEach((o) => evidence(o.evidence, `opportunity ${o.id}`));
  bp.gateDecisions.forEach((g) => evidence(g.evidence, `gate ${g.id}`));
  return errors;
}
