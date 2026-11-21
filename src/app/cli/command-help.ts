// One usage line of `avoozl help`: the group it is listed under, the usage,
// what it does, and (`first`) the shorter wording the overview shows.
export interface HelpLine {
  group: string;
  usage: string;
  about: string;
  first: { usage: string; about: string } | null;
}
export const help = (
  group: string,
  usage: string,
  about = "",
  first: HelpLine["first"] = null,
): HelpLine => ({
  group,
  usage,
  about,
  first,
});
