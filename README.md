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

## Google sign-in (Supabase)

With Supabase set up, the admin page shows "Sign in with Google" instead of the token form. Only the Google account in the `ADMIN_EMAIL` secret can save. The GitHub token stays on Supabase and never reaches the browser; content still lives in this repository.

1. Create a Supabase project.
2. Google Cloud → APIs & Services → Credentials → Create OAuth client ID (Web application). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → Authentication → Sign In / Providers → Google: turn it on and paste the client ID and secret.
4. Supabase → Authentication → URL Configuration: Site URL and Redirect URLs `https://quartzeon.com/admin/`.
5. Supabase → Edge Functions → create a function named `github` with the code from `supabase/functions/github/index.ts`. Turn "Verify JWT" off (the function checks the sign-in itself).
6. Edge Functions → Secrets:
   - `GITHUB_TOKEN`: the fine-grained token from step 5 above.
   - `ADMIN_EMAIL`: the Google address allowed to edit.
   - `GITHUB_REPO`: `quartzeon/quartzeon-site`
   - `ALLOWED_ORIGIN`: `https://quartzeon.com`
7. Put the project URL and its publishable (anon) key in `public/admin/config.js` (`QE_SUPABASE`). Both are public values. Leave `url` empty to go back to token sign-in.

## Run locally

Any static file server works, e.g. `npx serve public`. The admin page needs a real token and talks to GitHub, so test admin changes carefully.

## Cloudflare version (not in use)

`functions/`, `lib/`, `schema.sql`, `wrangler.toml` and `public/_headers` are the earlier Cloudflare Pages version (D1 database + R2 storage). They are kept so the site can move back later; GitHub Pages ignores them.
