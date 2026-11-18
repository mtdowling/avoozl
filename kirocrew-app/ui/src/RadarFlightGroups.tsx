// Live Issue Radar claims grouped by the Avoozl that released them. The group
// name is the Avoozl's display name; its ID is in the tooltip. Claims on an
// issue with no Avoozl marker sit under "No Avoozl". Read from GitHub only.
import Badge from "./ui/Badge.tsx";
import { usePhone } from "./list-detail.ts";
import { relativeTime } from "./task-api.ts";
import {
  linkHref,
  type RadarClaim,
  type RadarCrewStrip,
  type RadarGroup,
} from "./views-api.ts";
import { Hint } from './ui/Hint'
import { TextLink } from './ui/TextLink'
import { Box } from './ui/Box'

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
      <Box as="td" py="1" pr="2">
        {linkHref(row.url) ? (
          <TextLink
            href={linkHref(row.url)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open issue ${row.number} on GitHub`}
          >
            {row.title}
          </TextLink>
        ) : (
          row.title
        )}{" "}
        <Hint size="xs">
          {row.repository} #{row.number}
        </Hint>{" "}
        {row.stale && <Badge variant="warning">Stale</Badge>}
      </Box>
      <Box as="td" py="1" pr="2">
        {row.crewName ?? row.crewId ?? "no crew named"}
        {cost && cost.stages.length > 0 && (
          <Hint data-radar-cost size="xs" block>
            {cost.credits.toFixed(1)} credits, {cost.turns} turns
          </Hint>
        )}
      </Box>
      <Box as="td" py="1" pr="2">
        {row.phase ?? "claim label, no claim comment"}
      </Box>
      <Box as="td" py="1" pr="2">{relativeTime(row.claimedAt ?? null, now)}</Box>
      <Box as="td" py="1" pr="2">
        {relativeTime(row.updated ?? row.issueUpdatedAt ?? null, now)}
      </Box>
      <Box as="td" py="1">
        {linkHref(row.prUrl) ? (
          <TextLink
            href={linkHref(row.prUrl)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open pull request ${row.pr} on GitHub`}
          >
            #{row.pr}
          </TextLink>
        ) : (
          ""
        )}
      </Box>
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
        <TextLink href={linkHref(row.url)} target="_blank" rel="noreferrer" aria-label={`Open issue ${row.number} on GitHub`}>
          {row.title}
        </TextLink>
      ) : (
        row.title
      )}{" "}
      {row.stale && <Badge variant="warning">Stale</Badge>}
      <Hint size="xs" block>
        {row.repository} #{row.number} · {row.crewName ?? row.crewId ?? "no crew named"} · {row.phase ?? "claim label, no claim comment"} · claimed {relativeTime(row.claimedAt ?? null, now)} · updated{" "}
        {relativeTime(row.updated ?? row.issueUpdatedAt ?? null, now)}
        {row.pr ? ` · PR #${row.pr}` : ""}
      </Hint>
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
        <Box
          key={group.instanceId ?? "none"}
          data-radar-group={group.instanceId ?? "none"}
          as="section" mt="2"
        >
          <Box
            as="h5" size="xs" weight="semibold"
            title={group.instanceId ?? "These issues have no Avoozl marker."}
          >
            {group.name}
            {group.own ? " (this one)" : ""} ({group.rows.length})
          </Box>
          {phone ? (
            <Box as="ul" m0 listNone p="0">
              {group.rows.map((row) => (
                <PhoneRow key={`${row.repository}#${row.number}`} row={row} now={now} />
              ))}
            </Box>
          ) : (
          <Box as="table" wFull align="left" size="sm">
            <thead>
              <Box as="tr" size="xs" tone="muted">
                {HEAD.map((name) => (
                  <Box key={name} scope="col" as="th" pr="2" weight="normal">
                    {name}
                  </Box>
                ))}
              </Box>
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
          </Box>
          )}
        </Box>
      ))}
    </div>
  );
}
