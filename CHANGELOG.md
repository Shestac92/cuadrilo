# Changelog

All notable changes to Cuadrilo are written here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- More celebrations when an exercise is all correct: besides the confetti, fireworks, a comic-book word, sparkles, balloons, falling glitter and a disco ball, one picked at random each time (never the same twice in a row). All pure CSS. The teacher sees it too on the class page when the student they watch completes an exercise.
- Cuadrilo Demo App (`desktop/`, in progress): the platform on a teacher's own computer, in English, with a demo database and one window with the teacher and a student side by side, to play a live class alone. A toolbar switches the layout and the student and resets the demo. Packages for macOS (Apple silicon, Intel) and Windows (x64), built and started once in CI on every release tag and attached to its GitHub release. The landing page and the README lead with its download. Its demo lesson, «Home, sweet home» (English, A2), has every kind of block.
- The server can serve the built client itself (`CLIENT_DIR`) and listen on one address only (`HOST`).

### Changed

- When a teacher changes the platform's theme, it changes at once on every open page, the students' too, without a reload.
- The notice for browsers that are too old now asks the browser for its engine, version and system instead of waiting for the page to load, so people on a slow connection no longer see it by mistake. On iPhone and iPad it asks to update iOS.

## [0.1.0] - 2026-11-24

First public release: lesson editor with 21 kinds of blocks, live classes, homework, the translator, the MCP server for AI assistants, and the guide for installing on a server.

[Unreleased]: https://github.com/Shestac92/cuadrilo/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Shestac92/cuadrilo/releases/tag/v0.1.0
