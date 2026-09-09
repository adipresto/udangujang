# Deploy udangujang ke k3s single-node (adivm)
#
# Arsitektur: browser -> Traefik (:80) -> ssr:3000 -> das:50051 -> Firestore.
# DAS internal only (ClusterIP, tanpa Ingress). Akses publik via IP mentah:
# http://70.153.24.73/pesanudang (form, HTTP tanpa TLS — tanpa domain,
# letsencrypt tidak bisa terbit; lihat 06-ingress.yaml).
#
# Image: LOKAL di node (pola gameserver), bukan dari registry.
# Deployment pakai `imagePullPolicy: Never` + tag `:local`.
# Alur update image: build di mesin owner -> `ctr images import` di node
# -> `kubectl rollout restart`. Detail di Langkah 0.
#
# ## Langkah 0: siapkan image lokal di node (sekali per update)
#
# Build di mesin yang ada docker (lihat UDMC-11), lalu pindah + import:
#
# ```bash
# # di mesin build:
# docker buildx build --platform linux/amd64 -f apps/ssr/Dockerfile -t udangujang-ssr:local .
# docker buildx build --platform linux/amd64 -f services/das/Dockerfile -t udangujang-das:local .
# docker save udangujang-ssr:local udangujang-das:local | gzip > udang-images.tar.gz
# # pindah file ke VM (scp), lalu di VM sebagai root:
# sudo ctr -n k8s.io images import udang-images.tar.gz
# ```
#
# ## Langkah 1: namespace
#
# ```bash
# kubectl apply -f 01-namespace.yaml
# ```
#
# ## Langkah 2: secret Firebase (JANGAN apply file *.placeholder.yaml)
#
# ```bash
# kubectl -n udangujang create secret generic das-firebase-sa \
#   --from-file=sa.json=$HOME/sa-udangudang.json
# ```
#
# ## Langkah 3: workloads
#
# ```bash
# kubectl apply -f 04-das.yaml -f 05-ssr.yaml -f 06-ingress.yaml
# ```
#
# ## Langkah 4: verifikasi
#
# ```bash
# kubectl -n udangujang get pods
# kubectl -n udangujang logs deploy/das --tail=20
# curl http://70.153.24.73/pesanudang  # form pemesanan publik
# curl http://70.153.24.73/atminudang  # dashboard admin (login Firebase)
# ```
#
# ## Catatan keputusan
#
# - Tanpa oauth2-proxy: admin login via Firebase Auth di app (UDMC-5).
# - Tanpa TLS: akses IP mentah, bukan domain (keputusan owner, opsi B).
# - Rewrite /pesanudang->/pesan + /atminudang->/admin dikerjakan Next.js
#   via rewrites() di apps/ssr/next.config.ts (tanpa basePath, asset aman).
# - Image lokal (bukan GHCR): owner minta pola gameserver; imagePullPolicy
#   Never. GHCR/CI (UDMC-12) tetap ada sebagai arsip build, tidak dipakai
#   untuk deploy klaster ini.
# - Resource: DAS 50m/32Mi req, 250m/128Mi lim; SSR 100m/128Mi req,
#   500m/512Mi lim. Total ~150m/160Mi req — aman di samping
#   obsidian-vault + gameserver (2 vCPU/~4GB).
