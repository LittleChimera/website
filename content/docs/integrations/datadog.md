---
title: "Datadog Integration"
weight: 3
---

Use Datadog monitors as health check sources for your rollouts.

## Overview

Kuberik can verify deployments by checking **DatadogMonitor** resource status:

```mermaid
flowchart LR
    %% Styles
    classDef datadog fill:#632CA6,stroke:#fff,stroke-width:2px,color:#fff
    classDef kuberik fill:#4B4BE8,stroke:#fff,stroke-width:2px,color:#fff
    classDef crd fill:#2D7E9D,stroke:#fff,stroke-width:2px,color:#fff
    classDef boundary fill:#F3F4F6,stroke:#D1D5DB,stroke-width:1px,color:#374151,stroke-dasharray: 5 5

    subgraph Datadog
        MON[Monitor Status]:::datadog
    end

    subgraph Cluster
        direction TB
        DDM[DatadogMonitor CRD]:::crd

        subgraph Kuberik
            HC[HealthCheck]:::kuberik
            RO[Rollout]:::kuberik
        end
    end

    MON --> DDM
    DDM --> HC
    HC --> RO

    class Kuberik boundary
```

If a Datadog monitor is alerting during bake time, the rollout is marked failed.

---



## Setup

### Create DatadogMonitor

Define a monitor that checks your application health:

```yaml {filename="datadog-monitor.yaml"}
apiVersion: datadoghq.com/v1alpha1
kind: DatadogMonitor
metadata:
  name: my-app-error-rate
  namespace: default
  annotations:
    # Enable as Kuberik health check
    kuberik.com/health-check: "true"
  labels:
    # Used by Rollout to select this check
    app: my-app
spec:
  name: "My App Error Rate"
  type: metric alert
  query: "avg(last_5m):sum:my_app.errors{env:production} > 10"
  message: "Error rate too high"
  tags:
    - "env:production"
    - "team:platform"
```

Apply it:
```bash
kubectl apply -f datadog-monitor.yaml
```

### Connect to Rollout

Configure your Rollout to select Datadog monitors:

```yaml {filename="rollout.yaml"}
apiVersion: kuberik.com/v1alpha1
kind: Rollout
metadata:
  name: my-app
spec:
  releasesImagePolicy:
    name: my-app
  versionHistoryLimit: 5
  bakeTime: 10m

  # Select monitors with matching labels
  healthCheckSelector:
    selector:
      matchLabels:
        app: my-app
```

---

## How It Works

During bake time:

1. Kuberik finds DatadogMonitors with `kuberik.com/health-check: "true"`
2. Filters by `healthCheckSelector` labels
3. Checks each monitor's status
4. If any monitor is in `Alert` state → rollout fails
5. If all monitors are `OK` → rollout proceeds

![DatadogMonitors as health checks on the rollout page, with the APM service linked next to them](/screenshots/dashboard/overview-prod.png)

---

## Monitor Types

Kuberik supports all Datadog monitor types:

| Type | Use Case |
|------|----------|
| `metric alert` | Error rates, latency thresholds |
| `service check` | Service availability |
| `event alert` | Error log patterns |
| `process alert` | Process health |

### Example: Latency Monitor

```yaml {filename="error-rate-monitor.yaml"}
spec:
  name: "P99 Latency"
  type: metric alert
  query: "avg(last_5m):percentile(my_app.request.latency{env:production}, 0.99) > 500"
  message: "P99 latency exceeds 500ms"
```

### Example: Error Rate Monitor

```yaml
spec:
  name: "Error Rate"
  type: metric alert
  query: "sum(last_5m):sum:my_app.errors{env:production} / sum:my_app.requests{env:production} > 0.01"
  message: "Error rate exceeds 1%"
```

---

## Check Datadog Without the Operator

Skip the Datadog Operator and `DatadogMonitor` CRD entirely. The `datadog-api` class polls the Datadog API directly for an existing monitor's status.

Create a secret with your Datadog credentials:

```bash
kubectl create secret generic datadog-credentials \
  --from-literal=api-key=YOUR_API_KEY \
  --from-literal=app-key=YOUR_APP_KEY
```

Create the HealthCheck, pointing at the monitor by ID:

```yaml {filename="healthcheck-datadog-api.yaml"}
apiVersion: kuberik.com/v1alpha1
kind: HealthCheck
metadata:
  name: my-app-error-rate
  namespace: production
  annotations:
    healthcheck.kuberik.com/datadog-monitor-id: "12345678"
    healthcheck.kuberik.com/datadog-credentials-secret: "datadog-credentials"
    # healthcheck.kuberik.com/datadog-site: "datadoghq.eu"
    # healthcheck.kuberik.com/requeue-interval: "60s"
spec:
  class: datadog-api
```

```bash
kubectl apply -f healthcheck-datadog-api.yaml
```

`OK` maps to `Healthy`, `Alert` maps to `Unhealthy`, and `Warn`/`NoData`/`Skipped`/`Ignored` map to `Pending`.

Supported `datadog-site` values: `datadoghq.com` (default), `datadoghq.eu`, `us3.datadoghq.com`, `us5.datadoghq.com`, `ap1.datadoghq.com`.

---

## Block Rollouts During Incidents

The `datadog-incidents` class goes unhealthy while any open Datadog incident matches a set of labels - independent of any specific monitor. Use it to block rollouts during an active incident.

```yaml {filename="healthcheck-datadog-incidents.yaml"}
apiVersion: kuberik.com/v1alpha1
kind: HealthCheck
metadata:
  name: payments-incidents-check
  namespace: production
  annotations:
    healthcheck.kuberik.com/datadog-incident-labels: "team:payments,env:prod"
    healthcheck.kuberik.com/datadog-credentials-secret: "datadog-credentials"
spec:
  class: datadog-incidents
```

```bash
kubectl apply -f healthcheck-datadog-incidents.yaml
```

The controller searches for non-resolved incidents (`-state:resolved`) matching every given label. Any match flips the HealthCheck to `Unhealthy`.

---

## Best Practices

### Use Bake-Specific Monitors

Create monitors specifically for deployment verification:

```yaml
metadata:
  name: my-app-deploy-check
  annotations:
    kuberik.com/health-check: "true"
spec:
  query: "avg(last_2m):avg:my_app.startup.success{version:${version}} < 0.99"
```

### Appropriate Thresholds

- Set thresholds that catch real issues
- Avoid flaky monitors that alert randomly
- Use `last_5m` or longer for stability

### Separate Labels

Use distinct labels for deployment checks vs. alerting:

```yaml
labels:
  app: my-app
  purpose: deployment-gate  # Only select these for rollouts
```

---

## Troubleshooting

### Monitor not being checked

1. Verify annotation is present:
   ```bash
   kubectl get datadogmonitor my-app-monitor -o yaml
   ```

2. Check labels match Rollout selector:
   ```bash
   kubectl describe rollout my-app
   ```

### False positives

If monitors are too sensitive:
- Increase evaluation window (`last_5m` → `last_10m`)
- Adjust thresholds
- Add `no data` handling

---

## Next Steps

{{< cards >}}
  {{< card title="Health Checks" link="/docs/guides/health-checks/" icon="shield-check" subtitle="All health check options" >}}
  {{< card title="API Reference" link="/docs/reference/api/" icon="code" subtitle="Full schema details" >}}
{{< /cards >}}
