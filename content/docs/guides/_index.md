---
title: "Guides"
weight: 5
sidebar:
  open: true
---

Step-by-step guides for common Kuberik workflows.

## Getting Started

{{< cards >}}
  {{< card title="Publishing Releases" link="publishing-releases/" icon="upload" subtitle="Build and tag images for Kuberik to pick up" >}}
{{< /cards >}}

## Deployment Safety

{{< cards >}}
  {{< card title="Health Checks" link="health-checks/" icon="shield-check" subtitle="Verify deployments during bake time" >}}
  {{< card title="Manual Approvals" link="manual-approvals/" icon="shield-check" subtitle="Require human sign-off" >}}
  {{< card title="Deployment Schedules" link="schedules/" icon="clock" subtitle="Control deployment time windows" >}}
{{< /cards >}}

## Advanced Workflows

{{< cards >}}
  {{< card title="Automated Promotion" link="cross-environment-rollout/" icon="switch-horizontal" subtitle="Staging → Production pipelines" >}}
  {{< card title="Service Dependencies" link="service-dependencies/" icon="share" subtitle="Hold a service until the one it needs has shipped" >}}
  {{< card title="Canary Rollouts" link="canary-rollouts/" icon="chart-bar" subtitle="Progressive delivery with OpenKruise" >}}
{{< /cards >}}

## Observability

{{< cards >}}
  {{< card title="Monitoring Rollouts" link="monitoring/" icon="chart-bar" subtitle="Track history with kube-state-metrics" >}}
{{< /cards >}}
