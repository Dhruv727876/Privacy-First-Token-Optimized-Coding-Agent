This problem statement is for **Problem Statement 01** of the **Global AI Hackathon Bifrost by Maxim AI**[1].

The primary objective is to build a functional coding agent (as a CLI, IDE extension, or server) that reliably completes real development tasks while **minimising token consumption and cost** without compromising code correctness[1][2].

### Key Requirements &amp; Constraints

* **Core Efficiency Goal:** Reduce token overhead by optimizing context—such as caching repeated requests, routing simpler sub-tasks to smaller models, trimming tool descriptions, and remembering previously inspected files[1][3].
* **Mandatory Requirements:**
  * **Reliability &amp; Failover:** Continue operating through API outages or rate limits without losing session context, notifying the user when a secondary model steps in[2].
  * **Budget Management:** Enforce spending limits on individual users prior to model calls, with explicit rules when a limit is reached[2].
  * **Code Privacy:** Guarantee that repositories marked confidential are processed solely by local models, overriding any prompt instructions[2].
  * **Action Approval:** Permit read operations automatically, but require explicit user authorization before performing write operations, shell commands, or Git actions[2].
* **Integrations:** Integrates **Bifrost** (for gateway routing/caching support) and **Tavily**[3][4]