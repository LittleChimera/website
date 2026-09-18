---
title: "Dashboard Authentication"
weight: 2
---

Put the Rollout Dashboard behind your OIDC provider. A single [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/) deployment in `auth-system` gates the dashboard via [Envoy Gateway](https://gateway.envoyproxy.io) extAuth.

{{< callout type="info" >}}
Installing via the [Helm chart](helm/)? Set `auth.enabled: true` and `dashboard.gateway.auth: true` — every manifest below is templated for you. The steps here are the manual path for non-Helm installs.
{{< /callout >}}

## Register One OIDC Client

At your OIDC provider:

- **Client ID**: `kuberik-cluster`
- **Redirect URI**: `https://<dashboard-host>/oauth2/callback`
- **Scopes**: `openid email profile groups`

The same client id is reused by kube-apiserver, so the id_token authenticates against both.

## Configure kube-apiserver

```text {filename="kube-apiserver flags"}
--oidc-issuer-url=https://<your-oidc-issuer>
--oidc-client-id=kuberik-cluster
--oidc-username-claim=email
```

## Deploy the Auth Gate

```bash
kubectl create namespace auth-system
kubectl create secret generic oauth2-proxy-secrets -n auth-system \
  --from-literal=client-secret="<client-secret>" \
  --from-literal=cookie-secret="$(openssl rand -base64 32 | tr -- '+/' '-_' | head -c 32)"
```

```yaml {filename="auth-system.yaml"}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth2-proxy
  namespace: auth-system
spec:
  selector:
    matchLabels: { app: oauth2-proxy }
  template:
    metadata:
      labels: { app: oauth2-proxy }
    spec:
      containers:
        - name: oauth2-proxy
          image: quay.io/oauth2-proxy/oauth2-proxy:v7.7.1
          args:
            - --provider=oidc
            - --oidc-issuer-url=https://<your-oidc-issuer>
            - --client-id=kuberik-cluster
            - --email-domain=*
            - --upstream=static://200
            - --http-address=0.0.0.0:4180
            - --redirect-url=https://<dashboard-host>/oauth2/callback
            - --scope=openid email profile groups
            - --set-authorization-header=true
            - --pass-access-token=true
            - --set-xauthrequest=true
            - --skip-provider-button=true
            # The dashboard is a polling SPA: it refreshes on a 5s interval and
            # holds an SSE change stream open. Without this, every one of those
            # background requests that arrives with a stale session starts a
            # *full* OIDC flow at extAuth time - a 302 to your IdP plus a CSRF
            # cookie holding a fresh PKCE verifier. The browser can't follow
            # that redirect from an XHR (cross-origin, CORS-blocked), so the
            # SPA can't recover and just keeps polling, starting a new flow
            # every time. `--api-route` makes `/api/*` answer 401 instead:
            # no redirect, no cookie, and a status the frontend can act on.
            - --api-route=^/api/
            # The same stale session also 302s the dashboard's *static* bundle
            # to the IdP. Browser navigations follow that and sign in; module
            # scripts / stylesheets / fetches cannot (cross-origin redirect is
            # CORS-blocked), so the tab dies with "Failed to fetch dynamically
            # imported module" against the IdP hostname. Putting these paths in
            # `--api-route` is the wrong tool — a 401 still fails to load the
            # chunk. `--skip-auth-route` serves the compiled, content-hashed
            # frontend unauthenticated; real data stays behind `/api/` (401).
            # Matches chart `auth.staticRoutes` defaults (kuberik/kuberik#17).
            - --skip-auth-route=^/_app/
            - --skip-auth-route=^/(favicon\.(ico|png)|apple-touch-icon\.png|icon-(192|512)\.png|logo\.svg|manifest\.json)$
            - --cookie-secure=true
            - --cookie-samesite=lax
            - --reverse-proxy=true
            - --skip-jwt-bearer-tokens=true
          env:
            - { name: OAUTH2_PROXY_CLIENT_SECRET, valueFrom: { secretKeyRef: { name: oauth2-proxy-secrets, key: client-secret } } }
            - { name: OAUTH2_PROXY_COOKIE_SECRET, valueFrom: { secretKeyRef: { name: oauth2-proxy-secrets, key: cookie-secret } } }
          ports:
            - containerPort: 4180
---
apiVersion: v1
kind: Service
metadata: { name: oauth2-proxy, namespace: auth-system }
spec:
  selector: { app: oauth2-proxy }
  ports: [{ port: 4180, targetPort: 4180 }]
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: { name: oauth2-proxy, namespace: auth-system }
spec:
  parentRefs:
    - { name: <gateway-name>, namespace: <gateway-namespace> }
  rules:
    - matches: [{ path: { type: PathPrefix, value: /oauth2 } }]
      backendRefs: [{ name: oauth2-proxy, port: 4180 }]
---
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata: { name: oauth2-proxy-from-all, namespace: auth-system }
spec:
  from:
    - { group: gateway.envoyproxy.io, kind: SecurityPolicy, namespace: kuberik-system }
  to:
    - { group: "", kind: Service, name: oauth2-proxy }
```

## Attach the Dashboard

```yaml {filename="dashboard-auth.yaml"}
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: rollout-dashboard-auth
  namespace: kuberik-system
spec:
  targetRefs:
    - { group: gateway.networking.k8s.io, kind: HTTPRoute, name: rollout-dashboard }
  extAuth:
    http:
      backendRefs:
        - { name: oauth2-proxy, namespace: auth-system, port: 4180 }
      headersToBackend:
        - Authorization
        - X-Auth-Request-User
        - X-Auth-Request-Email
        - X-Auth-Request-Access-Token
```

## Troubleshooting

### Intermittent "Failed to fetch dynamically imported module" against the IdP host

Symptom: the dashboard shell loads, then a navigation after the session goes
stale fails with `Failed to fetch dynamically imported module` (or a CORS
error) pointed at your IdP hostname — not the dashboard host. Tabs that
already held the chunk keep working; a hard reload sometimes appears to fix
it because a navigation can re-auth.

Cause: extAuth is 302ing the code-split `/_app/` chunks (and icons/manifest)
to the IdP. Subresources cannot follow that redirect. `--api-route` does not
help here — a 401 still leaves the chunk unloaded.

Fix: add the `--skip-auth-route` lines from the manifest above (chart value
`auth.staticRoutes`). Navigations still 302 to the IdP; `/api/*` still 401s;
the hashed frontend is served so the shell can show the session-expired state.

### The dashboard stops loading for one person, and clearing site data fixes it

Symptom: one user's browser can't reach the dashboard host at all - Chrome
shows `ERR_HTTP2_PROTOCOL_ERROR` or "this site can't be reached" - while
everyone else is fine and `curl` from a terminal works. Clearing site data
fixes it until it comes back.

This is cookie bloat, not a network or browser fault. Proxies cap the total
size of a request's header block (Envoy's default is 60 KiB, via
`max_request_headers_kb`). Once the accumulated `Cookie` header crosses that,
the proxy resets the stream before the route is ever reached. It fails
identically on HTTP/1.1 - only the error page differs - so this is not an
HTTP/2 problem and turning off HTTP/2 will not fix it.

The usual cause is `--cookie-csrf-per-request=true`. That flag is widely
recommended to fix `invalid_grant: PKCE verification failed` on concurrent
logins ([oauth2-proxy#2155](https://github.com/oauth2-proxy/oauth2-proxy/issues/2155)),
and it works by giving each in-flight flow a *uniquely named* CSRF cookie.
Unique names mean the browser never overwrites the previous one - it keeps
every one of them for the full `--cookie-csrf-expire` window (15m default)
and replays them all on every subsequent request. Combined with a polling SPA
whose session went stale, that is hundreds of ~380 byte cookies in minutes.

Fixes, in order of preference:

1. **Set `--api-route=^/api/`** (in the manifest above). This is the root fix
   for background XHR/SSE: those requests stop starting OIDC flows, so there
   are no concurrent flows to race and no CSRF cookies minted in the
   background. With it, `--cookie-csrf-per-request` is usually unnecessary.
   Keep the `--skip-auth-route` lines too — they are the matching fix for the
   static bundle (see below).
2. **If you still need `--cookie-csrf-per-request`**, always pair it with
   `--cookie-csrf-per-request-limit=3`, which evicts the oldest CSRF cookies
   instead of letting them accumulate without bound.

To confirm before clearing anything: DevTools -> Application -> Cookies ->
your dashboard host, and count the `_oauth2_proxy*` entries; or check the
failing request's `Cookie` header length. Several KB and climbing is this bug.

Gate another service by applying the same `SecurityPolicy` shape in its namespace and extending the `ReferenceGrant` `from` list.

{{< callout type="info" >}}
For multi-cluster (hub fans out to spokes), deploy this gate in every cluster pointing at the same OIDC issuer. `--skip-jwt-bearer-tokens=true` lets the hub forward the user's id_token to spokes without a per-cluster login.
{{< /callout >}}
