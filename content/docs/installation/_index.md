---
title: "Installation"
weight: 1
sidebar:
  open: true
---

Install Kuberik in your Kubernetes cluster. The recommended path is the [Helm chart](helm/) — one release installs the controller, integrations, dashboard, and the OIDC auth gate. The steps below cover the manual `kubectl apply` route.

{{< callout type="info" >}}
**Prerequisites:** You'll need a Kubernetes cluster and `kubectl` access. Kuberik requires a GitOps tool like FluxCD to function.
{{< /callout >}}

## All-in-one (kustomize)

Pin-compatible bundle of the core controller plus optional integrations:

```bash
kubectl apply --server-side -k https://github.com/kuberik/kuberik/config/install
```

`--server-side` is required for the same CRD size reason as below. Prefer the [Helm chart](helm/) when you want one release to own upgrades.

---

## Resource Reconciler

Kuberik relies on a resource reconciler to apply manifests to your cluster.

{{< tabs >}}
  {{< tab name="FluxCD" >}}
  Install [FluxCD](https://fluxcd.io/flux/installation/) v2.0+:

  ```bash
  flux check
  ```

  See [FluxCD Integration](/docs/integrations/fluxcd/) for configuration details.
  {{< /tab >}}

  {{< tab name="Argo CD" disabled=true >}}
  Argo CD support is planned but not yet available.
  {{< /tab >}}
{{< /tabs >}}

---

## Install Kuberik Controller

Deploy the rollout controller:

```bash
kubectl apply --server-side -f https://github.com/kuberik/rollout-controller/releases/download/{{< param "rollout_controller_version" >}}/install.yaml
```

{{< callout type="info" >}}
`--server-side` is required: the openkruise `RolloutTest` CRD (and some core CRDs) are larger than the annotation limit of client-side `kubectl apply`.
{{< /callout >}}

{{< callout type="default" >}}
**Verify Installation:**

```bash
kubectl get pods -n kuberik-system
# Expected output:
# rollout-controller-xxxxx   1/1     Running
```
{{< /callout >}}

---

## Optional Controllers

{{< callout type="warning" >}}
These controllers are **optional** and add specific functionality. Install only what you need for your use case.
{{< /callout >}}

{{% details title="OpenKruise Controller" %}}

Enables canary deployments and advanced traffic shifting.

```bash
kubectl apply --server-side -f https://github.com/kuberik/openkruise-controller/releases/download/{{< param "openkruise_controller_version" >}}/install.yaml
```

{{< badge content="Canary Deployments" >}} {{< badge content="Traffic Shifting" >}}

See [FluxCD Integration](/docs/integrations/fluxcd/) for image automation setup.

{{% /details %}}

{{% details title="Datadog Controller" %}}

Uses Datadog monitors as health check sources during rollouts.

```bash
kubectl apply --server-side -f https://github.com/kuberik/datadog-controller/releases/download/{{< param "datadog_controller_version" >}}/install.yaml
```

{{< badge content="Health Checks" >}} {{< badge content="Monitoring" >}}

{{< callout type="info" >}}
You'll need a Datadog API key configured. See [Datadog Integration](/docs/integrations/datadog/) for monitor configuration.
{{< /callout >}}

{{% /details %}}

{{% details title="Environment Controller" %}}

Coordinates multi-cluster promotions via GitHub Environments and Deployments APIs.

```bash
kubectl apply --server-side -f https://github.com/kuberik/environment-controller/releases/download/{{< param "environment_controller_version" >}}/install.yaml
```

{{< badge content="Multi-cluster" >}} {{< badge content="GitHub Integration" >}}

See [GitHub Integration](/docs/integrations/github/) for setup.

{{% /details %}}

---

## Going Further

{{< cards >}}
  {{< card title="Install with Helm" link="helm/" icon="cube" subtitle="One-release install of controller, integrations, dashboard, auth" >}}
  {{< card title="Dashboard Authentication" link="dashboard-auth/" icon="lock-closed" subtitle="Put the Rollout Dashboard behind your OIDC provider" >}}
{{< /cards >}}

