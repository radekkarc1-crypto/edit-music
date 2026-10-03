{"name":"edit-music","version":"0.2.0","private":true,"scripts":{"dev":"next dev","build":"next build","start":"next start","lint":"next lint"},"dependencies":{"next":"latest","react":"latest","react-dom":"latest"},"devDependencies":{"@types/node":"latest","@types/react":"latest","@types/react-dom":"latest","typescript":"latest"}}

## Backend blueprint

The repository now includes `supabase/schema.sql`, a ready database blueprint for profiles, tracks, edits, likes, comments, follows and copyright/moderation reports. It uses row-level security and creator-controlled downloads. The live Supabase project has not been created yet, so no paid resource was created automatically.


## Supabase Auth

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in your environment. The account UI uses Supabase Auth for email/password login and registration. The publishable key is safe for browser use when database/storage access is protected by RLS; never put a service-role key in `NEXT_PUBLIC_*` variables.
