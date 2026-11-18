# Landing queue page under Dashboards (44.5)

Dashboards gains a Landing queue page next to CI (R92.7, design §4.27). It
reads `landing.queue`, which uses Avoozl's store only: the landing queue, the
deliveries, open line stops and the 44.1 link sets. One card per repository
and base. Queued items come first, in landing order. Tasks that left the
queue and will come back (a conflict or failed checks sent to the worker, a
protected path hold) follow. Each row shows its hold reason, its PR with a
check dot, and its branch. Refresh redraws from the store; no GitHub call
(`src/app/test/landing-queue-view.test.mjs`).

`after/`: the full app shell with the host CSS, 1280 and 390, light and
dark, busy (`&landing=1`, `landing-fixture.ts`) and empty. The page is new,
so there is no before shot.

    cd kirocrew-app/ui
    AVOOZL_HOST_CSS=<host css> node test/browser/landing-queue-shots.mjs <out>
