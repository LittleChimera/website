---
title: "Health Checks"
weight: 1
---

Use `HealthCheck` to verify deployments. Kuberik monitors health checks during deployment and bake time—bake only starts once all checks transition from pending to healthy. Any failed health check marks the deployment as failed.

## Kustomization Health

Monitor a Flux Kustomization. The check passes when all resources deployed by the Kustomization are reconciled, as evaluated by [kstatus](https://github.com/kubernetes-sigs/cli-utils/blob/master/pkg/kstatus/README.md).

```yaml {filename="health-check.yaml"}
apiVersion: kuberik.com/v1alpha1
kind: HealthCheck
metadata:
  name: my-app-health
  labels:
    app: my-app
  annotations:
    healthcheck.kuberik.com/kustomization: "my-app"
spec:
  class: kustomization
```

The annotation `healthcheck.kuberik.com/kustomization` specifies which Flux Kustomization to monitor.

## Connect to Rollout

Configure your Rollout to select health checks by label.

```yaml {filename="rollout.yaml"}
apiVersion: kuberik.com/v1alpha1
kind: Rollout
metadata:
  name: my-app
spec:
  releasesImagePolicy:
    name: my-app-policy
  bakeTime: 5m
  healthCheckSelector:
    selector:
      matchLabels:
        app: my-app
```

Kuberik continuously evaluates all matching health checks. Bake time starts once all checks become healthy.

![Health checks on the rollout page: each check with its state, next to the deployment pipeline it gates](/screenshots/dashboard/overview.png)

{{% details title="Advanced: Cross-Namespace Selection" %}}

Select health checks from other namespaces using `namespaceSelector`.

```yaml {filename="rollout-cross-ns.yaml"}
apiVersion: kuberik.com/v1alpha1
kind: Rollout
metadata:
  name: my-app
spec:
  healthCheckSelector:
    selector:
      matchLabels:
        app: my-app
    namespaceSelector:
      matchLabels:
        monitoring: enabled
```

{{< callout type="info" >}}
**Use Cases:**
- Shared monitoring infrastructure
- Multi-tenant clusters with namespace isolation
- Health checks managed by platform teams
{{< /callout >}}

{{% /details %}}

## Datadog Monitors

See the [Datadog Integration](/docs/integrations/datadog/) guide for using Datadog monitors as health checks.
