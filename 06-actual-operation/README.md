# 6 · As Actually Run

> This directory describes **reality**: what this architecture actually is, what grew, what never grew, and where the spec and the machine disagree.
>
> The spec (core mechanisms + implementation) describes the **design**. Both are correct — but the spec was written when there were three scenes.
>
> Every number here comes with the command that produced it.

| you want | go to |
|---|---|
| the full account (with evidence) | [1-as-actually-run.md](1-as-actually-run.md) |
| just the gap table | [2-quick-reference.md](2-quick-reference.md) |
| the design itself | [overview](../overview.md) · [core mechanisms](../00-core-mechanisms/) |

---

## Three sentences

1. **The spec says 3 scenes; there are 24.**
2. **The shared layer is not "shared memory" — it is "the routing table + the dispatch channel". The other three boards are empty.**
3. **The entry point is not in the spec: the entry point is Hermes; DSH is the side that gets dispatched to.**

---

⬅️ **Back**: [README](../README.md)
