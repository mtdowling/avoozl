// One usage line of `avoozl help`: the group it is listed under, the usage,
// what it does, and (`first`) the shorter wording the overview shows.
export const help = (group, usage, about = "", first = null) => ({
  group,
  usage,
  about,
  first,
});
