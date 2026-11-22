# Submission implementation checklist

Repository inspected on 22 November 2026. The existing client contained a seeded SQLite asset, Expo Router root, one database count screen, seed tests and completed PHP source audits. It contained no business services or business screens. The original PHP source was left untouched.

- [x] Preserve the Expo/TypeScript/SQLite foundation and existing Android package ID.
- [x] Verify the demo bcrypt password and implement local officer/outlet login.
- [x] Add scoped dashboard, MIS list/add/edit/delete/CSV import/export, one-item order draft/submit/decision, pending submit/decision, local summary and activity views.
- [x] Use SQLite transactions for new multi-table actions; add local pending/history tables at startup.
- [x] Run source inventory, seed tests, TypeScript, offline scan and Android bundle export.
- [ ] Complete the full audited portal workflow: multi-line order editing, stock/product management, document handling and returns, account management, MIS workbook import and bulk deletion.
- [ ] Perform Android install, airplane-mode startup and restart persistence tests on a device.
- [ ] Produce and inspect a signed APK and merged Android manifest.
