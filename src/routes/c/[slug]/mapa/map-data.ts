import type { RequestEventBase } from "@qwik.dev/router";
import { claimSearchFilter } from "~/lib/claim-search";
import { logFailure } from "~/lib/log";
import { requestIdOf } from "~/lib/request-id";
import { supabase } from "~/lib/session";
import { MAP_CLAIMS_LIMIT, readMapFilters } from "./map-filters";
import { OPEN_CLAIM_STATUSES } from "~/lib/claim-stats";

export type MapClaim = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  lat: number | null;
  lng: number | null;
  location_text: string | null;
  image_url: string | null;
  support_count: number;
  created_at: string;
};

export async function loadMapClaims(ev: RequestEventBase) {
  const filters = readMapFilters(ev.url.searchParams);
  try {
    const db = supabase(ev);
    const { data: community, error: communityError } = await db
      .from("communities")
      .select("id")
      .eq("slug", ev.params.slug)
      .maybeSingle();
    if (communityError) throw communityError;
    if (!community) return { claims: [] as MapClaim[], filters, failed: false };

    let query = db
      .from("claims")
      .select(
        "id, title, description, category, status, lat, lng, location_text, image_url, support_count, created_at",
      )
      .eq("community_id", community.id)
      .neq("status", "removed");
    if (filters.category) query = query.eq("category", filters.category);
    if (filters.status === "resueltos") query = query.eq("status", "resolved");
    else if (filters.status === "abiertos")
      query = query.in("status", [...OPEN_CLAIM_STATUSES]);
    const search = claimSearchFilter(filters.query, "location_text");
    if (search) query = query.or(search);

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MAP_CLAIMS_LIMIT);
    if (error) throw error;
    return { claims: (data ?? []) as MapClaim[], filters, failed: false };
  } catch (error) {
    logFailure({ scope: "mapa/listado", requestId: requestIdOf(ev) }, error);
    return { claims: [] as MapClaim[], filters, failed: true };
  }
}
