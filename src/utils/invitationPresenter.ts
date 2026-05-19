import type { InvitationInitiator } from "@prisma/client";

/** Who sent the invitation — consultant (enterprise) or mobile client user. */
export type InvitationSenderType = "consultant" | "mobile_user";

/** Relative to the API consumer (mobile user or consultant). */
export type InvitationDirection = "incoming" | "outgoing";

export function invitationSenderType(
  initiator: InvitationInitiator | string,
): InvitationSenderType {
  return initiator === "client_to_consultant" ? "mobile_user" : "consultant";
}

export type InvitationInitiatorValue =
  | "consultant_to_client"
  | "client_to_consultant";

function normalizeInitiator(
  initiator: InvitationInitiator | InvitationInitiatorValue | string,
): InvitationInitiatorValue {
  return initiator === "client_to_consultant"
    ? "client_to_consultant"
    : "consultant_to_client";
}

export function invitationSenderFields(
  initiator: InvitationInitiator | InvitationInitiatorValue | string,
): {
  initiator: InvitationInitiatorValue;
  senderType: InvitationSenderType;
} {
  const value = normalizeInitiator(initiator);
  return {
    initiator: value,
    senderType: invitationSenderType(value),
  };
}

/** Mobile app: consultant invited me = incoming; I requested consultant = outgoing. */
export function invitationDirectionForMobile(
  initiator: InvitationInitiator | InvitationInitiatorValue | string,
): InvitationDirection {
  return normalizeInitiator(initiator) === "consultant_to_client"
    ? "incoming"
    : "outgoing";
}

/** Enterprise app: I invited client = outgoing; client requested me = incoming. */
export function invitationDirectionForConsultant(
  initiator: InvitationInitiator | InvitationInitiatorValue | string,
): InvitationDirection {
  return normalizeInitiator(initiator) === "client_to_consultant"
    ? "incoming"
    : "outgoing";
}

export function invitationFieldsForMobile(
  initiator: InvitationInitiator | InvitationInitiatorValue | string,
) {
  const base = invitationSenderFields(initiator);
  return {
    ...base,
    direction: invitationDirectionForMobile(base.initiator),
  };
}

export function invitationFieldsForConsultant(
  initiator: InvitationInitiator | InvitationInitiatorValue | string,
) {
  const base = invitationSenderFields(initiator);
  return {
    ...base,
    direction: invitationDirectionForConsultant(base.initiator),
  };
}

export function parseInvitationSenderTypeFilter(
  value: string | undefined,
): InvitationSenderType | undefined {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "consultant" || v === "mobile_user") return v;
  return undefined;
}

export function parseInvitationDirectionFilter(
  value: string | undefined,
): InvitationDirection | undefined {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "incoming" || v === "outgoing") return v;
  return undefined;
}
