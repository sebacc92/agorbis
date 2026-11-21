import { enCivicImprovements } from "./civic-improvements";
import { enDeletionRequests } from "./deletion-requests";
import { enSearchProfileImprovements } from "./search-profile-improvements";
import { enNotificationImprovements } from "./notification-improvements";
import type { Messages } from "../types";
import { enAgreements } from "./agreements";
import { enAi } from "./ai";
import { enFormImprovements } from "./form-improvements";
import { enAuth } from "./auth";
import { enGoogleConsent } from "./google-consent";
import { enDataDeletion } from "./data-deletion";
import { enAccount } from "./account";
import { enBudget } from "./budget";
import { enClaims } from "./claims";
import { enCommunity } from "./community";
import { enContrast } from "./contrast";
import { enDebates } from "./debates";
import { enInstitutions } from "./institutions";
import { enModeration } from "./moderation";
import { enManual } from "./manual";
import { enPolls } from "./polls";
import { enProjects } from "./projects";
import { enProduction } from "./production";
import { enShared } from "./shared";
import { enSupport } from "./support";
import { enDesignHome } from "./design-home";
import { enDesignCommunity } from "./design-community";
import { enDesignExplore } from "./design-explore";
import { enDesignContent } from "./design-content";
import { enDesignDetail } from "./design-detail";
import { enDesignDebate } from "./design-debate";
import { enDesignNav } from "./design-nav";
import { enDesignProfile } from "./design-profile";
import { enDesignLanding } from "./design-landing";
import { enDesignPortada } from "./design-portada";
import { enDesignListados } from "./design-listados";
import { enDesignGlifos } from "./design-glifos";
import { enDesignR4Busqueda } from "./design-r4-busqueda";
import { enDesignR4Mapa } from "./design-r4-mapa";
import { enDesignR5 } from "./design-r5";
import { enDesignR4Herramientas } from "./design-r4-herramientas";
import { enDesignR4Etapas } from "./design-r4-etapas";
import { enDesignR4Reclamo } from "./design-r4-reclamo";
import { enDesignR4Proyecto } from "./design-r4-proyecto";
import { enDesignR4Debate } from "./design-r4-debate";
import { enDesignR4Perfil } from "./design-r4-perfil";
import { enDesignR4Controles } from "./design-r4-controles";
import { enDesignR4Notificaciones } from "./design-r4-notificaciones";

export const enMessages: Messages = {
  ...enAi,
  ...enShared,
  ...enSupport,
  ...enCommunity,
  ...enPolls,
  ...enDebates,
  ...enClaims,
  ...enProjects,
  ...enBudget,
  ...enContrast,
  ...enAccount,
  ...enDataDeletion,
  ...enAuth,
  ...enGoogleConsent,
  ...enFormImprovements,
  ...enDeletionRequests,
  ...enSearchProfileImprovements,
  ...enNotificationImprovements,
  ...enInstitutions,
  ...enModeration,
  ...enManual,
  ...enProduction,
  ...enCivicImprovements,
  ...enAgreements,
  ...enDesignHome,
  ...enDesignCommunity,
  ...enDesignExplore,
  ...enDesignContent,
  ...enDesignDetail,
  ...enDesignDebate,
  ...enDesignNav,
  ...enDesignProfile,
  ...enDesignLanding,
  ...enDesignPortada,
  ...enDesignListados,
  ...enDesignGlifos,
  ...enDesignR4Busqueda,
  ...enDesignR4Mapa,
  ...enDesignR5,
  ...enDesignR4Herramientas,
  ...enDesignR4Etapas,
  ...enDesignR4Reclamo,
  ...enDesignR4Proyecto,
  ...enDesignR4Debate,
  ...enDesignR4Perfil,
  ...enDesignR4Controles,
  ...enDesignR4Notificaciones,
};
