# 02 · Implementation

> From "understanding it" to "building it", to "coming back to change it".
> This section covers three things: **specs**, **validation**, **maintenance**.

| Doc | One line | For whom |
|---|---|---|
| [1 · Directory and File Spec](1-directory-and-file-spec.md) | Directory structure, file formats, naming conventions — **a spec you can copy** | people who build |
| [2 · Handover and Validation](2-handover-and-validation.md) | Five mechanical invariants, session-switch protocol, counter-example acceptance table | people who maintain |
| [3 · Maintenance Manual](3-maintenance-manual.md) ★★ | **The standard procedure for changing the architecture**: inventory → define → migrate → verify → record | ★ people who come back to maintain |
| [4 · Known Gaps and To-Do](4-known-gaps-and-todo.md) | Located but unfixed problems — with root cause and fix (**including three new gaps in the accumulation mechanism**) | people taking over |
| [5 · New Scene Spec](5-new-scene-spec.md) ★★ | **A standard scene = 10 + 3**; the **ten steps** from judgement to an all-green `check`, each with acceptance criteria | people opening a new scene |
| [6 · Archive Layer](6-archive-layer.md) ★ | **Where the full chat transcript goes**: three-layer split, directory spec, engine export contract, three ways to read it | people who want to keep history |
| [7 · Session Switch](7-session-switch.md) ★ | **A session switch = one atomic operation with self-check**: four steps, three sync points, what the tools block | people switching sessions |
| [8 · Content-to-Shot Spec](8-content-to-shot-spec.md) ★★ | **How one video grows out of the source material**: two parallel tracks, SPOT mapping contract, REVIEW discipline | people making content |

---

## One line

> **Specs are for humans to copy, validation is for machines to enforce, the maintenance manual is for future you to read.**

---

## How these four connect

```
1-Directory and File Spec  ──defines shape──▶  2-Handover and Validation  ──enforces rules──▶  3-Maintenance Manual
      (what it looks like)                  (how to confirm it isn't broken)          (what to do when it breaks / must change)
         │                                                     ▲
         │                                            5-New Scene Spec
         │                                        (adding is another kind of "changing")
         ▼                                                     │
4-Known Gaps and To-Do ────────────────────────────────────────┘
  (this is where the reasons to change come from)
```

**8-Content-to-Shot Spec** is the first **implementation chain with a measured case**:
```
content.md (the single source of truth)
   ├──▶ Track A · OpenDesign ──▶ report / deck HTML
   └──▶ Track B · Narration ──▶ beats ──▶ compositions ──▶ MP4 ──▶ REVIEW
```
> ★ The two tracks share the **source material and tokens**, and **do not convert into each other** (conversion loses information).
> ★ The easiest trap to fall into: **an all-green `check` does not mean there is no problem** — wrong order, overlapping elements, `check` cannot catch them.

**6-Archive Layer ＋ 7-Session Switch** are two separate things:
```
6-Archive Layer  ──owns "where the full chat transcript goes"──▶  session-archive/ + index (greppable)
7-Session Switch  ──owns "how the identity is swapped"──▶  four steps + three sync points + mechanical self-check
      │                                    │
      └──── while switching, also file away the old session ◀────┘
```

> **5-New Scene Spec** is especially worth reading first: it turns "open a new scene" into a
> **ten-step, mechanically-accepted-each-step** process, and exposes three traps with "insidious symptoms"
> (forgot `git init`, filled sessionId in only one place, changed the locator card without re-stamping).

---

## ⚠️ Read this before you touch anything

**Start with the "six things people trip over most" in [`getting-started.md`](../getting-started.md).
Two of them — "forgot `git init`" and "wrote §0 as a weekly report" — make you conclude on the first try
that this method is useless; "the receipt just says everything is fine" is the reason **nothing accumulates** —
no tool blocks it today, you have to remember it yourself.

---

> ⬅️ **Back**: [Document Map](../README.md) ｜ **Related**: [Core Mechanisms](../00-core-mechanisms/)
