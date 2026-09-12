---
title: "Service Dependencies"
weight: 4
---

Hold a service until the service it depends on has shipped the version it needs, in every environment, without hand-sequencing deploys. Requires rollout-controller v0.9.0 or newer.

A `RolloutDependency` connects a consumer Rollout to a provider Rollout. Each consumer release says which provider version it was built against; the controller admits it only once the provider has successfully deployed a release that satisfies that constraint. Providers advance first, consumers follow on their own.

## Declare the Contract on the Images

The dependency lives on the images, not in the manifests. The provider announces the contract version it serves in the standard OCI version annotation; the consumer adds one annotation per contract it requires:

```bash {filename="build.sh"}
# provider: the contract version this build serves
docker buildx build --push -t ghcr.io/acme/api:rel-64 \
  --annotation "index:org.opencontainers.image.version=1.64.0-64" .

# consumer: its own version, plus what it was built against
docker buildx build --push -t ghcr.io/acme/frontend:rel-64 \
  --annotation "index:org.opencontainers.image.version=2.64.0-64" \
  --annotation "index:com.kuberik.rollout.requires.api=^1.64.0" .
```

The annotation key is `com.kuberik.rollout.requires.<contract>`. The value is a [Masterminds/semver constraint](https://github.com/Masterminds/semver#checking-version-constraints), applied verbatim: `^1.64.0`, `~1.64.0`, `>=1.64.0 <2.0.0` and `1.64.x` all work.

{{< callout type="warning" >}}
A bare version such as `1.64.0` is an **exact match**, not a floor. A release that tolerates later providers has to say so: publish `^1.64.0`.
{{< /callout >}}

The `-64` suffix is a per-build ordinal. Attach it as a SemVer pre-release identifier so builds of the same triple still sort by build order, and keep `org.opencontainers.image.revision` as the real git SHA. The controller strips that numeric ordinal before evaluating the constraint; a real pre-release such as `1.64.0-rc.1` is kept and correctly fails `^1.64.0`, because the triple has not shipped yet.

## Connect the Rollouts

One object per consumer and contract, in the consumer's namespace:

```yaml {filename="frontend-needs-api.yaml"}
apiVersion: kuberik.com/v1alpha1
kind: RolloutDependency
metadata:
  name: frontend-needs-api
  namespace: shop-prod
spec:
  rolloutRef:
    name: frontend            # the consumer being gated
  providerRef:
    name: api                 # the Rollout that provides the contract
    # namespace: platform-prod  # defaults to this namespace
  contract: api               # matches com.kuberik.rollout.requires.api
                              # defaults to the provider Rollout name
```

Apply it in every environment that has both Rollouts. Each environment waits on its own copy of the provider: production's frontend waits for production's api, not for staging's.

## What the Controller Does

For every consumer release candidate, the controller reads its `requires.<contract>` annotation and compares it with the contract version of the release the provider has **successfully deployed** (bake succeeded, not merely started). The verdict is published as a `RolloutGate` named `dependency-<name>` whose `allowedVersions` lists exactly the admitted releases. Rollout admission is unchanged: the gate is evaluated like schedule and manual-approval gates.

Because the verdict is an allow list, a dependency holds back only the releases whose requirement is unmet. Older releases stay deployable, so rollback works while a newer release waits. A Rollout with no deployment history deploys its newest release without waiting on gates, so a brand-new consumer is gated from its second release on.

## Watch It

```bash {filename="inspect.sh"}
kubectl -n shop-prod get rolloutdependency
# NAME                 ROLLOUT    PROVIDER   PROVIDED   SATISFIED
# frontend-needs-api   frontend   api        1.64.0     False

kubectl -n shop-prod get rolloutdependency frontend-needs-api \
  -o jsonpath='{.status.blockedReleases}'
# [{"reason":"ConstraintNotSatisfied","requiredVersion":"^1.66.0","tag":"rel-66"}]
```

The dashboard shows the same on the rollout's **Dependencies** tab: what the consumer waits on, the version it needs against the version running, and the contract across every environment. The home page and the Environments page name the provider on every held card.

![Dependencies of a rollout: what it waits on, the version it needs against the version running, and the same contract across every environment](/screenshots/dashboard/rollout-dependencies.png)

Once the provider bakes, the consumer follows a few seconds later, unprompted.

## Limits

- The consumer must be in the same namespace as the `RolloutDependency`; a `RolloutGate` can only reference a Rollout in its own namespace. The provider may live elsewhere via `spec.providerRef.namespace`.
- The provider's `org.opencontainers.image.version` must be a semantic version. A git SHA there cannot be ordered against a constraint.
- One `RolloutDependency` covers one contract. A consumer that requires two services gets two objects.
