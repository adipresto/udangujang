# Deploy udangujang ke k3s single-node (adivm)
#
# Arsitektur: browser -> Traefik (:80) -> ssr:3000 -> das:50051 -> Firestore.
# DAS internal only (ClusterIP, tanpa Ingress). Akses publik via IP mentah:
# http://70.153.24.73/udang (HTTP, tanpa TLS — tanpa domain, letsencrypt
# tidak bisa terbit; lihat 06-ingress.yaml).
#
# ## Langkah 0: prasyarat (sekali saja)
#
# 1. Image SSR + DAS sudah di GHCR (CI UDMC-12, trigger push master).
# 2. Service-account Firebase ada di VM: `~/sa-udangudang.json`.
# 3. GitHub PAT (scope `read:packages`) untuk pull image private.
#
# ## Langkah 1: namespace
#
# ```bash
# kubectl apply -f 01-namespace.yaml
# ```
#
# ## Langkah 2: secrets (JANGAN apply file *.placeholder.yaml)
#
# ```bash
# kubectl -n udangujang create secret docker-registry ghcr-pull \
#   --docker-server=ghcr.io --docker-username=adipresto \
#   --docker-password=<GITHUB_PAT_READ_PACKAGES> \
#   --docker-email=rizky.adie7@gmail.com
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
# - Prefix /udang di-strip sebelum sampai Next.js (middleware strip-udang).
# - Resource: DAS 50m/32Mi req, 250m/128Mi lim; SSR 100m/128Mi req,
#   500m/512Mi lim. Total ~150m/160Mi req — aman di samping
#   obsidian-vault + gameserver (2 vCPU/~4GB).
