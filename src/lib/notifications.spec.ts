import { describe, expect, it } from "vitest";
import type { Tables } from "./database.types";
import { CONTENT_KIND_TONES } from "./content-kinds";
import { readCursor } from "./cursor";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATIONS_PAGE_SIZE,
  notificationFilterArguments,
  notificationInboxPage,
  notificationListHref,
  notificationPageCounts,
  notificationVisual,
  readNotificationFilters,
} from "./notifications";

const community = "44444444-4444-4444-8444-444444444444";
const cursor = {
  created_at: "2026-09-08T12:34:56.123456+00:00",
  id: community,
};
const filters = {
  unreadOnly: true,
  type: "reply" as const,
  communityId: community,
};
const row = (index: number, href = "/perfil"): Tables<"notifications"> => ({
  id: `64000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
  created_at: cursor.created_at,
  recipient_id: community,
  actor_id: null,
  type: "reply",
  title: "Respuesta",
  body: null,
  href,
  entity_type: null,
  entity_id: null,
  community_id: null,
  dedupe_key: null,
  read_at: null,
});

describe("notification filters and pagination", () => {
  it("preserves every filter and the precise cursor across pages", () => {
    const next = new URL(
      notificationListHref(filters, cursor),
      "https://agorbis.test",
    );
    expect(readNotificationFilters(next.searchParams)).toEqual(filters);
    expect(readCursor(next.searchParams)).toEqual(cursor);
    const first = new URL(notificationListHref(filters), next.origin);
    expect(readNotificationFilters(first.searchParams)).toEqual(filters);
    expect(readCursor(first.searchParams)).toBeNull();
  });

  it("passes the same validated filters to the inbox and mark-read RPCs", () => {
    expect(notificationFilterArguments(filters)).toEqual({
      p_unread_only: true,
      p_type: "reply",
      p_community_id: community,
    });
    expect(
      readNotificationFilters(
        new URLSearchParams({
          sin_leer: "true",
          tipo: "reply),recipient_id.neq.0",
          comunidad: "not-a-uuid",
        }),
      ),
    ).toEqual({ unreadOnly: false, type: "", communityId: "" });
    expect(
      notificationFilterArguments(
        readNotificationFilters(new URLSearchParams()),
      ),
    ).toEqual({
      p_unread_only: false,
      p_type: undefined,
      p_community_id: undefined,
    });
  });

  it("does not offer an empty next page when the last page is full", () => {
    const items = Array.from({ length: NOTIFICATIONS_PAGE_SIZE }, (_, index) =>
      row(index),
    );
    expect(
      notificationInboxPage({ items, total: 50, unread: 0, has_more: false })
        .nextCursor,
    ).toBeUndefined();
    expect(
      notificationInboxPage({ items, total: 51, unread: 0, has_more: true })
        .nextCursor,
    ).toEqual({
      created_at: cursor.created_at,
      id: items.at(-1)!.id,
    });
  });

  it("keeps counts from the whole filtered inbox and sanitizes destinations", () => {
    const inbox = notificationInboxPage({
      items: [row(1, "https://attacker.invalid")],
      total: 73,
      unread: 60,
      has_more: false,
    });
    expect(inbox).toMatchObject({
      total: 73,
      unread: 60,
      nextCursor: undefined,
    });
    expect(inbox.items[0]?.href).toBe("/notificaciones");
    expect(
      notificationListHref({ unreadOnly: false, type: "", communityId: "" }),
    ).toBe("/notificaciones");
  });

  it("summarizes only the visible page, including old and already-read notifications", () => {
    const inbox = notificationInboxPage({
      items: [
        { ...row(1), type: "claim_update", created_at: "2025-01-01T12:00:00Z" },
        { ...row(2), type: "reply", read_at: cursor.created_at },
        { ...row(3), type: "institutional_response" },
        { ...row(4), type: "poll_closed" },
        { ...row(5), type: "project_update", read_at: cursor.created_at },
        { ...row(6), type: "essential" },
      ],
      total: 73,
      unread: 60,
      has_more: true,
    });
    expect(notificationPageCounts(inbox.items)).toEqual({
      shown: 6,
      unread: 4,
      claims: 1,
      replies: 1,
      institutional: 1,
      polls: 1,
    });
    expect(inbox.total).toBe(73);
    expect(inbox.unread).toBe(60);
    expect(notificationPageCounts([])).toEqual({
      shown: 0, unread: 0, claims: 0, replies: 0, institutional: 0, polls: 0,
    });
  });

  it.each([
    null,
    {},
    { items: [], total: 0, unread: 1, has_more: false },
    { items: [], total: -1, unread: 0, has_more: false },
  ])("rejects incomplete or impossible inbox counts: %j", (value) => {
    expect(() => notificationInboxPage(value)).toThrow("respuesta incompleta");
  });

  it("starts with all optional updates enabled and exposes no critical mute preference", () => {
    expect(Object.values(DEFAULT_NOTIFICATION_PREFERENCES).every(Boolean)).toBe(
      true,
    );
    expect(Object.keys(DEFAULT_NOTIFICATION_PREFERENCES).sort()).toEqual([
      "claim_updates",
      "institutional_responses",
      "poll_results",
      "project_updates",
      "replies",
    ]);
  });
});

describe("notification visual", () => {
  const neutral = "bg-muted text-ink-muted";

  it("marks an institutional response as official before the content it answers", () => {
    for (const entity of ["claim", "poll", "debate", "project", null]) {
      expect(notificationVisual("institutional_response", entity)).toEqual({
        icon: "building",
        tone: "bg-brand-50 text-brand dark:bg-brand-950/40",
      });
    }
  });

  it("composes the soft background and the text color of the content kind", () => {
    expect(notificationVisual("reply", "debate")).toEqual({
      icon: "chat",
      tone: "bg-kind-debate-bg text-kind-debate-text",
    });
  });

  // Los pares tipo y entidad que escriben los triggers de la base.
  it.each([
    ["reply", "debate", "chat"],
    ["reply", "project", "hammer"],
    ["poll_closed", "poll", "ballot"],
    ["claim_update", "claim", "megaphone"],
    ["claim_escalated", "claim", "megaphone"],
    ["project_update", "project", "hammer"],
    ["status_change", "poll", "ballot"],
    ["status_change", "claim", "megaphone"],
    ["status_change", "project", "hammer"],
  ] as const)(
    "takes the icon and tone of the content kind: %s on a %s",
    (type, entity, icon) => {
      const { bg, text } = CONTENT_KIND_TONES[entity];
      expect(notificationVisual(type, entity)).toEqual({
        icon,
        tone: `${bg} ${text}`,
      });
    },
  );

  it.each([
    ["account_suspended", "user_suspension", "shield"],
    ["account_suspension_lifted", "user_suspension", "shield"],
    ["appeal_submitted", "moderation_appeal", "shield"],
    ["appeal_resolved", "moderation_appeal", "shield"],
    ["appeal_queue", "moderation_appeal", "shield"],
    ["report_queue", "report", "shield"],
    ["report_resolved", "report", "shield"],
    ["request_update", "request", "file-text"],
    ["request_queue", "community_request", "file-text"],
    ["request_queue", "organization_request", "file-text"],
    ["reply", null, "bell"],
    ["future_type", "unknown_entity", "bell"],
  ] as const)(
    "keeps account, moderation and requests neutral: %s on %s",
    (type, entity, icon) => {
      expect(notificationVisual(type, entity)).toEqual({ icon, tone: neutral });
    },
  );
});
