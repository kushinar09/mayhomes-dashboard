export interface Bitrix24Lead {
  ID: string;
  TITLE: string;
  NAME?: string;
  LAST_NAME?: string;
  SECOND_NAME?: string;
  STATUS_ID: string;
  STATUS_NAME?: string;
  STATUS_DESCRIPTION?: string; // Deprecated, use STATUS_NAME instead
  SOURCE_ID?: string;
  SOURCE_NAME?: string;
  SOURCE_DESCRIPTION?: string; // Deprecated, use SOURCE_NAME instead
  CURRENCY_ID: string;
  OPPORTUNITY: string;
  COMPANY_TITLE?: string;
  ASSIGNED_BY_ID: string;
  CREATED_BY_ID: string;
  DATE_CREATE: string;
  DATE_MODIFY: string;
  BIRTHDATE?: string;
  EMAIL?: Array<{ VALUE: string; VALUE_TYPE: string }>;
  PHONE?: Array<{ VALUE: string; VALUE_TYPE: string }>;
  [key: string]: unknown;
}

export interface Bitrix24LeadResponse {
  result: Bitrix24Lead[];
  total: number;
  next?: number;
}

export interface Bitrix24LeadApiResponse {
  result: Bitrix24Lead[] | Bitrix24LeadResponse;
  total?: number;
  next?: number;
}

