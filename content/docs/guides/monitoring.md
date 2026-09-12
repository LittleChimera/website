---
title: "Monitoring Rollouts"
weight: 6
---

Track deployment history and rollout status using kube-state-metrics.

## Overview

Kuberik exposes rollout status through standard Kubernetes resource fields. Use [kube-state-metrics](https://github.com/kubernetes/kube-state-metrics) custom resource configuration to expose these fields as Prometheus metrics.

The dashboard reads the same fields: its Activity page is the deployment feed across every cluster, and each rollout page shows the bake and health-check state the metrics below export.

![The Activity page: every deployment across clusters, grouped by day, with failures called out](/screenshots/dashboard/activity.png)

---

## Configure kube-state-metrics

Add a custom resource configuration for Rollout resources.

### Helm Values

```yaml {filename="values.yaml"}
customResourceState:
  enabled: true
  config:
    kind: CustomResourceStateMetrics
    spec:
      resources:
        - groupVersionKind:
            group: kuberik.com
            version: v1alpha1
            kind: Rollout
          metricNamePrefix: kuberik
          labelsFromPath:
            namespace: [metadata, namespace]
            name: [metadata, name]
          metrics:
            # Latest deployment info
            - name: rollout_latest_deployment_info
              help: "Information about the latest deployment"
              each:
                type: Info
                info:
                  labelsFromPath:
                    version: [status, history, "0", version, version]
                    tag: [status, history, "0", version, tag]
                    revision: [status, history, "0", version, revision]
                    bake_status: [status, history, "0", bakeStatus]
                    message: [status, history, "0", message]

            # Latest deployment timestamp
            - name: rollout_latest_deployment_timestamp
              help: "Timestamp of the latest deployment"
              each:
                type: Gauge
                gauge:
                  path: [status, history, "0", timestamp]

            # Bake start time
            - name: rollout_bake_start_timestamp
              help: "When bake period started for the latest deployment"
              each:
                type: Gauge
                gauge:
                  path: [status, history, "0", bakeStartTime]

            # Bake end time
            - name: rollout_bake_end_timestamp
              help: "When bake period ended for the latest deployment"
              each:
                type: Gauge
                gauge:
                  path: [status, history, "0", bakeEndTime]

            # Bake status as a numeric gauge
            - name: rollout_bake_status
              help: "Bake status (1=Deploying, 2=InProgress, 3=Succeeded, 4=Failed, 5=Cancelled)"
              each:
                type: StateSet
                stateSet:
                  path: [status, history, "0", bakeStatus]
                  list:
                    - Deploying
                    - InProgress
                    - Succeeded
                    - Failed
                    - Cancelled

            # Available releases count
            - name: rollout_available_releases_total
              help: "Total number of available releases"
              each:
                type: Gauge
                gauge:
                  path: [status, availableReleases]
                  valueFrom: [length]

            # Gates passing status
            - name: rollout_gates_passing
              help: "Whether all gates are passing (1=true, 0=false)"
              each:
                type: Gauge
                gauge:
                  path: [status, conditions]
                  valueFrom: [status]
                  labelFromKey: type
                  labelsFromPath:
                    reason: [reason]
```

Apply the configuration:

```bash
helm upgrade kube-state-metrics prometheus-community/kube-state-metrics \
  -f values.yaml \
  --namespace monitoring
```

---

## Metrics Reference

### kuberik_rollout_latest_deployment_info

Labels with current deployment details:

| Label | Description | Example |
|-------|-------------|---------|
| `version` | Short version hash | `3804dd0` |
| `tag` | Full image tag | `main-1769981877-3804dd0...` |
| `revision` | Git commit SHA | `3804dd0eb871592577d23...` |
| `bake_status` | Current bake state | `Succeeded`, `InProgress`, `Failed` |
| `message` | Deployment message | `Force deploy`, `Automatic deployment` |

### kuberik_rollout_latest_deployment_timestamp

Unix timestamp of when the deployment was triggered.

### kuberik_rollout_bake_start_timestamp

Unix timestamp of when bake monitoring started. This is when health checks first passed.

### kuberik_rollout_bake_end_timestamp

Unix timestamp of when bake completed. Subtract from `bake_start_timestamp` to get bake duration.

### kuberik_rollout_bake_status

StateSet metric with one label per bake state. Value is `1` for the current state, `0` for others.

```promql
kuberik_rollout_bake_status{kuberik_rollout_bake_status="Succeeded"} == 1
```

### kuberik_rollout_available_releases_total

Number of releases available in the image repository.

---

## Example Queries

### Currently deploying rollouts

```promql
kuberik_rollout_bake_status{kuberik_rollout_bake_status="InProgress"} == 1
```

### Failed deployments in the last hour

```promql
kuberik_rollout_bake_status{kuberik_rollout_bake_status="Failed"} == 1
  and on(namespace, name)
  (time() - kuberik_rollout_bake_end_timestamp < 3600)
```

### Deployment frequency by rollout

```promql
increase(kuberik_rollout_latest_deployment_timestamp[24h])
```

### Average bake duration

```promql
avg(
  kuberik_rollout_bake_end_timestamp - kuberik_rollout_bake_start_timestamp
) by (namespace, name)
```

### Rollouts with blocked gates

```promql
kuberik_rollout_gates_passing{type="GatesPassing", status="False"} == 1
```

---

## Grafana Dashboard

Create alerts and visualizations for deployment health.

### Deployment Timeline Panel

```json
{
  "type": "state-timeline",
  "targets": [{
    "expr": "kuberik_rollout_bake_status",
    "legendFormat": "{{namespace}}/{{name}}"
  }]
}
```

### Current Deployments Table

```json
{
  "type": "table",
  "targets": [{
    "expr": "kuberik_rollout_latest_deployment_info",
    "format": "table",
    "instant": true
  }],
  "transformations": [{
    "id": "labelsToFields"
  }]
}
```

---

## Alerting

### Alert on failed deployments

```yaml {filename="prometheus-rules.yaml"}
groups:
  - name: kuberik
    rules:
      - alert: RolloutBakeFailed
        expr: kuberik_rollout_bake_status{kuberik_rollout_bake_status="Failed"} == 1
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Rollout {{ $labels.namespace }}/{{ $labels.name }} failed bake"
          description: "Deployment failed health checks during bake time."

      - alert: RolloutBakeStuck
        expr: |
          kuberik_rollout_bake_status{kuberik_rollout_bake_status="InProgress"} == 1
            and on(namespace, name)
          (time() - kuberik_rollout_bake_start_timestamp > 1800)
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Rollout {{ $labels.namespace }}/{{ $labels.name }} bake taking too long"
          description: "Bake has been in progress for over 30 minutes."

      - alert: RolloutGatesBlocked
        expr: |
          kuberik_rollout_gates_passing{type="GatesPassing"} == 0
            and on(namespace, name)
          count(kuberik_rollout_available_releases_total > 0)
        for: 1h
        labels:
          severity: info
        annotations:
          summary: "Rollout {{ $labels.namespace }}/{{ $labels.name }} blocked by gates"
          description: "Gates have been blocking deployment for over 1 hour."
```

---

## Next Steps

{{< cards >}}
  {{< card title="Health Checks" link="/docs/guides/health-checks/" icon="shield-check" subtitle="Configure deployment verification" >}}
  {{< card title="Datadog Integration" link="/docs/integrations/datadog/" icon="chart-bar" subtitle="Metrics-based health checks" >}}
{{< /cards >}}
