# 01 · Architecture Overview

| Piece | Content |
|---|---|
| [1 · Topology Overview](1-topology-overview.md) | Seven layers + who reads whom／who writes whom + one full cycle + the relationship to the engine |
| [2 · Workflow Map](2-workflow-map.md) ★ | **Which workflows do I have to build, which scenes does each one need** —— five chains, the scene list, the priority order, the three questions to ask before opening a scene |

📐 **Visual version**: [`diagrams/topology-scene-memory-architecture.svg`](diagrams/topology-scene-memory-architecture.svg)
(vector, scales losslessly; the text version in the file opens in any environment)

---

## What to look at in this diagram

**Nodes = which layer a thing lives on; edges = who reads whom, who writes whom.**

There are two kinds of edge on the diagram, do not confuse them:

| Edge | Meaning |
|---|---|
| **Solid with an arrow** | Data flow (injection, dispatch, receipt, write-back) |
| **Dashed** | Audit (git log, audit log) —— carries no data, only leaves a trace |

---

## How to read the layer numbers

> ⚠️ **The layer number is the "ownership level", not "the order from top to bottom".**
> Top to bottom on the diagram is the **main data flow**: L0 → L2 → L1 → L3 → L4/L5
> (C6 receipt is the exception, it goes up).

The full definition of the layer numbers is in the "seven layers" table in [`overview.md`](../overview.md).

---

## One sentence to remember

> **Routing is by directory, delivery is by RPC, the trail is left in files, verification is fail-closed.**

---

⬅️ **Back**: [Document Map](../README.md) ｜ **Next**: [Implementation](../02-implementation/1-directory-and-file-spec.md)
