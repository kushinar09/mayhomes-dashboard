export interface Bitrix24Deal {
  ID: string;
  TITLE: string;
  STAGE_ID: string;
  CURRENCY_ID: string;
  OPPORTUNITY: string;
  BEGINDATE: string;
  CLOSEDATE: string;
  ASSIGNED_BY_ID: string;
  CREATED_BY_ID: string;
  DATE_CREATE: string;
  DATE_MODIFY: string;
  [key: string]: any;
}

export interface Bitrix24DealResponse {
  result: Bitrix24Deal[];
  total: number;
  next?: number;
}

export interface Bitrix24ApiResponse {
  result: Bitrix24Deal[] | Bitrix24DealResponse;
  total?: number;
  next?: number;
}
