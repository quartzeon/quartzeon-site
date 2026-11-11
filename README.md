# Quartz Eon — quartzeon.com

Personal site: projects, software downloads and YouTube videos, with an admin page at `/admin`.
Hosted on GitHub Pages. The site is the static `public/` folder; all content lives in `public/content.json` and uploaded files in `public/files/`.

## How the admin page works

- Open `quartzeon.com/admin` and sign in with a GitHub fine-grained token (see below). The token is kept only in that browser's localStorage; "Sign out" removes it.
- Every save makes one commit to this repository (`public/content.json` plus any images or files). The `Deploy site` workflow then publishes the site, which takes about a minute.
- Without a token that can write to this repository, nobody can change anything.
- Uploads: images up to 10 MB (JPG, PNG, WebP, GIF); software files up to 50 MB. For bigger files, put them on GitHub Releases or Google Drive and use the "download link" field.

The repository the admin page saves to is set in `public/admin/config.js`.

## Set up (first time)

1. Push this folder to a GitHub repository (e.g. `quartzeon-site`) on the `main` branch.
2. Repository → Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Settings → Pages → Custom domain: `quartzeon.com` (the `public/CNAME` file sets it too). Turn on "Enforce HTTPS" once the certificate is ready.
4. DNS (Cloudflare): point `quartzeon.com` at GitHub Pages — A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (DNS only, grey cloud), and `www` as a CNAME to `<username>.github.io`.
5. Create the admin token: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
   - Repository access: only this repository.
   - Permissions → Contents: Read and write.

## Run locally

Any static file server works, e.g. `npx serve public`. The admin page needs a real token and talks to GitHub, so test admin changes carefully.

## Cloudflare version (not in use)

`functions/`, `lib/`, `schema.sql`, `wrangler.toml` and `public/_headers` are the earlier Cloudflare Pages version (D1 database + R2 storage). They are kept so the site can move back later; GitHub Pages ignores them.
