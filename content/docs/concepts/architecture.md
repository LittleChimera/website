---
title: "Architecture"
weight: 1
---

Kuberik is a GitOps-native orchestration layer that extends the standard controller pattern to handle complex deployment lifecycles.

## System Overview

```mermaid
flowchart TB
    %% Styles
    classDef flux fill:#2D7E9D,stroke:#fff,stroke-width:2px,color:#fff
    classDef kuberik fill:#4B4BE8,stroke:#fff,stroke-width:2px,color:#fff
    classDef workload fill:#E5E7EB,stroke:#374151,stroke-width:1px,color:#374151
    classDef boundary fill:#F3F4F6,stroke:#D1D5DB,stroke-width:1px,color:#374151,stroke-dasharray: 5 5

    subgraph Cluster ["Cluster Scope"]
        direction TB

        subgraph FluxCD ["FluxCD Layer"]
            direction TB
            IR[ImageRepository]:::flux
            IP[ImagePolicy]:::flux
            OCIR[OCIRepository]:::flux
            KS[Kustomization]:::flux
        end

        subgraph Kuberik ["Kuberik Control Plane"]
            direction TB
            RO[Rollout]:::kuberik
            ENV[Environment]:::kuberik
            HC[HealthCheck]:::kuberik
            RG[RolloutGate]:::kuberik
        end

        DEP[Workload]:::workload
    end

    %% Flows
    IR --> IP
    IP --> RO
    RO --> ENV

    %% Connections
    OCIR --> KS
    KS --> DEP
    RO -.->|Substitutes Version| KS
    RO -.->|Moves Tag| OCIR
    HC --> RO
    RG --> RO

    %% Subgraph Styling
    class FluxCD,Kuberik boundary
```

## Component Roles

| Component | Purpose |
|-----------|---------|
| **Rollout** | The core state machine. Watches `ImagePolicy` and orchestrates releases. Drives either a `Kustomization` substitution or an `OCIRepository` tag. |
| **Environment** | Maps a Rollout to a logical target (e.g. "production") and syncs status to external backends (GitHub). |
| **HealthCheck** | Probes system health during the bake period (HTTP, Datadog, Script). |
| **RolloutGate** | Blocks a Rollout from proceeding until specific conditions (manual approval, API check) are met. |

![One rollout in the dashboard: the running build, its deployment pipeline, the health checks it watches and the resources it manages](/screenshots/dashboard/overview.png)

## The Release Lifecycle

{{% steps %}}

### Discovery

Flux detects a new image tag. Kuberik creates a pending `Release`.

### Gating

`RolloutGates` are evaluated. If any gate fails or is pending, the release waits.

### Execution

Kuberik updates the Flux source it owns: a substitution variable on a `Kustomization`, or the tag on an `OCIRepository`. Flux applies the changes. See [Propagation Modes](/docs/concepts/propagation/).

### Bake Time

Kuberik waits for a defined stabilization period.

### Verification

`HealthChecks` run continuously.

- {{< badge content="Available" color="green" >}} All health checks pass — release is promoted.
- {{< badge content="Failed" color="red" >}} A health check fails — release is halted.

{{% /steps %}}
