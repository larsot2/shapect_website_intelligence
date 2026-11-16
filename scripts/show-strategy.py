"""
Compact, reasoning-focused view of an eval variant (no LLM):
  python3 scripts/show-strategy.py v3c [site]
"""
import json, glob, sys

v = sys.argv[1]
only = sys.argv[2] if len(sys.argv) > 2 else ""
for f in sorted(glob.glob(f"data/eval/{v}/*.json")):
    d = json.load(open(f))
    if only and only not in d["site"]:
        continue
    b, u = d["blueprint"], d.get("understanding") or {}
    print(f"\n################ {d['site']}  (${d['usage']['costUsd']:.3f}, {d['usage']['calls']} calls)")
    print("CONTEXTS:", "; ".join(f"{c['label']}[{c.get('dimension','?')}/{c['support']}]" for c in u.get("contexts", [])))
    print("CONTENT:", "; ".join(f"{c['id']}({c['kind']})" for c in b.get("contentAssets", [])))
    for r in b.get("assetReviews", []):
        print(f"REVIEW {r['assetId']}: fit={r['contextFit']} −{r['weaknesses']} {r.get('contextNote') or ''}")
    print("READINESS:", b.get("readinessSignals"))
    for fr in b.get("frictions", []):
        print(f"FRICTION [{fr['status']}] {fr['visitorQuestion']} — {fr['whyHardHere'][:170]}")
    a = b.get("architecture")
    if a:
        print("ARCH:", a["chosen"], "—", a["rationale"][:260])
        for x in a["alternatives"]:
            print(f"   {x['key']} {x['fit']}: {x['why'][:150]}")
    for o in b.get("opportunityInventory", []):
        print(f"OPP [{o.get('stage')}/{o.get('value')}/{o.get('readiness')}/{o['action']}] {o['label']}: {o.get('transformation') or o['decisionGap']}"[:300])
    for s in b["suggestedExperiences"]:
        print(f"\n ▶ {s['label']} [{s.get('role')} p{s.get('priority')} · {s['action']} · {s.get('interactionType')} · {s.get('implementationReadiness')} · {s.get('stages')}]")
        print(f"   headline: {s['headline']}")
        print(f"   motivation: {s.get('motivation')}")
        print(f"   promise: {s.get('promise')} → outcome: {s.get('outcome')}")
        print(f"   specific: {s.get('specificToBusiness')}")
        print(f"   why not simpler: {s.get('whyNotSimpler')} | why not more: {s.get('whyNotMoreComplex')}")
        print(f"   flow: {' → '.join(x['title'] for x in s['experienceSteps'])}")
        for q in s["questionPlan"]:
            print(f"     Q[{q.get('purpose')}] {q['question']}  ({q.get('basis') or '-'})"[:220])
        for vv in s["contextVariants"]:
            print(f"     path {vv['contextId']}: “{vv['startingHook']}” +{[q['question'] for q in vv['additionalQuestions']]}"[:240])
        if s.get("requirements"):
            print("   requires:", s["requirements"])
    for c in b["suggestedConnections"]:
        if c["to"]["kind"] == "suggestion":
            print(f" ⇄ {c['fromSuggestionId']} → {c['to']['id']} [{c.get('mode')}] shared={c['possibleSharedFields']} motivation={c.get('motivation')}")
    print(" assetActions:", [(x["assetId"][:24], x["proposal"]) for x in b["assetActions"]])
    print(" not suggested:", [g["label"] for g in b["gateDecisions"]])
    print(" noted:", [(x["label"], x["reason"]) for x in b["unsupportedOpportunities"]])
