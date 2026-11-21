import { component$ } from "@qwik.dev/core";
import { useHttpStatus, type DocumentHead } from "@qwik.dev/router";
import { HttpErrorPage } from "~/components/layout/HttpErrorPage";
import { APP_NAME } from "~/lib/constants";

export default component$(() => {
  const error = useHttpStatus();
  return <HttpErrorPage status={error.status || 500} />;
});

export const head: DocumentHead = ({ status }) => ({
  title: `${status >= 500 ? "Error temporal" : "Solicitud no disponible"} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
