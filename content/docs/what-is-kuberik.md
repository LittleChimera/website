---
title: "What is Kuberik"
weight: 3
---

Kuberik is a Kubernetes-native delivery orchestrator. It takes over **after** your CI publishes a new version — a container image or rendered manifests — and handles everything that happens next: safe rollout, verification, and promotion.

## You Release, Kuberik Delivers

| | Owner | Example |
|---|---|---|
| **When to release** | You (developer/CI) | Push a git tag, merge to main |
| **How to deliver** | Kuberik | Rollout, verify health, promote across environments |

Your CI pipeline publishes a tagged artifact: the application image itself, or the rendered manifests for an environment pushed as an OCI artifact. Kuberik detects the new tag and orchestrates the delivery — gating, deploying, verifying, and promoting — without any further input from you. See [Propagation Modes](/docs/concepts/propagation/) for how the two modes compare.

Kuberik does not build images, decide when to release, or replace your GitOps tool. It works alongside FluxCD at the application delivery layer.

## How It Works

{{% steps %}}

### Publish

Your CI publishes a tagged image or manifest artifact to a container registry.

### Detect

FluxCD detects the new tag via `ImagePolicy`.

### Gate

Kuberik creates a release candidate and evaluates gates.

### Deploy

Kuberik writes the version into the Kustomization, or moves the OCIRepository tag to the new manifests.

### Verify

Health checks verify the deployment during bake time.

### Complete

The release is marked as succeeded or failed.

{{% /steps %}}

![The dashboard home: what is deploying right now, what a rule is holding, and your merged changes with how far each one got](/screenshots/dashboard/home.png)

For a detailed component breakdown, see [Architecture](/docs/concepts/architecture/).

## Next Steps

{{< cards >}}
  {{< card title="Install Kuberik" link="/docs/installation/" icon="download" subtitle="Set up the controller" >}}
  {{< card title="Getting Started" link="/docs/getting-started/" icon="academic-cap" subtitle="Deploy your first app" >}}
  {{< card title="Publishing Releases" link="/docs/guides/publishing-releases/" icon="upload" subtitle="Set up your CI pipeline" >}}
{{< /cards >}}
