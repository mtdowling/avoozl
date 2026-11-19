# mb-p1 receipt: merge batches on a scratch repository

Run 2026-11-18T22:52:22.908Z on linux with git version 2.50.1. The check sleeps 3 s, then fails on `bad.txt`, on `pair-a.txt` with `pair-b.txt`, and the first time it sees `flaky.txt`. Twelve tasks, two specs: t3 breaks it alone, t6 is flaky, t8 and t9 break it only together.

| Step | Limit before | Left the queue | Queue after | Limit after | Seconds | Remote refs     |
| ---- | ------------ | -------------- | ----------- | ----------- | ------- | --------------- |
| 1    | 1            | 1              | 11          | 2           | 3.3     | refs/heads/main |
| 2    | 2            | 2              | 9           | 3           | 3.4     | refs/heads/main |
| 3    | 3            | 2              | 7           | 1           | 19.1    | refs/heads/main |
| 4    | 1            | 1              | 6           | 2           | 3.3     | refs/heads/main |
| 5    | 2            | 2              | 4           | 3           | 6.5     | refs/heads/main |
| 6    | 3            | 2              | 2           | 1           | 19.1    | refs/heads/main |
| 7    | 1            | 1              | 1           | 2           | 3.3     | refs/heads/main |
| 8    | 2            | 1              | 0           | 2           | 3.3     | refs/heads/main |

Landed (10): t1, t2, t4, t5, t6, t7, t9, t10, t11, t12.
Sent back (2): t3 (decision), t8 (decision).

- OBSERVED: (1) good tasks landed: true
- OBSERVED: (1) the flaky task t6 landed: true
- OBSERVED: (1) the culprit t3 went back: true
- OBSERVED: (1) queue order was t12, t11, t10, t9, t8, t7, t6, t5, t4, t3, t2, t1
- OBSERVED: (1) the later of the pair, t8, went back and the earlier, t9, landed: true
- OBSERVED: (2) the limit started at 1 and reached 3; limits after each step: 2, 3, 1, 2, 3, 1, 2, 2
- OBSERVED: (2) no ref but the base on the remote after any step: true
