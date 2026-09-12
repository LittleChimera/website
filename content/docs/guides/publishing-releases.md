---
title: "Publishing Releases"
weight: 5
---

Kuberik orchestrates the delivery of your releases — but **you** decide when and how to release. A release is triggered when a new container image tag appears in the registry. Your CI pipeline controls that.

This guide shows how to publish tagged container images that Kuberik can pick up automatically.

![A published build in the dashboard: the newest tag, the repository it came from, and how far it has been promoted](/screenshots/dashboard/app.png)

## GitHub Workflow

Build your Dockerfile, tag it, and push it to a registry (e.g., GHCR).

### Strategy 1: Timestamp (Recommended)

Triggers on every commit to `main`, producing a new image tag that Kuberik rolls out immediately.
Uses an `alphabetical` (ascending) policy in Flux.

```yaml {filename=".github/workflows/build-main.yaml"}
name: Build

on:
  push:
    branches:
      - "main"

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Log in to the Container registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        env:
          # Annotate the image index, not just the per-arch manifests
          DOCKER_METADATA_ANNOTATIONS_LEVELS: index
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            # Tag with: main-<sha>-<commit timestamp>
            type=raw,value=main-{{sha}}-{{commit_date 'X'}}
            type=raw,value=latest
          # Set OCI annotations on the manifest index
          annotations: |
            org.opencontainers.image.source=${{ github.event.repository.html_url }}
            org.opencontainers.image.revision=${{ github.sha }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          annotations: ${{ steps.meta.outputs.annotations }}
```

### Strategy 2: Semantic Versioning

Triggers rollouts via **git tags** (e.g., `v1.0.0`). You control the release cadence explicitly.

```yaml {filename=".github/workflows/release.yaml"}
name: Release

on:
  push:
    tags:
      - "v*"

# ... (env and setup steps same as above) ...

      - name: Extract metadata (tags, labels)
        id: meta
        uses: docker/metadata-action@v5
        env:
          # Annotate the image index, not just the per-arch manifests
          DOCKER_METADATA_ANNOTATIONS_LEVELS: index
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
          # Set OCI annotations on the manifest index
          annotations: |
            org.opencontainers.image.source=${{ github.event.repository.html_url }}
            org.opencontainers.image.revision=${{ github.sha }}

# ... (build step same as above) ...
```

## Publish Rendered Manifests

When your rollout delivers Kubernetes manifests instead of an application image, render each environment overlay and push it as an OCI artifact with the Flux CLI. Kuberik picks up new artifact tags the same way it picks up image tags.

`flux push artifact` sets the `org.opencontainers.image.source` and `org.opencontainers.image.revision` annotations from `--source` and `--revision` — keep `--revision` set to the commit SHA so Kuberik can link the release back to your repository.

```yaml {filename=".github/workflows/manifests-release.yaml"}
name: Manifests Release

on:
  push:
    branches:
      - "main"

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Resolve version
        id: v
        run: |
          # Tag with: main-<sha>-<commit timestamp>
          echo "version=main-${GITHUB_SHA::7}-$(git log -1 --format=%ct)" >> "$GITHUB_OUTPUT"

      - name: Install flux CLI
        uses: fluxcd/flux2/action@main

      - name: Log in to the Container registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Render and push manifests
        env:
          VERSION: ${{ steps.v.outputs.version }}
        run: |
          set -euo pipefail
          image="${IMAGE_NAME,,}" # ghcr.io requires a lowercase path
          for env in dev staging prod; do
            out="$(mktemp -d)"
            kustomize build "k8s/envs/${env}" -o "$out"
            flux push artifact \
              "oci://${REGISTRY}/${image}/${env}/manifests:${VERSION}" \
              --path "$out" \
              --source="${{ github.event.repository.html_url }}" \
              --revision="${{ github.sha }}"
          done
```

Point a Flux `OCIRepository` at each environment's artifact and reuse the timestamp policy below to select versions.

## Matching Policies

Ensure your Flux `ImagePolicy` matches the tagging strategy used above.

**For Timestamp (Recommended):**
```yaml {filename="policy-timestamp.yaml"}
spec:
  policy:
    alphabetical:
      order: asc # Kuberik picks the last one (highest timestamp)
  filterTags:
    pattern: '^main-[a-f0-9]+-(?P<ts>[0-9]+)'
    extract: '$ts'
```

**For SemVer:**
```yaml {filename="policy-semver.yaml"}
spec:
  policy:
    semver:
      range: ">=1.0.0"
```
