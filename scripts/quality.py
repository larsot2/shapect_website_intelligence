"""
Reasoning-quality probe for eval variants (no LLM). Measures genericity, not length:
  python3 scripts/quality.py v2f v3a
- common-question overlap across sites (Jaccard of fieldKeys; high = same template everywhere)
- share of questions that are generic intake (timeframe/priorities/suburb/contact/property/room)
- questions anchored in a business fact/friction (basis) and with a stated purpose
- contexts with empty decisions, decisions written as slugs
- facts with [rule] character (exclusion/condition/price) that no question/variant/friction uses
- output tokens (to make sure "better" is not just "longer")
"""
import json, glob, re, sys, itertools

GENERIC = {"project.timeframe", "project.priorities", "contact.suburb", "contact.preferred_contact", "property.type", "project.room_type"}

def load(v):
    out = {}
    for f in sorted(glob.glob(f"data/eval/{v}/*.json")):
        d = json.load(open(f))
        out[d["site"]] = d
    return out

def words(t):
    return {w for w in re.findall(r"[a-z0-9$]+", (t or "").lower()) if len(w) > 3}

def report(v):
    data = load(v)
    keysets, rows = [], []
    for site, d in data.items():
        st, u, bp = d.get("strategy") or {}, d.get("understanding") or {}, d["blueprint"]
        sx = bp["suggestedExperiences"]
        qs = [q for s in sx for q in s.get("questionPlan", [])]
        vq = [q for s in sx for vv in s.get("contextVariants", []) for q in vv.get("additionalQuestions", [])]
        keys = {q["fieldKey"] for q in qs}
        keysets.append(keys)
        generic = sum(q["fieldKey"] in GENERIC for q in qs)
        anchored = sum(bool(q.get("basis")) for q in qs)
        purposed = sum(bool(q.get("purpose")) for q in qs)
        ctx = u.get("contexts", [])
        empty = sum(1 for c in ctx if not c.get("unresolvedDecisions") and c.get("support") != "unsupported")
        slugs = sum(1 for c in ctx for x in c.get("unresolvedDecisions", []) if re.fullmatch(r"[a-z_ ]{3,30}", x) and " " not in x.strip())
        rules = [f for f in u.get("facts", []) if f.get("topic") in ("exclusion", "condition", "price_reference")]
        used_text = " ".join([q["question"] for q in qs + vq] + [f.get("whyHardHere", "") + " " + f.get("visitorQuestion", "") for f in bp.get("frictions", [])])
        uw = words(used_text)
        unused = [f["label"] for f in rules if len(words(f["value"]) & uw) < 2]
        out_tok = (d.get("usage") or {}).get("outputTokens")
        rows.append((site, len(sx), len(qs), generic, anchored, purposed, len(vq), len(ctx), empty, slugs, len(rules), unused, len(bp.get("frictions", [])), len(st.get("opportunities", [])), out_tok))
    jac = [len(a & b) / max(1, len(a | b)) for a, b in itertools.combinations(keysets, 2)]
    print(f"\n=== {v}: mean cross-site Jaccard of common question keys = {sum(jac)/max(1,len(jac)):.2f}")
    print("site | entries | Qs | generic | anchored | purpose | variantQs | ctx | ctx w/o decisions | slug decisions | rule facts | frictions | opps | out tokens(last call)")
    for r in rows:
        print(" | ".join(str(x) for x in r[:11]), "|", r[12], "|", r[13], "|", r[14])
        print("     rule facts not used by any question/friction:", r[11])

for v in sys.argv[1:]:
    report(v)
