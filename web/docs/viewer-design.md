# Viewer design specs — index

The 3D viewer was built up across a numbered series of design specs. The specs
themselves live outside the repo; this file is a thin map from each spec to
where its feature lives in the codebase, so anyone reading the source can
cross-reference without inline `Spec NN` comments rotting when the numbers shift.

Top-level paths only — file/line specifics belong in the source.

| Spec | Title                                      | Lives in                                                                                                                                                                                          |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00   | Domain types + IDB scenes & annotations    | `web/composables/useIdb/`, `web/lib/viewer/types.ts`                                                                                                                                              |
| 01   | ViewerCore architecture                    | `web/lib/viewer/ViewerCore.ts`, `web/lib/viewer/modules/`                                                                                                                                         |
| 02   | ObjectGraph loader pipeline                | `web/lib/viewer/modules/` (BatchLoader, ObjectGraph)                                                                                                                                              |
| 03   | Input controls (OnShape mapping)           | `web/lib/viewer/modules/CameraRig.ts`, `InputRouter`                                                                                                                                              |
| 04   | Camera rig + view cube                     | `web/lib/viewer/modules/CameraRig.ts`, `web/components/viewer/ViewCube*`                                                                                                                          |
| 05   | Objects panel                              | `web/components/viewer/ObjectsPanel*`                                                                                                                                                             |
| 06   | Scenes system                              | `web/composables/useScenes.ts`, `useSceneAuthor.ts`, `web/lib/scene/`                                                                                                                             |
| 06b  | TransformControls gizmo + interaction lock | `web/lib/viewer/modules/` (gizmo group + InputRouter)                                                                                                                                             |
| 07   | Annotations framework                      | `web/composables/useAnnotations.ts`, `useAnnotationAuthor.ts`, `web/lib/viewer/annotations/projector.ts`, `web/lib/viewer/modules/LeaderManager.ts`, `web/components/viewer/AnnotationLabels.vue` |
| 08   | Callout annotations                        | `web/lib/viewer/annotations/callout.ts`, `web/components/viewer/CalloutLabel*`                                                                                                                    |
| 08b  | Snap targets + multi-line callouts         | `web/lib/viewer/modules/SnapDetector.ts`, callout label changes                                                                                                                                   |
| 09   | Linear dimension annotation                | `web/lib/viewer/annotations/dimension.ts`, `web/components/viewer/DimensionLabel*`, dimension hooks in `projector.ts`                                                                             |

## Notes

- Source comments describe behaviour without naming spec numbers; if you need
  the historical context, `git log --oneline main..` on the relevant feature
  branch is the canonical record.
- New specs should add a row here rather than seeding inline `Spec NN` comments.
