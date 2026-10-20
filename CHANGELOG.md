# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- One device per Blocky server (up to three): a blocking switch (off pauses the
  blocking for a configurable time, or until turned back on) and, with the
  Prometheus endpoint of Blocky, the DNS queries and blocked queries of the
  last hour, the share blocked, the cache hit rate, the blocked domains and the
  version.
- A "Blocky" dashboard widget: figures of the last hour, state of each server,
  groups of a partial pause, and Pause 5 min, Pause 30 min, Pause… (Gladys
  5.2.0) and Resume buttons.
- Scene triggers: blocking paused (with its length and groups), blocking
  resumed (end of the pause, Gladys or elsewhere), Blocky no longer answers,
  Blocky answers again.
- Scene actions: pause the blocking for some groups or all, resume it, refresh
  the lists, flush the DNS cache, and read the statistics into a sentence.
- A "Test the connection" button, and texts in English, French, German and
  Spanish.

[Unreleased]: https://github.com/guim31/gladys-blocky/commits/main
