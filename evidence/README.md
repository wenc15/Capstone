# Evidence Folder Guide

This directory stores reproducible validation and verification artifacts.

## Expected artifacts
- `backend-tests.log`: backend automated test output
- `manual-api/`: screenshots or exported responses from REST/Swagger checks
- `perf/perf-metrics.csv`: raw latency measurements
- `perf/perf-summary.md`: target vs measured summary
- `trace/`: optional Playwright traces and screenshots

Do not commit sensitive data or local machine credentials.
