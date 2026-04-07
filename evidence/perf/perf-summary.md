# Performance Summary (Version 0)

| Endpoint | Target p95 | Measured p95 | Result | Notes |
|---|---:|---:|---|---|
| /api/focus/status | <= 50 ms | 20.529 ms | PASS | localhost |
| /api/focus/history | <= 100 ms | 16.392 ms | PASS | localhost |
| /api/usage/today | <= 150 ms | 17.159 ms | PASS | localhost |

## Mitigation Plan (if any target fails)
- Endpoint:
- Observed issue:
- Suspected root cause:
- Planned fix:
- ETA:

## UI Update Latency
- p50: 16.7 ms
- p95: 18 ms
- target: <= 200 ms
- result: PASS

## Timer Drift
- max absolute drift: 0 s
- average absolute drift: 0 s
- target: <= 2 s
- result: PASS

## Backend Resource Usage
- average CPU: 0% (target < 5%)
- peak CPU: 0% (target < 20%)
- peak memory: 139.801 MB (target <= 300 MB)
- result: PASS
