# Changelog

## [0.2.1](https://github.com/vdmemory/planning-poker/compare/v0.2.0...v0.2.1) (2026-06-09)


### Performance

* preload reaction Lottie chunk + JSON when panel mounts ([#43](https://github.com/vdmemory/planning-poker/issues/43)) ([#44](https://github.com/vdmemory/planning-poker/issues/44)) ([2c9ea1e](https://github.com/vdmemory/planning-poker/commit/2c9ea1e3ee6f827fbcbb251488d68216ece01555))


### CI / Tooling

* replace dev→main promote flow with feature→main directly ([#41](https://github.com/vdmemory/planning-poker/issues/41)) ([95e4541](https://github.com/vdmemory/planning-poker/commit/95e45417e2441e736820c11ce61c36f9c3f0511b))

## [0.2.0](https://github.com/vdmemory/planning-poker/compare/v0.1.0...v0.2.0) (2026-06-07)


### Features

* 5 improvements — deck cleanup, settings simplification, cursor fix, spectator toggle, leave room ([9a07e4f](https://github.com/vdmemory/planning-poker/commit/9a07e4fc319c9d9fc7e05f0a072c73c4036036d0))
* add Modified Fibonacci, Powers of 2, and Sequential deck types ([0046727](https://github.com/vdmemory/planning-poker/commit/00467272e2fd131dae8599da9b3c78692a845e84))
* card back style is now a room-level setting (facilitator only) ([f90615d](https://github.com/vdmemory/planning-poker/commit/f90615d59c3bdf22552c029ad6c92e7a3a478ee7))
* collaborative real-time drawing on screen ([b6f7712](https://github.com/vdmemory/planning-poker/commit/b6f77126fd2d7e5e0e832f561b302eec793424c3))
* hide voting system picker for non-facilitators in Game Settings ([3357840](https://github.com/vdmemory/planning-poker/commit/3357840c469840a20d7266268f863a223c74c255))
* poker table layout, light theme, avatar sync, issue fixes ([eda0017](https://github.com/vdmemory/planning-poker/commit/eda00172067498ac758cc26bf6392a8a3985fe7f))
* revote after reveal with auto recalculated stats and issue estimate ([c6c2404](https://github.com/vdmemory/planning-poker/commit/c6c240442ff78c031e697b1980780c7507c7031b))
* show participant name above card instead of letter-avatar ([#7](https://github.com/vdmemory/planning-poker/issues/7)) ([7ee0a4f](https://github.com/vdmemory/planning-poker/commit/7ee0a4f90a89c2085c935efe5776336b6607ad87))
* show participant name above card instead of letter-avatar ([#7](https://github.com/vdmemory/planning-poker/issues/7)) ([18b973e](https://github.com/vdmemory/planning-poker/commit/18b973ed4b236658992c115acf6df4282ad71c05))
* visual deck picker with card previews ([97e7d7f](https://github.com/vdmemory/planning-poker/commit/97e7d7fd39f504c0b7b4199d0411bd39039c3128))


### Bug Fixes

* add runtime.txt to pin Python 3.12 on Render ([0035980](https://github.com/vdmemory/planning-poker/commit/0035980a171a35879a5941209edb03bc0aac5596))
* gate reset button by canReveal, not isFacilitator ([caf72d0](https://github.com/vdmemory/planning-poker/commit/caf72d0dde4ad925e668539d4fed76ce3576d08b))
* hide card deck after reveal for all players including facilitator ([8cfecc2](https://github.com/vdmemory/planning-poker/commit/8cfecc2c85a6a3314bf5279e8ecfc90033e5ad25))
* pin Python 3.12 for Render deployment ([d5be4d5](https://github.com/vdmemory/planning-poker/commit/d5be4d51ba1c245929fc173b4b6ef0cf4621b335))
* relax pydantic version to support Python 3.14 on Render ([d455e06](https://github.com/vdmemory/planning-poker/commit/d455e06b2b0f11a789957a7a7d6263511c4156a4))
* replace all hardcoded hex colors with CSS vars for proper light theme ([c37ef42](https://github.com/vdmemory/planning-poker/commit/c37ef426625aae53c710233aaa75690c462fa9e5))
* use dynamic PORT in Dockerfile for Railway ([d7969ea](https://github.com/vdmemory/planning-poker/commit/d7969ea723f9b952fd4272f3eb3bb7dbbb1cf69a))
* wrap uvicorn start in sh -c for PORT expansion on Railway ([dd8040c](https://github.com/vdmemory/planning-poker/commit/dd8040cc2751863fb15e218de0138a8332a922e4))


### Documentation

* note that main has branch protection (CI checks required) ([c8b15b6](https://github.com/vdmemory/planning-poker/commit/c8b15b6b77542b62eb00ad2d8d1900e8ef5c60f1))


### CI / Tooling

* add pytest-timeout to requirements-dev ([59ed70e](https://github.com/vdmemory/planning-poker/commit/59ed70e356f5940ae699a16fd46634cdc4e58916))
* add release-please for automated changelog and tagged releases ([5c1830e](https://github.com/vdmemory/planning-poker/commit/5c1830e34892daac948d0488a06a36eb57629172))
* add release-please for automated changelog and tagged releases ([f32ddba](https://github.com/vdmemory/planning-poker/commit/f32ddba790063fe031d26038ccde17f1ab43f91d))
* auto-triage workflow for new issues via GitHub Models ([d3fa212](https://github.com/vdmemory/planning-poker/commit/d3fa2122f012288bd0bd509b5b067ba46def8e71))
* GitHub Actions workflow for pytest + Playwright ([f131327](https://github.com/vdmemory/planning-poker/commit/f13132769930cca0519be15efd8200afe7e18f5c))
* trigger Railway redeploy ([773f293](https://github.com/vdmemory/planning-poker/commit/773f293d22eb3c3edc8ba0e4f706fcf49e47a9c3))

## Changelog

All notable changes are tracked here. From version 0.1.0 onwards the file is
maintained automatically by [release-please](https://github.com/googleapis/release-please),
driven by [Conventional Commits](https://www.conventionalcommits.org/).

See [docs/RELEASES.md](docs/RELEASES.md) for the release flow.
