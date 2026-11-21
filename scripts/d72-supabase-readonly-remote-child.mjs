#!/usr/bin/env node

import { runD72SupabaseReadonlyRemoteChildMain } from "./run-d72-supabase-readonly.mjs";

process.umask(0o077);
process.exitCode = runD72SupabaseReadonlyRemoteChildMain();
