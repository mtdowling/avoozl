// Which trunk heads an integrator train pushed, and whether the train was
// validated (landing-trains LT8.7). Stop the line counts only validated
// trains' heads: a head a train pushed whose validation has not passed is not
// judged. Reads the store only.
export const unvalidatedTrainHead = (store, projectId, head) => {
  let trains;
  try {
    trains = store.list("landing_trains");
  } catch {
    return false;
  }
  return trains.some(
    (t) =>
      t.projectId === projectId && t.pushed === head && t.validated !== true,
  );
};
