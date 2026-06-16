export type CardInventoryRecord = {
  card_number: string;
  cvv: string;
  expiry_month?: string | null;
  expiry_year?: string | null;
  card_type?: string | null;
};

export const getCardTypeLabel = (cardType?: string | null) => {
  if (cardType === "physical") return "Physical";
  if (cardType === "free") return "Free";
  return "Virtual";
};

const getLastFourDigits = (cardNumber: string) => {
  const digits = cardNumber.replace(/\D/g, "");
  return digits.slice(-4);
};

export const formatMaskedCardDetails = (
  inventory: CardInventoryRecord,
  holderName: string,
  fallbackType?: string | null
) => {
  const last4 = getLastFourDigits(inventory.card_number);

  return {
    cardNumber: `xxxxxxxxxxxx${last4}`,
    cvv: "xxx",
    holderName: holderName || "Celestor User",
    type: getCardTypeLabel(inventory.card_type || fallbackType),
  };
};

export const formatFullCardDetails = (
  inventory: CardInventoryRecord,
  holderName: string,
  fallbackType?: string | null
) => {
  return {
    cardNumber: inventory.card_number,
    cvv: inventory.cvv,
    holderName: holderName || "Celestor User",
    type: getCardTypeLabel(inventory.card_type || fallbackType),
  };
};