/** Refleja add_claim_event_with_status; la base vuelve a comprobar cada acción. */
export function claimEventPermissions(input: {
  isAuthor: boolean;
  isModerator: boolean;
  representsResponsibleOrganization: boolean;
}) {
  const official = input.isModerator || input.representsResponsibleOrganization;
  return {
    canUpdate: input.isAuthor || official,
    canRespondOfficially: official,
    canChangeStatus: official,
  };
}
