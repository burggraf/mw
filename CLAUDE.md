# Mobile Worship - Claude Code Guidelines

## Project Overview

Mobile Worship is a modern, decentralized worship presentation platform. It enables churches to control presentations from phones/tablets while displaying on affordable devices like FireTV sticks.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **UI:** Tailwind CSS, Shadcn UI
- **State:** React Context (AuthContext, ChurchContext, ThemeContext)
- **Backend:** Supabase (Auth, Database, Storage, Edge Functions)
- **Native:** Tauri 2.0 for desktop/mobile builds
- **i18n:** react-i18next (English + Spanish)

## Package Manager

**Use `pnpm` for all package operations.** Do NOT use npm or yarn.

```bash
# Install dependencies
pnpm install

# Add a package
pnpm add <package>

# Add a dev dependency
pnpm add -D <package>

# Run scripts
pnpm dev
pnpm build
pnpm tauri:dev
pnpm tauri:build
```

## Project Structure

```
/Users/markb/dev/mw/
├── app/                      # Main application
│   ├── src/
│   │   ├── components/       # React components
│   │   │   └── ui/           # Shadcn UI components
│   │   ├── contexts/         # React contexts
│   │   ├── hooks/            # Custom hooks
│   │   ├── i18n/             # Translations
│   │   │   └── locales/      # en.json, es.json
│   │   ├── lib/              # Utilities (supabase, config, etc.)
│   │   ├── pages/            # Page components
│   │   ├── routes/           # React Router config
│   │   ├── services/         # Database service functions
│   │   └── types/            # TypeScript types
│   ├── src-tauri/            # Tauri native code
│   ├── supabase/             # Supabase config & migrations
│   └── public/               # Static assets
└── docs/
    └── plans/                # Implementation plans (milestones)
```

## Development Commands

```bash
cd /Users/markb/dev/mw/app

# Start web dev server
pnpm dev

# Start Tauri desktop dev
pnpm tauri:dev

# Build for production
pnpm build

# Build Tauri app
pnpm tauri:build

# Add Shadcn component
pnpm dlx shadcn@latest add <component>

# Supabase commands
supabase migration new <name>
supabase db push
supabase link --project-ref <ref>
```

## Code Conventions

### File Naming
- Components: PascalCase (`AppSidebar.tsx`)
- Utilities/services: camelCase (`song-parser.ts`)
- Types: camelCase with `.ts` extension

### Components
- Use function components with hooks
- Export named exports (not default) for pages/components
- Use `@/` path alias for imports

### i18n
- All user-facing strings must use `t()` from react-i18next
- Add translations to both `en.json` and `es.json`
- Nest keys by feature: `auth.signIn`, `songs.title`, etc.

### Database
- All tables must have Row-Level Security (RLS) policies
- Use `church_id` for multi-tenant data isolation
- Migrations go in `supabase/migrations/`

### Styling
- Use Tailwind CSS classes
- Use Shadcn UI components where possible
- Support dark mode via `dark:` variants and ThemeContext

## Key Patterns

### Song Storage
Songs use markdown with YAML frontmatter:
```markdown
---
title: Amazing Grace
author: John Newton
copyright: Public Domain
ccli_number: 1234567
---

# Verse 1
Amazing grace how sweet the sound...

# Chorus
Amazing grace, amazing grace...
```

Metadata extracted to DB columns for querying, full markdown stored in `content` field.

### Multi-tenant Architecture
- All data scoped by `church_id`
- RLS policies enforce data isolation
- Users can belong to multiple churches with different roles

### Bootstrap Config
All apps fetch Supabase credentials from `/config.json` at startup (not hardcoded).

## Current Milestone

Working on: **Milestone 1 - Songs**
See: `docs/plans/milestone-1-songs.md`

## Testing

```bash
# Run tests (when implemented)
pnpm test

# E2E tests
pnpm test:e2e
```
