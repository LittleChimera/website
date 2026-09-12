---
title: "Canary Rollouts"
weight: 4
---

Shift traffic progressively using [OpenKruise Rollout](https://openkruise.io/docs/rollouts/introduction). Kuberik adds bake time between steps and automated testing at each stage.

{{< callout type="info" >}}
**When to Use Canary Rollouts**

Use canary deployments when you need to validate changes with real traffic before full deployment. This is ideal for user-facing services where issues might only surface under production load, or when you want to limit blast radius during risky changes.
{{< /callout >}}

{{< callout type="warning" >}}
**Prerequisite**

Canary rollouts require the [OpenKruise Controller](/docs/installation/#openkruise-controller) to be installed in your cluster.
{{< /callout >}}

{{% details title="Installing OpenKruise" %}}

Follow the [OpenKruise installation guide](https://openkruise.io/docs/installation) or use the Kuberik-managed installation:

```bash
kubectl apply --server-side -f https://github.com/kuberik/openkruise-controller/releases/download/v0.3.3/install.yaml
```

{{% /details %}}

## Define the Rollout

Create an OpenKruise `Rollout` to manage your Deployment. Each step defines how many replicas and what percentage of traffic goes to the canary.

```yaml {filename="rollout.yaml"}
apiVersion: rollouts.kruise.io/v1beta1
kind: Rollout
metadata:
  name: my-app
  annotations:
    rollout.kuberik.io/step-1-bake-time: "5m"
spec:
  workloadRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  strategy:
    canary:
      steps:
        - replicas: 1
          traffic: 10%
        - replicas: 5
          traffic: 50%
      trafficRoutings:
        - service: my-app
          gateway:
            httpRouteName: my-app
```

{{< callout type="default" >}}
Kuberik watches the rollout and enforces bake time at each step before allowing progression. If health checks fail during bake, the rollout is paused.

See the [OpenKruise Rollout documentation](https://openkruise.io/docs/rollouts/user-manuals/strategy-canary-update) for full canary strategy options.
{{< /callout >}}

## Run Tests at Steps

Use `RolloutTest` to run a Job at a specific canary step. Kuberik pauses the rollout at that step, runs the Job, and proceeds only if it succeeds. If the test fails, the rollout stays paused for investigation or rollback.

![A stepped rollout in the dashboard: each canary step is a stage of the deployment pipeline, and the final check watches the health checks before the deploy counts as done](/screenshots/dashboard/overview-prod.png)

```yaml {filename="smoke-test.yaml"}
apiVersion: rollout.kuberik.com/v1alpha1
kind: RolloutTest
metadata:
  name: smoke-test
spec:
  rolloutName: my-app
  stepIndex: 1
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: test
              image: curlimages/curl
              command: ["curl", "--fail", "http://my-app-canary"]
```

The `stepIndex` is 1-based and corresponds to the steps defined in the OpenKruise Rollout. You can create multiple `RolloutTest` resources targeting different steps.

{{< callout type="warning" >}}
Tests configured on the last step won't run. OpenKruise Rollouts completes without pausing at the final step, so the controller never gets a chance to execute them. Only configure `RolloutTest` for steps that aren't the last one.
{{< /callout >}}

## Kuberik Annotations

| Annotation | Purpose |
|------------|---------|
| `rollout.kuberik.io/step-<N>-ready-timeout` | {{< badge content="Timeout" color="orange" >}} Max wait time for pod readiness at step N |
| `rollout.kuberik.io/step-<N>-bake-time` | {{< badge content="Bake" color="blue" >}} Stabilization time after readiness at step N |
