# Deploying Dino Pew Pew over HTTPS

Production runs two containers from `docker-compose.prod.yml`:

- **`dinoriders`**: the game server. It serves the client, `/api` and the WebSocket on port 8080 inside the Docker network only.
- **`caddy`**: listens on ports 80 and 443. It gets a Let's Encrypt certificate for `$DOMAIN` automatically and proxies everything, including the WebSocket upgrade, to `dinoriders:8080`.

Pages loaded over HTTPS make the client use `wss://` on its own.

The game keeps all its state in memory. Run exactly one `dinoriders` container: more replicas would split the players into separate worlds. Every restart or redeploy starts a fresh world.

The local `docker-compose.yml` (plain HTTP on :8080) is for local use and is not used in production.

## 1. One-time VM setup

These steps are already done on the current Oracle Cloud VM (Ubuntu 24.04, ARM).

- Docker and Docker Compose v2 are installed, and the login user is in the `docker` group.
- TCP **80** and **443** are open in **both** places. Oracle's Ubuntu images block everything except SSH, so one alone is not enough.
  - In the Oracle security list (or a network security group), add an ingress rule from `0.0.0.0/0`.
  - In the VM firewall, run:
    ```bash
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
    sudo netfilter-persistent save
    ```
- The DNS name (`dino-pew-pew.duckdns.org`) points at the VM's public IP. Check with `nslookup dino-pew-pew.duckdns.org`.

Let's Encrypt validates through port 80, so keep port 80 open.

## 2. First deploy

```bash
git clone https://github.com/migosoft/dino-pew-pew.git ~/dinoriders
cd ~/dinoriders
cp .env.example .env        # edit DOMAIN if needed
docker compose -f docker-compose.prod.yml up -d --build
```

The build runs `npm test` and `npm run build`, which takes a few minutes on 2 OCPUs. A failing test stops the deploy. Then open `https://<DOMAIN>`.

`.env` is ignored by git. Never commit it.

**Switching over from the hand-edited setup.** The VM's working tree has local edits to `docker-compose.yml` and a hand-made `Caddyfile`. Drop them once before the first pull that includes this file:

```bash
cd ~/dinoriders
docker compose down                     # stops the old hand-edited stack
git checkout docker-compose.yml         # discard the local edits
rm Caddyfile                            # the repo now tracks its own Caddyfile
git pull
cp .env.example .env                    # if there is no .env yet
docker compose -f docker-compose.prod.yml up -d --build
```

Both files use the same project directory and the same volume names, so Caddy keeps the certificate it already has.

## 3. Update

```bash
cd ~/dinoriders && git pull && docker compose -f docker-compose.prod.yml up -d --build
```

The `caddy_data` volume keeps the certificates across redeploys. Don't delete it (`docker compose down -v` would). Losing it on every deploy means new certificate requests each time, which hits Let's Encrypt rate limits.

## 4. Troubleshooting

- **Certificate errors:** look at Caddy's log:
  ```bash
  docker compose -f docker-compose.prod.yml logs caddy --tail 50
  ```
  A certificate failure almost always means one of these:
  - the DNS name doesn't resolve to the VM yet;
  - port 80 is blocked, either in the Oracle security list or in iptables.
- **Health check:** `curl https://$DOMAIN/api/health`
- **Game server log:** `docker compose -f docker-compose.prod.yml logs dinoriders --tail 50`
- **`DOMAIN` not set:** compose refuses to start with `set DOMAIN in .env, …`. Create `.env` from `.env.example`.

## 5. The public IP can change

The VM's public IP (`130.61.38.42`) is ephemeral. If the instance is recreated it gets a new one, and you must update the DuckDNS record by hand.

The alternative is a reserved public IP. Check Oracle's Always Free terms before you create one: anything outside the free limits is billed.

Also note: Oracle can reclaim an Always Free instance that stays idle (CPU, network and memory all under 20%) for 7 days.
