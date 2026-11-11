# What's Next

## Use cases this demo can power

Every use case below is the same loop: field workers capture photos, drop them
into object storage, and the governed agent analyzes them — counts are
estimates, not records.

| Use case | One-line gist |
|---|---|
| Event / conference analytics | The current demo: attendee and raised-hand estimates per session photo, with a GPS session map. |
| Industrial / factory floor inspections | Safety-walkthrough photos → PPE compliance, blocked exits, occupancy per zone. |
| Airport & security-post inspections | Queue lengths, crowd density at gates and checkpoints, raised hands during briefings. |
| Smart-city infrastructure | Lamp posts, utility boxes and public works photographed on rounds → damage flags plus crowd presence at public spaces. |
| Field service & insurance claims | Damage photos → structured summaries and rough counts (vehicles, affected rooms). |

## Roadmap ideas

- **Inbox processing (next)**: photos land in `snaps/inbox/` and the governed
  agent validates, processes, and files them automatically — no upload UI
  needed. Planned as a watch-triggered tool-using agent behind the same
  sandbox boundary.
- **Session trends**: aggregate the cached per-photo results into trend charts
  across a whole event.
- **Density alerts**: notify when an estimated count crosses a threshold.
- **Report export**: one-click CSV/PDF summary of a session, generated from the
  cached analysis JSON — no model calls needed.
