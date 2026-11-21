import { component$ } from "@qwik.dev/core";
import type { DocumentHead } from "@qwik.dev/router";
import { HttpErrorPage } from "~/components/layout/HttpErrorPage";
import { APP_NAME } from "~/lib/constants";

export default component$(() => <HttpErrorPage status={404} />);

export const head: DocumentHead = {
  title: `Página no encontrada · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
};
