// Live Issue Radar claims grouped by the Avoozl that released them. The group
// name is the Avoozl's display name; its ID is in the tooltip. Claims on an
// issue with no Avoozl marker sit under "No Avoozl". Read from GitHub only.
import Badge from "./Badge.tsx";
import { usePhone } from "./list-detail.ts";
import { relativeTime } from "./task-api.ts";
import {
  linkHref,
  type RadarClaim,
  type RadarCrewStrip,
  type RadarGroup,
} from "./views-api.ts";

const HEAD = ["Issue", "Crew", "Phase", "Claimed", "Last update", "PR"];

type Cost = RadarCrewStrip["cost"];

function Row({
  row,
  now,
  cost,
}: {
  row: RadarClaim;
  now: number;
  cost?: Cost[string];
}) {
  return (
    <tr
      data-radar-group-row
      className="border-t align-top"
      style={{ borderColor: "var(--border)" }}
    >
      <td className="py-1 pr-2">
        {linkHref(row.url) ? (
          <a
            href={linkHref(row.url)}
            target="_blank"
            rel="noreferrer"
            className="underline"
            aria-label={`Open issue ${row.number} on GitHub`}
          >
            {row.title}
          </a>
        ) : (
          row.title
        )}{" "}
        <span className="text-xs text-muted">
          {row.repository} #{row.number}
        </span>{" "}
        {row.stale && <Badge variant="warning">Stale</Badge>}
      </td>
      <td className="py-1 pr-2">
        {row.crewName ?? row.crewId ?? "no crew named"}
        {cost && cost.stages.length > 0 && (
          <span data-radar-cost className="block text-xs text-muted">
            {cost.credits.toFixed(1)} credits, {cost.turns} turns
          </span>
        )}
      </td>
      <td className="py-1 pr-2">
        {row.phase ?? "claim label, no claim comment"}
      </td>
      <td className="py-1 pr-2">{relativeTime(row.claimedAt ?? null, now)}</td>
      <td className="py-1 pr-2">
        {relativeTime(row.updated ?? row.issueUpdatedAt ?? null, now)}
      </td>
      <td className="py-1">
        {linkHref(row.prUrl) ? (
          <a
            href={linkHref(row.prUrl)}
            target="_blank"
            rel="noreferrer"
            className="underline"
            aria-label={`Open pull request ${row.pr} on GitHub`}
          >
            #{row.pr}
          </a>
        ) : (
          ""
        )}
      </td>
    </tr>
  );
}

// A phone has no room for six columns: each claim is two lines, the issue,
// then crew, phase, times and PR, wrapping inside the card.
function PhoneRow({ row, now }: { row: RadarClaim; now: number }) {
  return (
    <li
      data-radar-group-row
      className="border-t py-1.5 text-sm"
      style={{ borderColor: "var(--border)", overflowWrap: "anywhere" }}
    >
      {linkHref(row.url) ? (
        <a href={linkHref(row.url)} target="_blank" rel="noreferrer" className="underline" aria-label={`Open issue ${row.number} on GitHub`}>
          {row.title}
        </a>
      ) : (
        row.title
      )}{" "}
      {row.stale && <Badge variant="warning">Stale</Badge>}
      <span className="block text-xs text-muted">
        {row.repository} #{row.number} · {row.crewName ?? row.crewId ?? "no crew named"} · {row.phase ?? "claim label, no claim comment"} · claimed {relativeTime(row.claimedAt ?? null, now)} · updated{" "}
        {relativeTime(row.updated ?? row.issueUpdatedAt ?? null, now)}
        {row.pr ? ` · PR #${row.pr}` : ""}
      </span>
    </li>
  );
}

export default function RadarFlightGroups({
  groups,
  now,
  cost,
}: {
  groups: RadarGroup[];
  now: number;
  cost?: Cost;
}) {
  const phone = usePhone();
  return (
    <div data-radar-groups>
      {groups.map((group) => (
        <section
          key={group.instanceId ?? "none"}
          data-radar-group={group.instanceId ?? "none"}
          className="mt-2"
        >
          <h5
            className="text-xs font-semibold"
            title={group.instanceId ?? "These issues have no Avoozl marker."}
          >
            {group.name}
            {group.own ? " (this one)" : ""} ({group.rows.length})
          </h5>
          {phone ? (
            <ul className="m-0 list-none p-0">
              {group.rows.map((row) => (
                <PhoneRow key={`${row.repository}#${row.number}`} row={row} now={now} />
              ))}
            </ul>
          ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                {HEAD.map((name) => (
                  <th key={name} scope="col" className="pr-2 font-normal">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <Row
                  key={`${row.repository}#${row.number}`}
                  row={row}
                  now={now}
                  cost={cost?.[`${row.repository}#${row.number}`]}
                />
              ))}
            </tbody>
          </table>
          )}
        </section>
      ))}
    </div>
  );
}
