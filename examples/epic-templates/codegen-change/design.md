# Design: large generated change

Status: Draft

Order: change the generator and its tests; regenerate one sample and review
the diff; regenerate the rest in batches; remove the old output. Replace
`<generate command>` and `<compare command>` in each regeneration task with the
real commands. A batch is small enough to review in one pull request.
