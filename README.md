# gizz

Public deployment of the **Gizz / Patchlab modular synthesizer simulator**.

**Play:** https://r31ghost.github.io/gizz/

**Independent cycles:** https://r31ghost.github.io/gizz/voice.html?lesson=7

The app is a static browser application. Choose a lesson, load a sample, enable audio and patch modules together. MIDI support depends on your browser/device.

Development, tests, requirements, plans, module specs and release notes are maintained in the private `R31Ghost/gizz-dev` repository. This repository contains the reviewed runtime, its checksum/source manifest in `release.json`, and the GitHub Pages workflow.

Updates to `main` deploy through GitHub's managed Pages build. In Settings → Pages, the source is **Deploy from a branch**, branch **main**, folder **/ (root)**. `.nojekyll` preserves the static app without a Jekyll build. `Verify Gizz publication` separately checks that the exact release is publicly served. Release files are prepared using `scripts/prepare-release.mjs` in the development repository; make code changes there before releasing here.

The manual **Request clean Pages build** workflow can request another managed build. **Publish Gizz with Actions (optional)** is retained only for a deliberate future switch to the GitHub Actions source; it does not run on pushes or compete with the managed publisher.

Browser-local saves belong to each site's origin. Export patches from the previous site, then import them here to carry them across. Controller permission and preferences must be set up for this origin.
